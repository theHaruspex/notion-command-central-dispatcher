import type { AutomationEvent, ProcessorResult } from "../../../../types";
import { getRelationIdsFromPageProperty } from "../../notion";
import { loadConfig } from "../../../../lib/config";
import { createCommand } from "../createCommand";
import type { RequestContext } from "../../../../lib/logging";

const config = loadConfig().dispatch;

/**
 * Fan-out processor.
 *
 * Semantics (Option A): when fanout is triggered, we enumerate all tasks under the objective and create
 * EXACTLY ONE fanout command per task (no per-task routing, no per-route expansion).
 *
 * Labeling: `Directive: Command` should contain the origin event’s matched route name(s).
 */
export async function runObjectiveFanout(args: {
  ctx: RequestContext;
  event: AutomationEvent;
}): Promise<ProcessorResult> {
  const { ctx, event } = args;
  const fanoutCtx = ctx.withDomain("fanout");
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

  const taskIds = await getRelationIdsFromPageProperty(ctx, event.objectiveId, objectiveTasksPropId);
  if (taskIds.length > config.maxFanoutTasks) {
    fanoutCtx.log("warn", "task_count_exceeds_cap", {
      objective_id: event.objectiveId,
      original_task_count: taskIds.length,
      max_fanout_tasks: config.maxFanoutTasks,
    });
  }

  const taskIdsToProcess = taskIds.slice(0, config.maxFanoutTasks);

  fanoutCtx.log("info", "starting", {
    objective_id: event.objectiveId,
    trigger_key: triggerKey,
    task_count: taskIdsToProcess.length,
    matched_routes_count: matchedRouteNames.length,
    max_fanout_tasks: config.maxFanoutTasks,
  });

  const startedAt = Date.now();
  const promises = taskIdsToProcess.map(async (taskId) => {
    fanoutCtx.log("info", "creating_recompute_command_for_task", {
      objective_id: event.objectiveId,
      task_id: taskId,
      title: titleFromRoutes,
    });

    await createCommand({
      ctx,
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
    fanoutCtx.log("error", "create_fanout_command_failed", {
      objective_id: event.objectiveId,
      task_id: taskId,
      title: titleFromRoutes,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      error_stack: r.reason instanceof Error && process.env.DEBUG_STACKS === "1" ? r.reason.stack : undefined,
    });
  });

  fanoutCtx.log("info", "batch_completed", {
    objective_id: event.objectiveId,
    task_count_processed: taskIdsToProcess.length,
    created,
    failed,
    duration_ms: Date.now() - startedAt,
  });

  return {
    ok: failed === 0,
    created,
    failed,
  };
}


