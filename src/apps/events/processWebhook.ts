import type { RequestContext } from "../../lib/logging";
import { authenticateAndNormalizeWebhook } from "../../lib/webhook";
import { normalizeNotionId } from "../../lib/notion/utils";
import { WebhookParseError } from "../../lib/webhook/errors";
import type { WorkflowInstance } from "./domain";
import { extractTitleFromWebhookProperties } from "./ingest/extractTitleFromProps";
import { extractStateValueFromWebhookProperties } from "./ingest/extractStateValueFromProps";
import { isDuplicateEvent } from "./eventLog/isDuplicateEvent";
import { resolveEventsConfigForWebhook } from "./routing/resolveWorkflowRouting";
import { getWorkflowDefinitionMeta } from "./workflow/getWorkflowDefinitionMeta";
import {
  ContainerPropertyNotConfiguredError,
  ContainerRelationMissingError,
  resolveWorkflowInstance,
} from "./workflow/resolveWorkflowInstance";
import { resolveWorkflowStepId } from "./workflow/resolveWorkflowStep";
import { ensureWorkflowRecordWithMeta } from "./records/ensureWorkflowRecord";
import { writeEventLogEntry } from "./eventLog/writeEventLogEntry";
import { dateIso, rt, title, urlValue } from "./util/notionProps";
import { updateWorkflowRecordProjection } from "./records/updateWorkflowRecordProjection";
import { loadEventsRuntimeConfig } from "./runtimeConfig/loadEventsRuntimeConfig";

async function timeStep<T>(
  ctx: RequestContext,
  step: string,
  fn: () => Promise<T>,
  extra?: Record<string, unknown>,
): Promise<T> {
  const startedAt = Date.now();
  const stepCtx = ctx.withDomain("steps");
  try {
    const result = await fn();
    stepCtx.log("info", "completed", {
      step,
      duration_ms: Date.now() - startedAt,
      ...(extra ?? {}),
    });
    return result;
  } catch (err) {
    stepCtx.log("error", "failed", {
      step,
      duration_ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
      ...(extra ?? {}),
    });
    throw err;
  }
}

