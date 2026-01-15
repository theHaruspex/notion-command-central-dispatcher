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
  try {
    const result = await fn();
    ctx.log("info", "events_step_completed", {
      step,
      duration_ms: Date.now() - startedAt,
      ...(extra ?? {}),
    });
    return result;
  } catch (err) {
    ctx.log("error", "events_step_failed", {
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
        eventsConfigDbId: cfg.eventsConfigDbId,
        originDatabaseId: originDatabaseIdKey,
        webhookProperties: webhookEvent.properties,
      }),
    { origin_database_id: originDatabaseIdKey },
  );

  if (!resolved) {
    ctx.log("warn", "skipped_no_matching_events_config", {
      origin_database_id: originDatabaseIdKey,
      origin_database_id_key: originDatabaseIdKey,
      origin_database_id_raw: webhookEvent.originDatabaseId,
      origin_page_id: originPageIdKey,
      webhook_property_keys_count: Object.keys(webhookEvent.properties).length,
    });
    return { ok: true, request_id: ctx.requestId, skipped: true, reason: "no_matching_events_config" };
  }

  if (!resolved.statePropertyPresent) {
    ctx.log("warn", "matched_events_config_but_state_property_missing_in_payload", {
      workflow_definition_id: resolved.workflowDefinitionId,
      origin_database_id: originDatabaseIdKey,
      origin_page_id: originPageIdKey,
      state_property_name: resolved.statePropertyName,
      webhook_property_keys_sample: Object.keys(webhookEvent.properties).slice(0, 10),
    });
  }

  // 5) load workflow definition
  const def = await timeStep(ctx, "get_workflow_definition", () =>
    getWorkflowDefinitionMeta(resolved.workflowDefinitionId),
  );

  if (!def.enabled) {
    ctx.log("info", "skipped_workflow_definition_disabled", {
      workflow_definition_id: resolved.workflowDefinitionId,
      origin_database_id: originDatabaseIdKey,
      origin_page_id: originPageIdKey,
    });
    return { ok: true, request_id: ctx.requestId, skipped: true, reason: "workflow_definition_disabled" };
  }

  // 6) extract state value (and validate missing/empty exactly as before)
  const stateValueOrNull = extractStateValueFromWebhookProperties(webhookEvent.properties, resolved.statePropertyName);
  if (stateValueOrNull === null) {
    ctx.log("warn", "skipped_state_property_missing", {
      origin_database_id: originDatabaseIdKey,
      origin_page_id: originPageIdKey,
      state_property_name: resolved.statePropertyName,
    });
    return { ok: true, request_id: ctx.requestId, skipped: true, reason: "state_property_missing" };
  }

  const stateValue = stateValueOrNull;
  if (!stateValue) {
    ctx.log("warn", "skipped_no_state_value", {
      origin_database_id: originDatabaseIdKey,
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
      () => resolveWorkflowInstance({ def, webhookEvent, originPageName }),
      { workflow_type: def.workflowType },
    );
  } catch (err) {
    if (err instanceof ContainerPropertyNotConfiguredError) {
      ctx.log("warn", "skipped_container_property_not_configured", {
        workflow_definition_id: resolved.workflowDefinitionId,
        origin_database_id: originDatabaseIdKey,
        origin_page_id: originPageIdKey,
      });
      return { ok: true, request_id: ctx.requestId, skipped: true, reason: "container_property_not_configured" };
    }
    if (err instanceof ContainerRelationMissingError) {
      ctx.log("warn", "skipped_container_relation_missing", {
        container_property_name: def.containerPropertyName,
        workflow_definition_id: resolved.workflowDefinitionId,
        origin_database_id: originDatabaseIdKey,
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

  // 8) dedupe decision
  const duplicate = await timeStep(ctx, "dedupe_event", () => isDuplicateEvent(cfg.eventsDbId, eventUid));
  if (duplicate) {
    ctx.log("info", "event_deduped", { event_uid: eventUid, attempt });
    return { ok: true, request_id: ctx.requestId, deduped: true };
  }

  // 9) ensure workflow record (log created vs reused exactly as before)
  const ensure = await timeStep(ctx, "ensure_workflow_record", () =>
    ensureWorkflowRecordWithMeta({
      workflowRecordsDbId: cfg.workflowRecordsDbId,
      workflowDefinitionId: resolved.workflowDefinitionId,
      workflowInstancePageId,
      workflowInstancePageName,
      workflowInstancePageUrl,
      originDatabaseId: originDatabaseIdKey,
      stateValue,
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
  ctx.log(ensure.created ? "info" : "info", ensure.created ? "workflow_record_created" : "workflow_record_reused", logFields);

  // 10) write event log entry
  await timeStep(ctx, "write_event_log_entry", () =>
    writeEventLogEntry({
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
        "Workflow Records": { relation: [{ id: ensure.workflowRecordId }] },
      },
    }),
  );

  // 11) update workflow record projection
  await timeStep(ctx, "update_workflow_record_projection", () =>
    updateWorkflowRecordProjection({
      workflowRecordId: ensure.workflowRecordId,
      eventTimeIso,
      stateValue,
    }),
  );

  // 12) log event_created and return the same response object
  ctx.log("info", "event_created", {
    event_uid: eventUid,
    workflow_record_id: ensure.workflowRecordId,
    origin_database_id: originDatabaseIdKey,
    origin_page_id: originPageIdKey,
    state_property_name: resolved.statePropertyName,
    state_value: stateValue,
  });

  return { ok: true, request_id: ctx.requestId, deduped: false, workflow_record_id: ensure.workflowRecordId };
}

