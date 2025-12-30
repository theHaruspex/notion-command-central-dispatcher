import type { AutomationEvent } from "../types";
import { handleEvent } from "../processor/handleEvent";

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
  console.log("[coordinator] run_started", { objectiveId });

  try {
    await handleEvent(event);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[coordinator] run_failed", { objectiveId, error: err });
  } finally {
    state.inFlight = false;
    // eslint-disable-next-line no-console
    console.log("[coordinator] run_completed", { objectiveId });
  }
}

export function enqueueObjectiveEvent(event: AutomationEvent): void {
  const objectiveId = event.objectiveId;
  const state = getState(objectiveId);

  if (state.inFlight) {
    // We already have a run in progress for this objective; drop this event.
    // eslint-disable-next-line no-console
    console.log("[coordinator] objective_run_skipped_in_flight", { objectiveId });
    return;
  }

  state.inFlight = true;
  void runForObjective(objectiveId, event);
}