export async function processEventsWebhook(args: {
  ctx: RequestContext;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}): Promise<any> {
  const { ctx, headers, body } = args;
  const eventsCtx = ctx.withDomain("processing");

  // 1) load runtime config
  const cfg = loadEventsRuntimeConfig();

  // 2) auth+normalize webhook
  const webhookEvent = await timeStep(ctx, "auth_and_normalize_webhook", () =>
    authenticateAndNormalizeWebhook({ headers, body }),
  );

  // 3) compute EventsWebhookMeta
  const eventUid = webhookEvent.sourceEventId;
  if (!eventUid) {
    throw new WebhookParseError("Missing source event id on source.event_id");
  }
  const attempt = webhookEvent.attempt ?? 1;

  const receivedAtIso = new Date().toISOString();
  const eventTimeIso = webhookEvent.originLastEditedTime ?? receivedAtIso;

  const originDatabaseIdKey = normalizeNotionId(webhookEvent.originDatabaseId);
  const originPageIdKey = normalizeNotionId(webhookEvent.originPageId);
  const originPageName = extractTitleFromWebhookProperties(webhookEvent.properties);

  // 4) resolve routing
  const resolved = await timeStep(
    ctx,
    "resolve_routing",
    () =>
      resolveEventsConfigForWebhook({
        ctx,
        eventsConfigDbId: cfg.eventsConfigDbId,
        originDatabaseId: originDatabaseIdKey,
        webhookProperties: webhookEvent.properties,
      }),
    { origin_db: originDatabaseIdKey, origin_page_id: originPageIdKey },
  );

  if (!resolved) {
    eventsCtx.log("warn", "skipped_no_matching_events_config", {
      origin_db: originDatabaseIdKey,
      origin_db_raw: webhookEvent.originDatabaseId,
      origin_page_id: originPageIdKey,
      webhook_property_keys_count: Object.keys(webhookEvent.properties).length,
    });
    return { ok: true, request_id: ctx.requestId, skipped: true, reason: "no_matching_events_config" };
  }

  if (!resolved.statePropertyPresent) {
    eventsCtx.log("warn", "matched_events_config_but_state_property_missing_in_payload", {
      workflow_definition_id: resolved.workflowDefinitionId,
      origin_db: originDatabaseIdKey,
      origin_page_id: originPageIdKey,
      state_property_name: resolved.statePropertyName,
      webhook_property_keys_sample: Object.keys(webhookEvent.properties).slice(0, 10),
    });
  }

  // 5) load workflow definition
  const def = await timeStep(ctx, "get_workflow_definition", () =>
    getWorkflowDefinitionMeta(ctx, resolved.workflowDefinitionId),
  );

  if (!def.enabled) {
    eventsCtx.log("info", "skipped_workflow_definition_disabled", {
      workflow_definition_id: resolved.workflowDefinitionId,
      origin_db: originDatabaseIdKey,
      origin_page_id: originPageIdKey,
    });
    return { ok: true, request_id: ctx.requestId, skipped: true, reason: "workflow_definition_disabled" };
  }

  // 6) extract state value (and validate missing/empty exactly as before)
  const stateValueOrNull = extractStateValueFromWebhookProperties(webhookEvent.properties, resolved.statePropertyName);
  if (stateValueOrNull === null) {
    eventsCtx.log("warn", "skipped_state_property_missing", {
      origin_db: originDatabaseIdKey,
      origin_page_id: originPageIdKey,
      state_property_name: resolved.statePropertyName,
    });
    return { ok: true, request_id: ctx.requestId, skipped: true, reason: "state_property_missing" };
  }

  const stateValue = stateValueOrNull;
  if (!stateValue) {
    eventsCtx.log("warn", "skipped_no_state_value", {
      origin_db: originDatabaseIdKey,
      origin_page_id: originPageIdKey,
      state_property_name: resolved.statePropertyName,
    });
    return { ok: true, request_id: ctx.requestId, skipped: true, reason: "no_state_value" };
  }

  // 7) resolve workflow instance
  let workflowInstance: WorkflowInstance;
  try {
    workflowInstance = await timeStep(
      ctx,
      "resolve_workflow_instance",
      () => resolveWorkflowInstance({ ctx, def, webhookEvent, originPageName }),
      { workflow_type: def.workflowType },
    );
  } catch (err) {
    if (err instanceof ContainerPropertyNotConfiguredError) {
      eventsCtx.log("warn", "skipped_container_property_not_configured", {
        workflow_definition_id: resolved.workflowDefinitionId,
        origin_db: originDatabaseIdKey,
        origin_page_id: originPageIdKey,
      });
      return { ok: true, request_id: ctx.requestId, skipped: true, reason: "container_property_not_configured" };
    }
    if (err instanceof ContainerRelationMissingError) {
      eventsCtx.log("warn", "skipped_container_relation_missing", {
        container_property_name: def.containerPropertyName,
        workflow_definition_id: resolved.workflowDefinitionId,
        origin_db: originDatabaseIdKey,
        origin_page_id: originPageIdKey,
      });
      return { ok: true, request_id: ctx.requestId, skipped: true, reason: "container_relation_missing" };
    }
    throw err;
  }

  const workflowInstancePageId = workflowInstance.workflowInstancePageId;
  const workflowInstancePageIdKey = workflowInstance.workflowInstancePageIdKey;
  const workflowInstancePageName = workflowInstance.workflowInstancePageName;
  const workflowInstancePageUrl = workflowInstance.workflowInstancePageUrl;

  let workflowStepId: string | null = null;
  let resolveMode: "scan_relation" | "match_state_value" | "none" = "none";

  // 8) dedupe decision
  const duplicate = await timeStep(ctx, "dedupe_event", () =>
    isDuplicateEvent(ctx, cfg.eventsDbId, eventUid),
  );
  if (duplicate) {
    eventsCtx.log("info", "event_deduped", { event_uid: eventUid, attempt });
    return { ok: true, request_id: ctx.requestId, deduped: true };
  }

  const resolvedStep = await timeStep(
    ctx,
    "resolve_workflow_step",
    () => resolveWorkflowStepId({ ctx, def, webhookEvent, stateValue }),
    { workflow_type: def.workflowType },
  );
  workflowStepId = resolvedStep.workflowStepId;
  resolveMode = resolvedStep.resolveMode;

  // 9) ensure workflow record (log created vs reused exactly as before)
  const ensure = await timeStep(ctx, "ensure_workflow_record", () =>
    ensureWorkflowRecordWithMeta({
      ctx,
      workflowRecordsDbId: cfg.workflowRecordsDbId,
      workflowDefinitionId: resolved.workflowDefinitionId,
      workflowInstancePageId,
      workflowInstancePageName,
      workflowInstancePageUrl,
      originDatabaseId: originDatabaseIdKey,
      eventTimeIso,
    }),
  );

  const logFields: Record<string, any> = {
    workflow_record_id: ensure.workflowRecordId,
    workflow_definition_id: resolved.workflowDefinitionId,
    origin_page_id: originPageIdKey,
    workflow_instance_page_id: workflowInstancePageIdKey,
    workflow_type: def.workflowType,
  };
  if (def.workflowType === "multi_object") {
    logFields.container_property_name = def.containerPropertyName;
  }
  eventsCtx.log(
    ensure.created ? "info" : "info",
    ensure.created ? "workflow_record_created" : "workflow_record_reused",
    { ...logFields },
  );

  // 10) write event log entry
  await timeStep(ctx, "write_event_log_entry", () =>
    writeEventLogEntry({
      ctx,
      eventsDbId: cfg.eventsDbId,
      properties: {
        title: title(eventUid),
        Attempt: { number: attempt },
        "Event Time": dateIso(eventTimeIso),
        "Received At": dateIso(receivedAtIso),
        "Request ID": rt(ctx.requestId),
        "Source Event ID": rt(eventUid),
        "State Property Name": rt(resolved.statePropertyName),
        "State Value": rt(stateValue),
        "Origin Database ID": rt(originDatabaseIdKey),
        "Origin Database Name": rt(resolved.originDatabaseName ?? ""),
        "Origin Page ID": rt(originPageIdKey),
        "Origin Page Name": rt(originPageName),
        "Origin Page URL": urlValue(webhookEvent.originPageUrl ?? null),
        "Workflow Instance Page ID": rt(workflowInstancePageIdKey),
        "Workflow Definitions": { relation: [{ id: resolved.workflowDefinitionId }] },
        "Workflow Step": workflowStepId ? { relation: [{ id: workflowStepId }] } : { relation: [] },
        "Workflow Records": { relation: [{ id: ensure.workflowRecordId }] },
      },
    }),
  );

  // 11) update workflow record projection
  await timeStep(ctx, "update_workflow_record_projection", () =>
    updateWorkflowRecordProjection({
      ctx,
      workflowRecordId: ensure.workflowRecordId,
      eventTimeIso,
    }),
  );

  // 12) log event_created and return the same response object
  eventsCtx.log("info", "event_created", {
    event_uid: eventUid,
    workflow_record_id: ensure.workflowRecordId,
    origin_db: originDatabaseIdKey,
    origin_page_id: originPageIdKey,
    state_property_name: resolved.statePropertyName,
    state_value: stateValue,
    workflow_step_id: workflowStepId,
    workflow_step_resolve_mode: resolveMode,
  });

  return { ok: true, request_id: ctx.requestId, deduped: false, workflow_record_id: ensure.workflowRecordId };
}

