import type { DispatchRoute } from "./types";
import { loadDispatchRoutes } from "./loadRoutes";

const TTL_MS = 60_000;

let cachedRoutes: DispatchRoute[] | null = null;
let lastLoadedAt = 0;
let refreshPromise: Promise<void> | null = null;

async function refreshCache(): Promise<void> {
  try {
    const routes = await loadDispatchRoutes();
    cachedRoutes = routes;
    lastLoadedAt = Date.now();
  } finally {
    refreshPromise = null;
  }
}

export async function getDispatchRoutes(): Promise<DispatchRoute[]> {
  const now = Date.now();

  // Cold start: block until we have a cache
  if (!cachedRoutes) {
    await refreshCache();
    return cachedRoutes ?? [];
  }

  // Stale-while-refresh: if TTL expired and no refresh in progress, kick off a refresh
  if (now - lastLoadedAt > TTL_MS && !refreshPromise) {
    // eslint-disable-next-line no-console
    console.log("[dispatch] dispatch_cache_refresh_started_async");
    refreshPromise = refreshCache().catch((err) => {
      // eslint-disable-next-line no-console
      console.error("[dispatch] dispatch_cache_refresh_failed", { error: err });
    });
  }

  return cachedRoutes;
}


