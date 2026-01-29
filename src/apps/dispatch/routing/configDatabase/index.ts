import type { DispatchConfigSnapshot } from "./types";
import { loadDispatchConfig } from "./loadRoutes";
import { createSpineLogger } from "../../../../lib/logging";
import type { RequestContext } from "../../../../lib/logging";

export type { DispatchConfigSnapshot, DispatchRoute, FanoutMapping } from "./types";

const TTL_MS = 60_000;

let cachedSnapshot: DispatchConfigSnapshot | null = null;
let lastLoadedAt = 0;
let refreshPromise: Promise<void> | null = null;
const log = createSpineLogger({ app: "dispatch", domain: "routing:config" });

async function refreshCache(ctx?: RequestContext): Promise<void> {
  try {
    const snapshot = await loadDispatchConfig(ctx);
    cachedSnapshot = snapshot;
    lastLoadedAt = Date.now();
  } finally {
    refreshPromise = null;
  }
}

export async function getDispatchConfigSnapshot(ctx?: RequestContext): Promise<DispatchConfigSnapshot> {
  const now = Date.now();
  const logCtx = ctx ? ctx.withDomain("routing:config") : log;

  // Cold start: block until we have a cache
  if (!cachedSnapshot) {
    await refreshCache(ctx);
    if (!cachedSnapshot) {
      throw new Error("Failed to load dispatch config");
    }
    return cachedSnapshot;
  }

  // Stale-while-refresh: if TTL expired and no refresh in progress, kick off a refresh
  if (now - lastLoadedAt > TTL_MS && !refreshPromise) {
    logCtx.log("info", "config_cache_refresh_started_async");
    refreshPromise = refreshCache(ctx).catch((err) => {
      logCtx.log("error", "config_cache_refresh_failed", {
        error: err instanceof Error ? err.message : String(err),
        error_stack: err instanceof Error && process.env.DEBUG_STACKS === "1" ? err.stack : undefined,
      });
    });
  }

  return cachedSnapshot;
}


