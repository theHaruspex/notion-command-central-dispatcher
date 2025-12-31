export interface NormalizedEvent {
  originDatabaseId: string;
  originPageId: string;
  newStatusName: string;
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

export function normalizeWebhookEvent(payload: unknown): NormalizedEvent {
  const obj = asObject(payload);
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
  const statusProp = asObject(properties.Status as unknown);
  const status = (statusProp as any).status;

  let newStatusName = "Unknown";
  if (status && typeof status.name === "string" && status.name.trim().length > 0) {
    newStatusName = status.name;
  }

  return {
    originDatabaseId,
    originPageId,
    newStatusName,
  };
}


