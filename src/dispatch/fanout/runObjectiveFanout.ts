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

  const commandsDbId = config.commandsDbId;
  const commandsTargetTaskPropId = config.commandsTargetTaskPropId;
  const commandsTriggerKeyPropId = config.commandsTriggerKeyPropId;

  const matchedRouteNames = Array.isArray(event.matchedRouteNames) ? event.matchedRouteNames : [];
  const titleFromRoutes =
    matchedRouteNames.length > 0 ? matchedRouteNames.join(" | ").slice(0, 200) : "Fanout";

  const objectiveTasksPropId = event.objectiveTasksPropId;
  if (!objectiveTasksPropId) {
    throw new Error(
      "Malformed fanout job: missing objectiveTasksPropId. This value must be populated from the routing/config fanout mapping.",
    );
  }

  const taskIds = await getRelationIdsFromPageProperty(event.objectiveId, objectiveTasksPropId);
  if (taskIds.length > config.maxFanoutTasks) {
    // eslint-disable-next-line no-console
    console.warn("[fanout] task_count_exceeds_cap", {
      objectiveId: event.objectiveId,
      originalTaskCount: taskIds.length,
      maxFanoutTasks: config.maxFanoutTasks,
    });
  }

  const taskIdsToProcess = taskIds.slice(0, config.maxFanoutTasks);

  // eslint-disable-next-line no-console
  console.log("[fanout] starting", {
    objectiveId: event.objectiveId,
    triggerKey,
    taskCount: taskIdsToProcess.length,
    matchedRouteNamesCount: matchedRouteNames.length,
    maxFanoutTasks: config.maxFanoutTasks,
  });

  const startedAt = Date.now();
  const promises = taskIdsToProcess.map(async (taskId) => {
    // eslint-disable-next-line no-console
    console.log("[fanout] creating_recompute_command_for_task", {
      objectiveId: event.objectiveId,
      taskId,
      title: titleFromRoutes,
    });

    await createCommand({
      commandsDbId,
      titlePropNameOrId: config.commandsCommandNamePropId,
      commandTitle: titleFromRoutes,
      triggerKeyPropId: commandsTriggerKeyPropId,
      triggerKeyValue: triggerKey,
      directiveCommandPropId: config.commandsDirectiveCommandPropId,
      directiveCommandValues: config.commandsDirectiveCommandPropId ? matchedRouteNames : undefined,
      targetRelationPropId: commandsTargetTaskPropId,
      targetPageId: taskId,
    });
  });

  const results = await Promise.allSettled(promises);
  const created = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  results.forEach((r, idx) => {
    if (r.status === "fulfilled") return;
    const taskId = taskIdsToProcess[idx];
    // eslint-disable-next-line no-console
    console.error("[fanout] create_fanout_command_failed", {
      objectiveId: event.objectiveId,
      taskId,
      title: titleFromRoutes,
      error: r.reason,
    });
  });

  // eslint-disable-next-line no-console
  console.log("[fanout] batch_completed", {
    objectiveId: event.objectiveId,
    taskCountProcessed: taskIdsToProcess.length,
    created,
    failed,
    durationMs: Date.now() - startedAt,
  });

  return {
    ok: failed === 0,
    created,
    failed,
  };
}


