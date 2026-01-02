import type { AutomationEvent, ProcessorResult } from "../../types";
import { getObjectiveTaskIds, getPage } from "../../notion/api";
import { loadConfig } from "../../config";
import { getDispatchConfigSnapshot } from "../configDatabase";
import { matchRoutes } from "../match";
import type { DispatchEvent } from "../match";
import { notionRequest } from "../../notion/client";

const config = loadConfig();

/**
 * Fan-out processor.
 *
 * Given a single automation event where the triggering task's new status is "Done",
 * enumerate all tasks under the objective and create one Command page per task.
 */
export async function runObjectiveFanout(event: AutomationEvent): Promise<ProcessorResult> {
  const taskIds = await getObjectiveTaskIds(
    event.objectiveId,
    event.objectiveTasksRelationPropIdOverride,
  );

  const triggerKey = config.commandTriggerKey ?? event.triggerKey;
  if (!triggerKey) {
    throw new Error(
      "Missing trigger key: set COMMAND_TRIGGER_KEY in env or include trigger_key / 'Trigger Key' in the webhook payload",
    );
  }

  if (!config.commandsDbId) {
    throw new Error("COMMANDS_DB_ID is not configured");
  }
  if (!config.commandsTargetTaskPropId) {
    throw new Error("COMMANDS_TARGET_TASK_PROP_ID is not configured");
  }
  if (!config.commandsTriggerKeyPropId) {
    throw new Error("COMMANDS_TRIGGER_KEY_PROP_ID is not configured");
  }

  const snapshot = await getDispatchConfigSnapshot();

  let created = 0;
  let failed = 0;

  // eslint-disable-next-line no-console
  console.log("[processor] starting fan-out", {
    objectiveId: event.objectiveId,
    triggerKey,
    taskCount: taskIds.length,
  });

  for (const taskId of taskIds) {
    try {
      const page = await getPage(taskId);
      const parent = page.parent as any;
      const normalizeDatabaseId = (id: string): string => id.replace(/-/g, "").toLowerCase();
      const originDatabaseIdRaw =
        parent && typeof parent.database_id === "string" ? parent.database_id : null;
      const originDatabaseId = originDatabaseIdRaw ? normalizeDatabaseId(originDatabaseIdRaw) : null;
      if (!originDatabaseId) {
        // eslint-disable-next-line no-console
        console.warn("[processor] skip task without database parent", { taskId });
        continue;
      }

      const properties = page.properties;
      const dispatchEvent: DispatchEvent = {
        originDatabaseId,
        originPageId: page.id,
        properties,
      };

      const matchedRoutes = matchRoutes(dispatchEvent, snapshot.routes);
      if (matchedRoutes.length === 0) {
        // eslint-disable-next-line no-console
        console.log("[processor] task_skipped_no_matching_routes", { taskId, originDatabaseId });
        continue;
      }

      for (const route of matchedRoutes) {
        const title = route.routeName;

        const body: any = {
          parent: {
            database_id: config.commandsDbId,
          },
          properties: {
            [config.commandsTargetTaskPropId]: {
              relation: [{ id: taskId }],
            },
            [config.commandsTriggerKeyPropId]: {
              rich_text: [
                {
                  text: {
                    content: triggerKey,
                  },
                },
              ],
            },
          },
        };

        if (config.commandsDirectiveCommandPropId) {
          body.properties[config.commandsDirectiveCommandPropId] = {
            multi_select: [
              {
                name: title,
              },
            ],
          };
        }

        // eslint-disable-next-line no-console
        console.log("[processor] creating_dispatch_command_for_task", {
          objectiveId: event.objectiveId,
          taskId,
          routeName: title,
        });

        const response = await notionRequest({
          path: "/pages",
          method: "POST",
          body,
        });

        if (!response.ok) {
          const text = await response.text();
          failed += 1;
          // eslint-disable-next-line no-console
          console.error("[processor] create_command_failed", {
            objectiveId: event.objectiveId,
            taskId,
            routeName: title,
            status: response.status,
            body: text,
          });
        } else {
          created += 1;
        }
      }
    } catch (err) {
      failed += 1;
      // eslint-disable-next-line no-console
      console.error("[processor] task_processing_failed", { taskId, error: err });
    }
  }

  return {
    ok: failed === 0,
    created,
    failed,
  };
}


