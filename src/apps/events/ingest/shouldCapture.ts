import type { EventsConfigRow } from "../configDatabase/types";

export type SkipReason = "no_config" | "disabled" | "no_state_value";

export function shouldCaptureEvent(args: {
  row: EventsConfigRow | undefined;
  originDatabaseIdRaw: string;
  stateValue: string;
}): { ok: true } | { ok: false; reason: SkipReason; logFields: Record<string, any> } {
  const { row, originDatabaseIdRaw, stateValue } = args;

  if (!row) {
    return { ok: false, reason: "no_config", logFields: { origin_database_id: originDatabaseIdRaw } };
  }

  if (!row.enabled) {
    return { ok: false, reason: "disabled", logFields: { origin_database_id: originDatabaseIdRaw } };
  }

  if (!stateValue) {
    return { ok: false, reason: "no_state_value", logFields: {} };
  }

  return { ok: true };
}



