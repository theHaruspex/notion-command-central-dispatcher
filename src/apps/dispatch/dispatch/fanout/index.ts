import type { AutomationEvent } from "../../../../types";
import { runObjectiveFanout } from "./runObjectiveFanout";
import { getSingleRelationIdFromPageProperty } from "../../notion";

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

async function runForObjective(objectiveId: ObjectiveId, requestId: string, event: AutomationEvent): Promise<void> {
  const state = getState(objectiveId);

  // eslint-disable-next-line no-console
  console.log("[fanout] run_started", { request_id: requestId, objectiveId });

  try {
    await runObjectiveFanout({ requestId, event: { ...event, objectiveId } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[fanout] run_failed", { request_id: requestId, objectiveId, error: err });
  } finally {
    state.inFlight = false;
    // eslint-disable-next-line no-console
    console.log("[fanout] run_completed", { request_id: requestId, objectiveId });
  }
}

export async function enqueueObjectiveFanoutFromOrigin(args: {
  requestId: string;
  originTaskId: string;
  taskObjectivePropId: string;
  objectiveTasksPropId: string;
  matchedRouteNames: string[];
}): Promise<void> {
  const { requestId, originTaskId, taskObjectivePropId, objectiveTasksPropId, matchedRouteNames } = args;

  const objectiveId = await getSingleRelationIdFromPageProperty(originTaskId, taskObjectivePropId);
  if (!objectiveId) {
    // eslint-disable-next-line no-console
    console.warn("[fanout] objective_not_found_for_task", {
      request_id: requestId,
      originTaskId,
      taskObjectivePropId,
    });
    return;
  }

  const state = getState(objectiveId);

  if (state.inFlight) {
    // eslint-disable-next-line no-console
    console.log("[fanout] objective_run_skipped_in_flight", { request_id: requestId, objectiveId });
    return;
  }

  state.inFlight = true;

  const event: AutomationEvent = {
    taskId: originTaskId,
    objectiveId,
    objectiveTasksPropId,
    matchedRouteNames,
  };

  void runForObjective(objectiveId, requestId, event);
}

export { runObjectiveFanout } from "./runObjectiveFanout";


