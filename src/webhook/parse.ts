import type { AutomationEvent } from "../types";

interface RawBody {
  [key: string]: unknown;
}

function asObject(payload: unknown): RawBody {
  if (payload === null || typeof payload !== "object") {
    throw new Error("Webhook payload must be a JSON object");
  }
  return payload as RawBody;
}

function getStringField(obj: RawBody, keys: string[], fieldDescription: string): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  throw new Error(`Missing or invalid ${fieldDescription} (expected non-empty string in one of: ${keys.join(", ")})`);
}

/**
 * Parse a Notion Automation webhook payload into our internal event type.
 * 
 * We intentionally support both snake_case and camelCase field names so the
 * Notion automation can be configured flexibly:
 * - trigger_task_id | taskId
 * - objective_id    | objectiveId
 * - trigger_key     | triggerKey
 * - new_status      | newStatus
 */
export function parseAutomationWebhook(payload: unknown): AutomationEvent {
  const obj = asObject(payload);

  // Path A: raw fields (recommended explicit JSON body from automation)
  if ("trigger_task_id" in obj || "taskId" in obj) {
    const taskId = getStringField(obj, ["trigger_task_id", "taskId"], "Task ID");
    const objectiveId = getStringField(obj, ["objective_id", "objectiveId"], "Objective ID");
    const newStatus = getStringField(obj, ["new_status", "newStatus"], "Status");

    return {
      taskId,
      objectiveId,
      newStatus,
    };
  }

  // Path B: Notion "Send webhook" default page payload (like the sample you shared)
  const data = obj.data as RawBody | undefined;
  if (!data || data.object !== "page") {
    throw new Error("Unsupported webhook shape: expected top-level fields or data.page payload");
  }

  const taskId = typeof data.id === "string" && data.id
    ? data.id
    : (() => {
        throw new Error("Missing Task ID on data.id");
      })();

  const properties = asObject(data.properties);
  const objectiveProp = asObject(properties.Objective as unknown);
  const objectiveRelation = Array.isArray((objectiveProp as any).relation) ? (objectiveProp as any).relation : [];
  const objectiveId =
    objectiveRelation[0]?.id ??
    (() => {
      throw new Error("Missing Objective relation id on properties.Objective.relation[0].id");
    })();

  const statusProp = asObject(properties.Status as unknown);
  const status = (statusProp as any).status;
  const newStatus =
    (status && typeof status.name === "string" && status.name) ||
    (() => {
      throw new Error("Missing Status name on properties.Status.status.name");
    })();

  // Optional trigger key: only from explicit fields/properties; no automation IDs
  let triggerKey: string | undefined;
  if (typeof (obj as any).trigger_key === "string" && (obj as any).trigger_key.trim().length > 0) {
    triggerKey = (obj as any).trigger_key;
  } else if (
    typeof (properties["Trigger Key"] as any)?.rich_text?.[0]?.plain_text === "string" &&
    (properties["Trigger Key"] as any).rich_text[0].plain_text.trim().length > 0
  ) {
    triggerKey = (properties["Trigger Key"] as any).rich_text[0].plain_text;
  }

  return {
    taskId,
    objectiveId,
    triggerKey,
    newStatus,
  };
}


