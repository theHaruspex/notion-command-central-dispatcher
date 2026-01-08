import type { RequestContext } from "../../lib/logging";
import { authenticateAndNormalizeWebhook } from "../../lib/webhook";
import { loadConfig } from "../../lib/config";
import { normalizeNotionId } from "../../lib/notion/utils";
import { getEventsConfigSnapshot } from "./configDatabase";
import { createPage } from "./notion";

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

  if (!row) {
    ctx.log("warn", "skipped_no_config", { origin_database_id: webhookEvent.originDatabaseId });
    return { ok: true, request_id: ctx.requestId, created: 0, skipped: true, reason: "no_config" };
  }

  if (!row.enabled) {
    ctx.log("warn", "skipped_disabled", { origin_database_id: webhookEvent.originDatabaseId });
    return { ok: true, request_id: ctx.requestId, created: 0, skipped: true, reason: "disabled" };
  }

  const propName = row.statePropertyName;
  const prop = webhookEvent.properties[propName];

  let stateValue = "";
  if (prop && typeof prop === "object" && (prop as any).type === "status") {
    stateValue = ((prop as any).status?.name as string | undefined) ?? "";
  }

  if (!stateValue) {
    ctx.log("warn", "skipped_no_state_value", { propName: row.statePropertyName });
    return { ok: true, request_id: ctx.requestId, created: 0, skipped: true, reason: "no_state_value" };
  }

  function extractTitleFromWebhookProperties(props: Record<string, any>): string {
    for (const p of Object.values(props)) {
      if (p && typeof p === "object" && (p as any).type === "title" && Array.isArray((p as any).title)) {
        return (p as any).title.map((t: any) => t.plain_text || t.text?.content || "").join("");
      }
    }
    return "";
  }

  function rt(content: string) {
    return { rich_text: [{ text: { content } }] };
  }

  const originPageName = extractTitleFromWebhookProperties(webhookEvent.properties);

  const receivedAtIso = new Date().toISOString();
  const eventTimeIso = webhookEvent.originLastEditedTime ?? receivedAtIso;
  const eventUid = webhookEvent.sourceEventId ?? `${webhookEvent.originPageId}:${eventTimeIso}`;

  await createPage({
    parentDatabaseId: cfg.eventsDbId,
    properties: {
      title: { title: [{ type: "text", text: { content: eventUid } }] },
      "Event Kind": { select: { name: "state_change" } },
      "Event Time": { date: { start: eventTimeIso } },
      "Received At": { date: { start: receivedAtIso } },
      "Request ID": rt(ctx.requestId),
      "Source Event ID": rt(webhookEvent.sourceEventId ?? ""),
      "Origin Database ID": rt(webhookEvent.originDatabaseId),
      "Origin Database Name": rt(row.originDatabaseName),
      "Origin Page ID": rt(webhookEvent.originPageId),
      "Origin Page Name": rt(originPageName),
      "Origin Page URL": { url: webhookEvent.originPageUrl ?? null },
      "State Property Name": rt(row.statePropertyName),
      "State Value": rt(stateValue),
      Attempt: { number: webhookEvent.attempt ?? 1 },
    },
  });

  ctx.log("info", "event_created", {
    origin_database_id: webhookEvent.originDatabaseId,
    origin_page_id: webhookEvent.originPageId,
    state_property_name: row.statePropertyName,
    state_value: stateValue,
  });

  return { ok: true, request_id: ctx.requestId, created: 1, skipped: false };
}


