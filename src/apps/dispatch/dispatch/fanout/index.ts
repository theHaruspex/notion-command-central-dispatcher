import type { AutomationEvent } from "../../../../types";
import { runObjectiveFanout } from "./runObjectiveFanout";
import { getSingleRelationIdFromPageProperty } from "../../notion";
import type { RequestContext } from "../../../../lib/logging";

type ObjectiveId = string;

interface ObjectiveState {
  inFlight: boolean;
}

const objectiveStates = new Map<ObjectiveId, ObjectiveState>();

function getState(objectiveId: ObjectiveId): ObjectiveState {
  let state = objectiveStates.get(objectiveId);
  if (!state) {
    state = { inFlight: false };
    objectiveStates.set(objectiveId, state);
  }
  return state;
}

async function runForObjective(
  objectiveId: ObjectiveId,
  ctx: RequestContext,
  event: AutomationEvent,
): Promise<void> {
  const state = getState(objectiveId);
  const fanoutCtx = ctx.withDomain("fanout");

  fanoutCtx.log("info", "run_started", { objective_id: objectiveId });

  try {
    await runObjectiveFanout({ ctx, event: { ...event, objectiveId } });
  } catch (err) {
    fanoutCtx.log("error", "run_failed", {
      objective_id: objectiveId,
      error: err instanceof Error ? err.message : String(err),
      error_stack: err instanceof Error && process.env.DEBUG_STACKS === "1" ? err.stack : undefined,
    });
  } finally {
    state.inFlight = false;
    fanoutCtx.log("info", "run_completed", { objective_id: objectiveId });
  }
}

export async function enqueueObjectiveFanoutFromOrigin(args: {
  ctx: RequestContext;
  originTaskId: string;
  taskObjectivePropId: string;
  objectiveTasksPropId: string;
  matchedRouteNames: string[];
}): Promise<void> {
  const { ctx, originTaskId, taskObjectivePropId, objectiveTasksPropId, matchedRouteNames } = args;
  const fanoutCtx = ctx.withDomain("fanout");

  const objectiveId = await getSingleRelationIdFromPageProperty(ctx, originTaskId, taskObjectivePropId);
  if (!objectiveId) {
    fanoutCtx.log("warn", "objective_not_found_for_task", {
      origin_task_id: originTaskId,
      task_objective_prop_id: taskObjectivePropId,
    });
    return;
  }

  const state = getState(objectiveId);

  if (state.inFlight) {
    fanoutCtx.log("info", "objective_run_skipped_in_flight", { objective_id: objectiveId });
    return;
  }

  state.inFlight = true;

  const event: AutomationEvent = {
    taskId: originTaskId,
    objectiveId,
    objectiveTasksPropId,
    matchedRouteNames,
  };

  void runForObjective(objectiveId, ctx, event);
}

export { runObjectiveFanout } from "./runObjectiveFanout";


