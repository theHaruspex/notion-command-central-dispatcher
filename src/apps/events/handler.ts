import type { RequestContext } from "../../lib/logging";
import { authenticateAndNormalizeWebhook } from "../../lib/webhook";
import { loadConfig } from "../../lib/config";
import { normalizeNotionId } from "../../lib/notion/utils";
import { WebhookParseError } from "../../lib/webhook/errors";
import { enqueueEventsJob } from "./queue";
import { extractStateValueFromWebhookProperties, extractTitleFromWebhookProperties } from "./ingest/extractors";
import { extractFirstRelationIdFromWebhookProperties } from "./ingest/extractRelation";
import { isDuplicateEvent } from "./dedupe";
import { resolveEventsConfigForWebhook } from "./config/loadEventsConfig";
import { getWorkflowDefinitionMeta } from "./workflowDefinitions/getWorkflowDefinition";
import { ensureWorkflowRecordWithMeta } from "./workflowRecords/ensureWorkflowRecord";
import { createEvent } from "./write/createEvent";
import { dateIso, rt, title, urlValue } from "./util/notionProps";
import { updatePage, getPage } from "./notion";

export async function handleEventsWebhook(args: {
  ctx: RequestContext;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}): Promise<any> {
  const { ctx, headers, body } = args;

  ctx.log("info", "webhook_received");

  return await enqueueEventsJob(async () => {
    const cfg = loadConfig().events;
    if (!cfg.eventsDbId) {
      throw new Error("EVENTS_DB_ID is not configured");
    }
    if (!cfg.eventsConfigDbId) {
      throw new Error("EVENTS_CONFIG_DB_ID is not configured");
    }
    if (!cfg.workflowRecordsDbId) {
      throw new Error("WORKFLOW_RECORDS_DB_ID is not configured");
    }

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

    // Resolve workflow instance page based on workflow type
    let workflowInstancePageId: string;
    let workflowInstancePageName: string;
    let workflowInstancePageUrl: string | null;

    if (def.workflowType === "single_object") {
      // For single_object, workflow instance == origin page
      workflowInstancePageId = webhookEvent.originPageId;
      workflowInstancePageName = originPageName;
      workflowInstancePageUrl = webhookEvent.originPageUrl ?? null;
    } else {
      // For multi_object, resolve from container property
      if (!def.containerPropertyName) {
        ctx.log("warn", "skipped_container_property_not_configured", {
          workflow_definition_id: resolved.workflowDefinitionId,
          origin_database_id: originDatabaseIdKey,
          origin_page_id: originPageIdKey,
        });
        return { ok: true, request_id: ctx.requestId, skipped: true, reason: "container_property_not_configured" };
      }

      const containerId = extractFirstRelationIdFromWebhookProperties(webhookEvent.properties, def.containerPropertyName);
      if (!containerId) {
        ctx.log("warn", "skipped_container_relation_missing", {
          container_property_name: def.containerPropertyName,
          workflow_definition_id: resolved.workflowDefinitionId,
          origin_database_id: originDatabaseIdKey,
          origin_page_id: originPageIdKey,
        });
        return { ok: true, request_id: ctx.requestId, skipped: true, reason: "container_relation_missing" };
      }

      workflowInstancePageId = containerId;
      const instancePage = await getPage(workflowInstancePageId);
      workflowInstancePageName = extractTitleFromWebhookProperties(instancePage.properties);
      workflowInstancePageUrl = instancePage.url ?? null;
    }

    const workflowInstancePageIdKey = normalizeNotionId(workflowInstancePageId);

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

    await createEvent({
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
  });
}


