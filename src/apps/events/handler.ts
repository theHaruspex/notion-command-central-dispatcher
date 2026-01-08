import type { RequestContext } from "../../lib/logging";
import { authenticateAndNormalizeWebhook } from "../../lib/webhook";
import { loadConfig } from "../../lib/config";
import { normalizeNotionId } from "../../lib/notion/utils";
import { getEventsConfigSnapshot } from "./configDatabase";
import { extractStatusNameFromWebhookProperties } from "./ingest/extractors";
import { shouldCaptureEvent } from "./ingest/shouldCapture";
import { buildEventProps } from "./ingest/buildEventProps";
import { createEvent } from "./write/createEvent";

export async function handleEventsWebhook(args: {
  ctx: RequestContext;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}): Promise<any> {
  const { ctx, headers, body } = args;

  ctx.log("info", "webhook_received");

  const cfg = loadConfig().events;
  if (!cfg.eventsDbId) {
    throw new Error("EVENTS_DB_ID is not configured");
  }
  if (!cfg.eventsConfigDbId) {
    throw new Error("EVENTS_CONFIG_DB_ID is not configured");
  }

  const webhookEvent = await authenticateAndNormalizeWebhook({ headers, body });
  const originDatabaseIdKey = normalizeNotionId(webhookEvent.originDatabaseId);

  const snapshot = await getEventsConfigSnapshot();
  const row = snapshot.byOriginDatabaseId[originDatabaseIdKey];

  const statePropName = row?.statePropertyName ?? "";
  const stateValue = row
    ? extractStatusNameFromWebhookProperties(webhookEvent.properties, statePropName)
    : "";

  const decision = shouldCaptureEvent({
    row,
    originDatabaseIdRaw: webhookEvent.originDatabaseId,
    stateValue,
  });

  if (!decision.ok) {
    ctx.log("warn", `skipped_${decision.reason}`, decision.logFields);
    return { ok: true, request_id: ctx.requestId, created: 0, skipped: true, reason: decision.reason };
  }

  // decision.ok implies row exists
  const { properties } = buildEventProps({
    ctx,
    webhookEvent,
    row: row!,
    stateValue,
  });

  await createEvent({ eventsDbId: cfg.eventsDbId, properties });

  ctx.log("info", "event_created", {
    origin_database_id: webhookEvent.originDatabaseId,
    origin_page_id: webhookEvent.originPageId,
    state_property_name: row!.statePropertyName,
    state_value: stateValue,
  });

  return { ok: true, request_id: ctx.requestId, created: 1, skipped: false };
}


