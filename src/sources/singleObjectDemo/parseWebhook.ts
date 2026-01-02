import type { DispatchEvent } from "../../dispatchConfig/match";

interface RawBody {
  [key: string]: unknown;
}

function asObject(payload: unknown): RawBody {
  if (!payload || typeof payload !== "object") {
    throw new Error("Webhook payload must be a JSON object");
  }
  return payload as RawBody;
}

export function parseSingleObjectWebhook(payload: unknown): DispatchEvent {
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

  return {
    originDatabaseId,
    originPageId,
    properties,
  };
}


