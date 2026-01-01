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

export async function getObjectiveTaskIds(objectiveId: string, tasksRelationPropId?: string): Promise<string[]> {
  const relationPropId = tasksRelationPropId ?? config.objectiveTasksRelationPropId;
  if (!relationPropId) {
    throw new Error("Objective tasks relation property id is not configured");
  }
  const tasks: string[] = [];
  let cursor: string | undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const searchParams = new URLSearchParams();
    if (cursor) {
      searchParams.set("start_cursor", cursor);
    }

    const path = `/pages/${objectiveId}/properties/${relationPropId}?${searchParams.toString()}`;
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

export async function getObjectiveIdForTask(taskId: string, taskObjectivePropId: string): Promise<string | null> {
  const path = `/pages/${taskId}/properties/${taskObjectivePropId}`;
  // eslint-disable-next-line no-console
  console.log("[notion:getObjectiveIdForTask] request", { taskId, path });

  const response = await notionRequest({
    path,
    method: "GET",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to read task objective relation: ${response.status} ${text}`);
  }

  const data = (await response.json()) as any;

  // Relation property items can appear under different shapes depending on the API:
  // - GET /pages/{id}/properties/{prop}: { object: "property_item", type: "relation", relation: { id } }
  // - Or batched: { results: [{ relation: [{ id }] }, ...] }
  const tryExtract = (source: any): string | null => {
    if (!source) return null;
    const rel = (source as any).relation;
    if (!rel) return null;

    if (Array.isArray(rel) && rel.length > 0 && typeof rel[0].id === "string") {
      return rel[0].id;
    }

    if (!Array.isArray(rel) && typeof rel.id === "string") {
      return rel.id;
    }
    return null;
  };

  const direct = tryExtract(data) ?? tryExtract((data as any).property_item);
  if (direct) return direct;

  if (Array.isArray(data.results) && data.results.length > 0) {
    for (const item of data.results) {
      const id = tryExtract(item);
      if (id) return id;
    }
  }

  // eslint-disable-next-line no-console
  console.log("[notion:getObjectiveIdForTask] no_relation_found", {
    taskId,
    taskObjectivePropId,
    keys: Object.keys(data),
    hasResultsArray: Array.isArray(data.results),
    resultsLength: Array.isArray(data.results) ? data.results.length : undefined,
    propertyItemType: (data as any).property_item?.type,
    propertyItemPreview: (data as any).property_item
      ? JSON.stringify((data as any).property_item).slice(0, 300)
      : null,
  });

  return null;
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


