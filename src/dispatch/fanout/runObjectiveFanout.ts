import type { AutomationEvent, ProcessorResult } from "../../types";
import { getObjectiveTaskIds } from "../../notion/api";
import { loadConfig } from "../../config";
import { createCommand } from "../createCommand";

const config = loadConfig();

/**
 * Fan-out processor.
 *
 * Semantics (Option A): when fanout is triggered, we enumerate all tasks under the objective and create
 * EXACTLY ONE "recompute" command per task (no per-task routing, no per-route expansion).
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

  const recomputeCommandName =
    typeof event.recomputeCommandName === "string" && event.recomputeCommandName
      ? event.recomputeCommandName
      : "FANOUT_RECOMPUTE_TASK";

  const taskIds = await getObjectiveTaskIds(event.objectiveId, event.objectiveTasksRelationPropIdOverride);

  // eslint-disable-next-line no-console
  console.log("[fanout] starting", {
    objectiveId: event.objectiveId,
    triggerKey,
    taskCount: taskIds.length,
    recomputeCommandName,
  });

  let created = 0;
  let failed = 0;

  for (const taskId of taskIds) {
    // eslint-disable-next-line no-console
    console.log("[fanout] creating_recompute_command_for_task", {
      objectiveId: event.objectiveId,
      taskId,
      recomputeCommandName,
    });

    try {
      await createCommand({
        commandsDbId: config.commandsDbId,
        titlePropNameOrId: config.commandsCommandNamePropId,
        commandTitle: recomputeCommandName,
        triggerKeyPropId: config.commandsTriggerKeyPropId,
        triggerKeyValue: triggerKey,
        directiveCommandPropId: config.commandsDirectiveCommandPropId,
        directiveCommandValues: config.commandsDirectiveCommandPropId ? [recomputeCommandName] : undefined,
        targetRelationPropId: config.commandsTargetTaskPropId,
        targetPageId: taskId,
      });
      created += 1;
    } catch (err) {
      failed += 1;
      // eslint-disable-next-line no-console
      console.error("[fanout] create_recompute_command_failed", {
        objectiveId: event.objectiveId,
        taskId,
        recomputeCommandName,
        error: err,
      });
    }
  }

  return {
    ok: failed === 0,
    created,
    failed,
  };
}


