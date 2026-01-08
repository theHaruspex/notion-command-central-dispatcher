import type { EventsConfigSnapshot } from "./types";
import { loadEventsConfig } from "./loadConfig";

const TTL_MS = 60_000;

let cachedSnapshot: EventsConfigSnapshot | null = null;
let lastLoadedAt = 0;
let refreshPromise: Promise<void> | null = null;

async function refreshCache(): Promise<void> {
  try {
    cachedSnapshot = await loadEventsConfig();
    lastLoadedAt = Date.now();
  } finally {
    refreshPromise = null;
  }
}

export async function getEventsConfigSnapshot(): Promise<EventsConfigSnapshot> {
  const now = Date.now();

  if (!cachedSnapshot) {
    await refreshCache();
    if (!cachedSnapshot) {
      throw new Error("Failed to load events config");
    }
    return cachedSnapshot;
  }

  if (now - lastLoadedAt > TTL_MS && !refreshPromise) {
    // eslint-disable-next-line no-console
    console.log("[events:config] config_cache_refresh_started_async");
    refreshPromise = refreshCache().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[events:config] config_cache_refresh_failed", { error: err });
    });
  }

  return cachedSnapshot;
}


