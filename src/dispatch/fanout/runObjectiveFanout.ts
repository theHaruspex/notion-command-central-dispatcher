import type { AutomationEvent, ProcessorResult } from "../../types";
import { getObjectiveTaskIds } from "../../notion/api";
import { loadConfig } from "../../config";
import { createCommand } from "../createCommand";

const config = loadConfig();

/**
 * Fan-out processor.
 *
 * Semantics: when fanout is triggered, we enumerate all tasks under the objective and create
 * one Command per task per matched origin rule (but we do NOT re-run rule matching per task).
 */
export async function runObjectiveFanout(event: AutomationEvent): Promise<ProcessorResult> {
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

  const routeNames = Array.isArray(event.matchedRouteNames) ? event.matchedRouteNames : [];

  const taskIds = await getObjectiveTaskIds(event.objectiveId, event.objectiveTasksRelationPropIdOverride);

  // eslint-disable-next-line no-console
  console.log("[processor] starting fan-out", {
    objectiveId: event.objectiveId,
    triggerKey,
    taskCount: taskIds.length,
    routesCount: routeNames.length,
  });

  let created = 0;
  let failed = 0;

  for (const taskId of taskIds) {
    for (const routeName of routeNames) {
      // eslint-disable-next-line no-console
      console.log("[processor] creating_dispatch_command_for_task", {
        objectiveId: event.objectiveId,
        taskId,
        routeName,
      });

      try {
        await createCommand({
          commandsDbId: config.commandsDbId,
          titlePropNameOrId: config.commandsCommandNamePropId,
          commandTitle: routeName,
          triggerKeyPropId: config.commandsTriggerKeyPropId,
          triggerKeyValue: triggerKey,
          directiveCommandPropId: config.commandsDirectiveCommandPropId,
          directiveCommandValues: config.commandsDirectiveCommandPropId ? [routeName] : undefined,
          targetRelationPropId: config.commandsTargetTaskPropId,
          targetPageId: taskId,
        });
        created += 1;
      } catch (err) {
        failed += 1;
        // eslint-disable-next-line no-console
        console.error("[processor] create_command_failed", {
          objectiveId: event.objectiveId,
          taskId,
          routeName,
          error: err,
        });
      }
    }
  }

  return {
    ok: failed === 0,
    created,
    failed,
  };
}


