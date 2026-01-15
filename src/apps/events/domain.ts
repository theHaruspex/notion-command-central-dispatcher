export interface EventsRuntimeConfig {
  eventsDbId: string;
  eventsConfigDbId: string;
  workflowRecordsDbId: string;
}

export interface EventsWebhookInput {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  requestId: string;
}

export interface EventsWebhookMeta {
  eventUid: string;
  attempt: number;
  receivedAtIso: string;
  eventTimeIso: string;
  originDatabaseIdKey: string;
  originPageIdKey: string;
  originPageName: string;
  originPageUrl: string | null;
}

export interface ResolvedRouting {
  workflowDefinitionId: string;
  statePropertyName: string;
  originDatabaseName: string;
  originDatabaseIdKey: string;
  originPageIdKey: string;
}

export interface WorkflowInstance {
  workflowInstancePageId: string;
  workflowInstancePageIdKey: string;
  workflowInstancePageName: string;
  workflowInstancePageUrl: string | null;
}

export interface DedupeDecision {
  duplicate: boolean;
}

export interface EventWriteInputs {
  eventProperties: Record<string, any>;
  workflowRecordUpdateProperties: Record<string, any>;
}

