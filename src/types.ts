export type StatusValue = string;

export interface AutomationEvent {
  taskId: string;
  objectiveId: string;
  triggerKey: string;
  newStatus: StatusValue;
}

export interface ProcessorResult {
  ok: boolean;
  created: number;
  failed: number;
}


