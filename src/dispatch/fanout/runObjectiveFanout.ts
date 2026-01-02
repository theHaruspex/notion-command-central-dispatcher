import type { AutomationEvent, ProcessorResult } from "../../types";
import { loadConfig } from "../../config";
import { createCommand } from "../../commands/createCommand";

const config = loadConfig();

/**
 * Fan-out processor.
 *
 * New semantics: when fanout is triggered, we emit a single objective-level recompute
 * trigger command targeted at the origin task. Per-task routing is handled downstream
 * in Command Central, not in this integration.
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

  // eslint-disable-next-line no-console
  console.log("[processor] starting_fanout_recompute_trigger", {
    objectiveId: event.objectiveId,
    originTaskId: event.taskId,
  });

  let created = 0;
  let failed = 0;

  try {
    await createCommand({
      commandsDbId: config.commandsDbId,
      titlePropNameOrId: config.commandsCommandNamePropId ?? "Name",
      commandTitle: "FANOUT_RECOMPUTE_OBJECTIVE",
      triggerKeyPropId: config.commandsTriggerKeyPropId,
      triggerKeyValue: triggerKey,
      directiveCommandPropId: config.commandsDirectiveCommandPropId,
      directiveCommandValues: ["FANOUT_RECOMPUTE_OBJECTIVE"],
      targetRelationPropId: config.commandsTargetTaskPropId,
      targetPageId: event.taskId,
    });
    created = 1;
  } catch (err) {
    failed = 1;
    // eslint-disable-next-line no-console
    console.error("[processor] fanout_recompute_command_failed", {
      objectiveId: event.objectiveId,
      originTaskId: event.taskId,
      error: err,
    });
  }

  // eslint-disable-next-line no-console
  console.log("[processor] completed_fanout_recompute_trigger", {
    objectiveId: event.objectiveId,
    originTaskId: event.taskId,
    created,
    failed,
  });

  return {
    ok: failed === 0,
    created,
    failed,
  };
}


