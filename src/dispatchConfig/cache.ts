import type { DispatchConfigSnapshot } from "./types";
import { loadDispatchConfig } from "./loadRoutes";

const TTL_MS = 60_000;

let cachedSnapshot: DispatchConfigSnapshot | null = null;
let lastLoadedAt = 0;
let refreshPromise: Promise<void> | null = null;

async function refreshCache(): Promise<void> {
  try {
    const snapshot = await loadDispatchConfig();
    cachedSnapshot = snapshot;
    lastLoadedAt = Date.now();
  } finally {
    refreshPromise = null;
  }
}

export async function getDispatchConfigSnapshot(): Promise<DispatchConfigSnapshot> {
  const now = Date.now();

  // Cold start: block until we have a cache
  if (!cachedSnapshot) {
    await refreshCache();
    if (!cachedSnapshot) {
      throw new Error("Failed to load dispatch config");
    }
    return cachedSnapshot;
  }

  // Stale-while-refresh: if TTL expired and no refresh in progress, kick off a refresh
  if (now - lastLoadedAt > TTL_MS && !refreshPromise) {
    // eslint-disable-next-line no-console
    console.log("[dispatch] config_cache_refresh_started_async");
    refreshPromise = refreshCache().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[dispatch] config_cache_refresh_failed", { error: err });
    });
  }

  return cachedSnapshot;
}

