import type { AutomationEvent } from "../../types";
import { runObjectiveFanout } from "./runObjectiveFanout";
import { getObjectiveIdForTask } from "../../notion/api";

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

async function runForObjective(objectiveId: ObjectiveId, event: AutomationEvent): Promise<void> {
  const state = getState(objectiveId);

  // eslint-disable-next-line no-console
  console.log("[fanout] run_started", { objectiveId });

  try {
    await runObjectiveFanout({ ...event, objectiveId });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[fanout] run_failed", { objectiveId, error: err });
  } finally {
    state.inFlight = false;
    // eslint-disable-next-line no-console
    console.log("[fanout] run_completed", { objectiveId });
  }
}

export async function enqueueObjectiveFanoutFromOrigin(args: {
  requestId: string;
  originTaskId: string;
  taskObjectivePropId: string;
  objectiveTasksPropId: string;
  recomputeCommandName: string;
}): Promise<void> {
  const { originTaskId, taskObjectivePropId, objectiveTasksPropId, recomputeCommandName } = args;

  const objectiveId = await getObjectiveIdForTask(originTaskId, taskObjectivePropId);
  if (!objectiveId) {
    // eslint-disable-next-line no-console
    console.warn("[fanout] objective_not_found_for_task", {
      originTaskId,
      taskObjectivePropId,
    });
    return;
  }

  const state = getState(objectiveId);

  if (state.inFlight) {
    // eslint-disable-next-line no-console
    console.log("[fanout] objective_run_skipped_in_flight", { objectiveId });
    return;
  }

  state.inFlight = true;

  const event: AutomationEvent = {
    taskId: originTaskId,
    objectiveId,
    objectiveTasksRelationPropIdOverride: objectiveTasksPropId,
    recomputeCommandName,
  };

  void runForObjective(objectiveId, event);
}

export { runObjectiveFanout } from "./runObjectiveFanout";


