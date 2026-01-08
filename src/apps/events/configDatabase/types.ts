export interface EventsConfigRow {
  originDatabaseIdKey: string; // normalized
  originDatabaseIdRaw: string; // as stored in Notion
  originDatabaseName: string; // title of the row
  statePropertyName: string; // e.g. "Status"
  enabled: boolean;
}

export interface EventsConfigSnapshot {
  byOriginDatabaseId: Record<string, EventsConfigRow>;
}


