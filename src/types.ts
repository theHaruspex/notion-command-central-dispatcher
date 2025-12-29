export type StatusValue = string;

export interface AutomationEvent {
  taskId: string;
  objectiveId: string;
  /**
   * Optional trigger key from the webhook payload.
   * If absent, the processor may fall back to COMMAND_TRIGGER_KEY from config.
   */
  triggerKey?: string;
  newStatus: StatusValue;
}

export interface ProcessorResult {
  ok: boolean;
  created: number;
  failed: number;
}


