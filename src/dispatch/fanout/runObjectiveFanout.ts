import type { AutomationEvent, ProcessorResult } from "../../types";
import { getRelationIdsFromPageProperty } from "../../notion/api";
import { loadConfig } from "../../config";
import { createCommand } from "../createCommand";

const config = loadConfig();

/**
 * Fan-out processor.
 *
 * Semantics (Option A): when fanout is triggered, we enumerate all tasks under the objective and create
 * EXACTLY ONE fanout command per task (no per-task routing, no per-route expansion).
 *
 * Labeling: `Directive: Command` should contain the origin event’s matched route name(s).
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

  const matchedRouteNames = Array.isArray(event.matchedRouteNames) ? event.matchedRouteNames : [];
  const titleFromRoutes =
    matchedRouteNames.length > 0 ? matchedRouteNames.join(" | ").slice(0, 200) : "Fanout";

  const objectiveTasksPropId = event.objectiveTasksRelationPropIdOverride;
  if (!objectiveTasksPropId) {
    throw new Error("Missing objectiveTasksPropId (objectiveTasksRelationPropIdOverride) on fanout event");
  }

  const taskIds = await getRelationIdsFromPageProperty(event.objectiveId, objectiveTasksPropId);

  // eslint-disable-next-line no-console
  console.log("[fanout] starting", {
    objectiveId: event.objectiveId,
    triggerKey,
    taskCount: taskIds.length,
    matchedRouteNamesCount: matchedRouteNames.length,
  });

  let created = 0;
  let failed = 0;

  for (const taskId of taskIds) {
    // eslint-disable-next-line no-console
    console.log("[fanout] creating_recompute_command_for_task", {
      objectiveId: event.objectiveId,
      taskId,
      title: titleFromRoutes,
    });

    try {
      await createCommand({
        commandsDbId: config.commandsDbId,
        titlePropNameOrId: config.commandsCommandNamePropId,
        commandTitle: titleFromRoutes,
        triggerKeyPropId: config.commandsTriggerKeyPropId,
        triggerKeyValue: triggerKey,
        directiveCommandPropId: config.commandsDirectiveCommandPropId,
        directiveCommandValues: config.commandsDirectiveCommandPropId ? matchedRouteNames : undefined,
        targetRelationPropId: config.commandsTargetTaskPropId,
        targetPageId: taskId,
      });
      created += 1;
    } catch (err) {
      failed += 1;
      // eslint-disable-next-line no-console
      console.error("[fanout] create_fanout_command_failed", {
        objectiveId: event.objectiveId,
        taskId,
        title: titleFromRoutes,
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


