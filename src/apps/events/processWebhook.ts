import type { RequestContext } from "../../lib/logging";
import { authenticateAndNormalizeWebhook } from "../../lib/webhook";
import { normalizeNotionId } from "../../lib/notion/utils";
import { WebhookParseError } from "../../lib/webhook/errors";
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
import { ensureWorkflowRecordWithMeta } from "./workflowRecords/ensureWorkflowRecord";
import { writeEventLogEntry } from "./eventLog/writeEventLogEntry";
import { dateIso, rt, title, urlValue } from "./util/notionProps";
import { updatePage } from "./notion";
import { loadEventsRuntimeConfig } from "./runtimeConfig/loadEventsRuntimeConfig";

export async function processEventsWebhook(args: {
  ctx: RequestContext;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}): Promise<any> {
  const { ctx, headers, body } = args;

  const cfg = loadEventsRuntimeConfig();

  const webhookEvent = await authenticateAndNormalizeWebhook({ headers, body });

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

  const resolved = await resolveEventsConfigForWebhook({
    eventsConfigDbId: cfg.eventsConfigDbId,
    originDatabaseId: originDatabaseIdKey,
    webhookProperties: webhookEvent.properties,
  });

  if (!resolved) {
    ctx.log("warn", "skipped_no_matching_events_config", {
      origin_database_id: originDatabaseIdKey,
      origin_page_id: originPageIdKey,
    });
    return { ok: true, request_id: ctx.requestId, skipped: true, reason: "no_matching_events_config" };
  }

  const def = await getWorkflowDefinitionMeta(resolved.workflowDefinitionId);

  if (!def.enabled) {
    ctx.log("info", "skipped_workflow_definition_disabled", {
      workflow_definition_id: resolved.workflowDefinitionId,
      origin_database_id: originDatabaseIdKey,
      origin_page_id: originPageIdKey,
    });
    return { ok: true, request_id: ctx.requestId, skipped: true, reason: "workflow_definition_disabled" };
  }

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

  let workflowInstance: { workflowInstancePageId: string; workflowInstancePageIdKey: string; workflowInstancePageName: string; workflowInstancePageUrl: string | null };
  try {
    workflowInstance = await resolveWorkflowInstance({ def, webhookEvent, originPageName });
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

  const duplicate = await isDuplicateEvent(cfg.eventsDbId, eventUid);
  if (duplicate) {
    ctx.log("info", "event_deduped", { event_uid: eventUid, attempt });
    return { ok: true, request_id: ctx.requestId, deduped: true };
  }

  const ensure = await ensureWorkflowRecordWithMeta({
    workflowRecordsDbId: cfg.workflowRecordsDbId,
    workflowDefinitionId: resolved.workflowDefinitionId,
    workflowInstancePageId,
    workflowInstancePageName,
    workflowInstancePageUrl,
    originDatabaseId: originDatabaseIdKey,
    stateValue,
    eventTimeIso,
  });

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

  await writeEventLogEntry({
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
  });

  await updatePage({
    pageId: ensure.workflowRecordId,
    properties: {
      "Last Event Time": dateIso(eventTimeIso),
      "Current Stage": rt(stateValue),
    },
  });

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

