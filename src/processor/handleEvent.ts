import type { AutomationEvent, ProcessorResult } from "../types";
import { getObjectiveTaskIds, createCommand } from "../notion/api";
import { loadConfig } from "../config";

const config = loadConfig();

/**
 * Fan-out processor.
 *
 * Given a single automation event where the triggering task's new status is "Done",
 * enumerate all tasks under the objective and create one Command page per task.
 */
export async function handleEvent(event: AutomationEvent): Promise<ProcessorResult> {
  const taskIds = await getObjectiveTaskIds(event.objectiveId);

  let created = 0;
  let failed = 0;

  const triggerKey = config.commandTriggerKey ?? event.triggerKey;
  if (!triggerKey) {
    throw new Error(
      "Missing trigger key: set COMMAND_TRIGGER_KEY in env or include trigger_key / 'Trigger Key' in the webhook payload",
    );
  }

  // eslint-disable-next-line no-console
  console.log("[processor] starting fan-out", {
    objectiveId: event.objectiveId,
    triggerKey,
    taskCount: taskIds.length,
  });

  await Promise.all(
    taskIds.map(async (taskId) => {
      try {
        // eslint-disable-next-line no-console
        console.log("[processor] creating command for task", taskId);
        await createCommand({
          targetTaskId: taskId,
          triggerKey,
        });
        created += 1;
      } catch (err) {
        failed += 1;
        // eslint-disable-next-line no-console
        console.error("Failed to create command for task", taskId, err);
      }
    }),
  );

  return {
    ok: failed === 0,
    created,
    failed,
  };
}


