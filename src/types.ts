export interface AutomationEvent {
  taskId: string;
  objectiveId: string;
  /**
   * Optional trigger key from the webhook payload.
   * If absent, the processor may fall back to COMMAND_TRIGGER_KEY from config.
   */
  triggerKey?: string;
  /**
   * Optional override for the Objective's Tasks relation property id, used to
   * enumerate tasks for fan-out. When absent, config.OBJECTIVE_TASKS_RELATION_PROP_ID is used.
   */
  objectiveTasksRelationPropIdOverride?: string;
  /**
   * Names of the DispatchCommand rules that matched the origin webhook event.
   * Fanout uses these for labeling only (one command per task, not per route).
   */
  matchedRouteNames?: string[];
}

export interface ProcessorResult {
  ok: boolean;
  created: number;
  failed: number;
}


