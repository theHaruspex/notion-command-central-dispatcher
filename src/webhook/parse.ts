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

  const taskId = getStringField(obj, ["trigger_task_id", "taskId"], "Task ID");
  const objectiveId = getStringField(obj, ["objective_id", "objectiveId"], "Objective ID");
  const triggerKey = getStringField(obj, ["trigger_key", "triggerKey"], "Trigger key");
  const newStatus = getStringField(obj, ["new_status", "newStatus"], "Status");

  return {
    taskId,
    objectiveId,
    triggerKey,
    newStatus,
  };
}


