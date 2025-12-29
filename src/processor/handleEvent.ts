import type { AutomationEvent, ProcessorResult } from "../types";
import { getObjectiveTaskIds, createCommand } from "../notion/api";

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

  await Promise.all(
    taskIds.map(async (taskId) => {
      try {
        await createCommand({
          targetTaskId: taskId,
          triggerKey: event.triggerKey,
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


