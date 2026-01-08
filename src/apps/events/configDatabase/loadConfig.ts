import { loadConfig } from "../../../lib/config";
import { queryDatabase } from "../notion";
import { normalizeNotionId } from "../../../lib/notion/utils";
import type { EventsConfigRow, EventsConfigSnapshot } from "./types";

interface NotionPage {
  id: string;
  properties: Record<string, any>;
}

interface QueryResponse {
  results: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
}

function extractTitle(props: Record<string, any>): string {
  for (const prop of Object.values(props)) {
    if (prop && typeof prop === "object" && prop.type === "title" && Array.isArray(prop.title)) {
      return prop.title.map((t: any) => t.plain_text || t.text?.content || "").join("");
    }
  }
  return "";
}

function extractCheckboxByName(props: Record<string, any>, name: string): boolean {
  const prop = props[name];
  if (!prop || typeof prop !== "object") return false;
  if ((prop as any).type !== "checkbox") return false;
  return Boolean((prop as any).checkbox);
}

function extractRichTextByName(props: Record<string, any>, name: string): string {
  const prop = props[name];
  if (!prop || typeof prop !== "object") return "";
  if ((prop as any).type !== "rich_text") return "";
  const segments = Array.isArray((prop as any).rich_text) ? (prop as any).rich_text : [];
  return segments.map((t: any) => t.plain_text || t.text?.content || "").join("").trim();
}

export async function loadEventsConfig(): Promise<EventsConfigSnapshot> {
  const cfg = loadConfig().events;
  if (!cfg.eventsConfigDbId) {
    throw new Error("EVENTS_CONFIG_DB_ID is not configured");
  }

  const byOriginDatabaseId: Record<string, EventsConfigRow> = {};
  let cursor: string | null | undefined;

  // eslint-disable-next-line no-console
  console.log("[events:config] config_cache_refresh_started", { eventsConfigDbId: cfg.eventsConfigDbId });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = (await queryDatabase(cfg.eventsConfigDbId, { startCursor: cursor ?? null })) as QueryResponse;

    for (const page of data.results) {
      const props = page.properties;
      const enabled = extractCheckboxByName(props, "Enabled");
      if (!enabled) continue;

      const originDatabaseIdRaw = extractRichTextByName(props, "Origin Database ID");
      const statePropertyName = extractRichTextByName(props, "State Property Name");
      const originDatabaseName = extractTitle(props) || page.id;

      if (!originDatabaseIdRaw || !statePropertyName) {
        // eslint-disable-next-line no-console
        console.warn("[events:config] config_row_skipped_missing_fields", {
          page_id: page.id,
          originDatabaseIdRaw,
          statePropertyName,
        });
        continue;
      }

      const originDatabaseIdKey = normalizeNotionId(originDatabaseIdRaw);
      byOriginDatabaseId[originDatabaseIdKey] = {
        originDatabaseIdKey,
        originDatabaseIdRaw,
        originDatabaseName,
        statePropertyName,
        enabled: true,
      };
    }

    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }

  return { byOriginDatabaseId };
}


