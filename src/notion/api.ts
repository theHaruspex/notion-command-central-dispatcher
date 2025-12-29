import { loadConfig } from "../config";
import { notionRequest } from "./client";

const config = loadConfig();

interface RelationResult {
  relation?: {
    id: string;
  };
}

interface PagePropertyResponse {
  results?: RelationResult[];
  has_more?: boolean;
  next_cursor?: string | null;
}

export async function getObjectiveTaskIds(objectiveId: string): Promise<string[]> {
  if (!config.objectiveTasksRelationPropId) {
    throw new Error("OBJECTIVE_TASKS_RELATION_PROP_ID is not configured");
  }

  const tasks: string[] = [];
  let cursor: string | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const searchParams = new URLSearchParams();
    if (cursor) {
      searchParams.set("start_cursor", cursor);
    }

    const path = `/pages/${objectiveId}/properties/${config.objectiveTasksRelationPropId}?${searchParams.toString()}`;
    // eslint-disable-next-line no-console
    console.log("[notion:getObjectiveTaskIds] request", { objectiveId, path, cursor });
    const response = await notionRequest({ path, method: "GET" });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to retrieve objective tasks: ${response.status} ${text}`);
    }

    const data = (await response.json()) as PagePropertyResponse;
    const results = data.results ?? [];
    // eslint-disable-next-line no-console
    console.log("[notion:getObjectiveTaskIds] page", {
      count: results.length,
      has_more: data.has_more,
      next_cursor: data.next_cursor,
    });

    for (const item of results) {
      if (item.relation?.id) {
        tasks.push(item.relation.id);
      }
    }

    if (!data.has_more || !data.next_cursor) {
      break;
    }

    cursor = data.next_cursor;
  }

  return tasks;
}

export interface CommandInput {
  targetTaskId: string;
  triggerKey: string;
}

export async function createCommand(input: CommandInput): Promise<void> {
  if (!config.commandsDbId) {
    throw new Error("COMMANDS_DB_ID is not configured");
  }
  if (!config.commandsTargetTaskPropId) {
    throw new Error("COMMANDS_TARGET_TASK_PROP_ID is not configured");
  }
  if (!config.commandsTriggerKeyPropId) {
    throw new Error("COMMANDS_TRIGGER_KEY_PROP_ID is not configured");
  }

  const body = {
    parent: {
      database_id: config.commandsDbId,
    },
    properties: {
      [config.commandsTargetTaskPropId]: {
        relation: [{ id: input.targetTaskId }],
      },
      [config.commandsTriggerKeyPropId]: {
        rich_text: [
          {
            text: {
              content: input.triggerKey,
            },
          },
        ],
      },
    },
  };

  // eslint-disable-next-line no-console
  console.log("[notion:createCommand] creating command", {
    targetTaskId: input.targetTaskId,
    triggerKeyPreview: input.triggerKey.slice(0, 50),
  });

  const response = await notionRequest({
    path: "/pages",
    method: "POST",
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create command page: ${response.status} ${text}`);
  }
}


