import { loadConfig } from "../../../lib/config";
import type { EventsRuntimeConfig } from "../domain";

export function loadEventsRuntimeConfig(): EventsRuntimeConfig {
  const cfg = loadConfig().events;
  if (!cfg.eventsDbId) {
    throw new Error("EVENTS_DB_ID is not configured");
  }
  if (!cfg.eventsConfigDbId) {
    throw new Error("EVENTS_CONFIG_DB_ID is not configured");
  }
  if (!cfg.workflowRecordsDbId) {
    throw new Error("WORKFLOW_RECORDS_DB_ID is not configured");
  }

  return {
    eventsDbId: cfg.eventsDbId,
    eventsConfigDbId: cfg.eventsConfigDbId,
    workflowRecordsDbId: cfg.workflowRecordsDbId,
  };
}

