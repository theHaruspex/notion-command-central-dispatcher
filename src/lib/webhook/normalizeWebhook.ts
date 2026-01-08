export interface WebhookEvent {
  originDatabaseId: string;
  originPageId: string;
  properties: Record<string, any>;
  originPageUrl?: string;
  originLastEditedTime?: string;
  sourceEventId?: string;
  attempt?: number;
}

interface RawBody {
  [key: string]: unknown;
}

function asObject(payload: unknown): RawBody {
  if (!payload || typeof payload !== "object") {
    throw new Error("Webhook payload must be a JSON object");
  }
  return payload as RawBody;
}

export function normalizeWebhookEvent(payload: unknown): WebhookEvent {
  const obj = asObject(payload);
  const source = obj.source && typeof obj.source === "object" ? asObject(obj.source) : null;
  const data = asObject(obj.data);

  if (data.object !== "page") {
    throw new Error("Expected data.object === 'page'");
  }

  const originPageId =
    typeof data.id === "string" && data.id
      ? data.id
      : (() => {
          throw new Error("Missing origin page id on data.id");
        })();

  const parent = asObject(data.parent);
  const originDatabaseId =
    typeof parent.database_id === "string" && parent.database_id
      ? parent.database_id
      : (() => {
          throw new Error("Missing origin database id on data.parent.database_id");
        })();

  const properties = asObject(data.properties);

  const originPageUrl = typeof data.url === "string" ? data.url : undefined;
  const originLastEditedTime = typeof data.last_edited_time === "string" ? data.last_edited_time : undefined;

  const sourceEventId =
    source && typeof (source as any).event_id === "string" ? ((source as any).event_id as string) : undefined;
  const attempt =
    source && typeof (source as any).attempt === "number" ? ((source as any).attempt as number) : undefined;

  return {
    originDatabaseId,
    originPageId,
    properties,
    originPageUrl,
    originLastEditedTime,
    sourceEventId,
    attempt,
  };
}


