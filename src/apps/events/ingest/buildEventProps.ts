import type { RequestContext } from "../../../lib/logging";
import type { WebhookEvent } from "../../../lib/webhook/normalizeWebhook";
import type { EventsConfigRow } from "../configDatabase/types";
import { normalizeNotionId } from "../../../lib/notion/utils";
import { rt, title, dateIso, urlValue } from "../util/notionProps";
import { extractTitleFromWebhookProperties } from "./extractors";

export function buildEventProps(args: {
  ctx: RequestContext;
  webhookEvent: WebhookEvent;
  row: EventsConfigRow;
  stateValue: string;
  workflowInstancePageId: string;
}): { eventUid: string; receivedAtIso: string; eventTimeIso: string; properties: Record<string, any> } {
  const { ctx, webhookEvent, row, stateValue, workflowInstancePageId } = args;

  const originPageName = extractTitleFromWebhookProperties(webhookEvent.properties);

  const receivedAtIso = new Date().toISOString();
  const eventTimeIso = webhookEvent.originLastEditedTime ?? receivedAtIso;
  const eventUid = webhookEvent.sourceEventId ?? `${webhookEvent.originPageId}:${eventTimeIso}`;

  const workflowInstancePageIdKey = normalizeNotionId(workflowInstancePageId);

  return {
    eventUid,
    receivedAtIso,
    eventTimeIso,
    properties: {
      title: title(eventUid),
      "Event Time": dateIso(eventTimeIso),
      "Received At": dateIso(receivedAtIso),
      "Request ID": rt(ctx.requestId),
      "Source Event ID": rt(webhookEvent.sourceEventId ?? ""),
      "Origin Database ID": rt(webhookEvent.originDatabaseId),
      "Origin Database Name": rt(row.originDatabaseName),
      "Origin Page ID": rt(webhookEvent.originPageId),
      "Origin Page Name": rt(originPageName),
      "Origin Page URL": urlValue(webhookEvent.originPageUrl ?? null),
      "State Property Name": rt(row.statePropertyName),
      "State Value": rt(stateValue),
      "Workflow Instance Page ID": rt(workflowInstancePageIdKey),
      Attempt: { number: webhookEvent.attempt ?? 1 },
    },
  };
}



