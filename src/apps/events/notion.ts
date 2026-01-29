import { loadConfig } from "../../lib/config";
import { createNotionClientPool } from "../../lib/notion/clientPool";
import { createNotionApi } from "../../lib/notion/api";
import { createSpineLogger } from "../../lib/logging";
import type { RequestContext } from "../../lib/logging";

let api: ReturnType<typeof createNotionApi> | null = null;
let pool: ReturnType<typeof createNotionClientPool> | null = null;

function getPool(): ReturnType<typeof createNotionClientPool> {
  if (pool) return pool;

  const config = loadConfig();
  const logger = createSpineLogger({ app: "events", domain: "notion" });
  pool = createNotionClientPool({
    name: "events",
    tokens: config.events.notionTokens,
    notionVersion: config.notionVersion,
    logger,
  });
  return pool;
}

function getApi(ctx?: RequestContext): ReturnType<typeof createNotionApi> {
  if (!ctx) {
    if (!api) {
      const pool = getPool();
      api = createNotionApi((options) => pool.request(options));
    }
    return api;
  }
  const pool = getPool();
  const logger = ctx.withDomain("notion");
  return createNotionApi((options) => pool.request({ ...options, logger }));
}

export const queryDatabase = (
  ctx: RequestContext | undefined,
  ...args: Parameters<ReturnType<typeof createNotionApi>["queryDatabase"]>
) => getApi(ctx).queryDatabase(...args);

export const createPage = (
  ctx: RequestContext | undefined,
  ...args: Parameters<ReturnType<typeof createNotionApi>["createPage"]>
) => getApi(ctx).createPage(...args);

export const getPage = (
  ctx: RequestContext | undefined,
  ...args: Parameters<ReturnType<typeof createNotionApi>["getPage"]>
) => getApi(ctx).getPage(...args);

export const updatePage = (
  ctx: RequestContext | undefined,
  ...args: Parameters<ReturnType<typeof createNotionApi>["updatePage"]>
) => getApi(ctx).updatePage(...args);

export const getRelationIdsFromPageProperty = (
  ctx: RequestContext | undefined,
  ...args: Parameters<ReturnType<typeof createNotionApi>["getRelationIdsFromPageProperty"]>
) => getApi(ctx).getRelationIdsFromPageProperty(...args);

export const getSingleRelationIdFromPageProperty = (
  ctx: RequestContext | undefined,
  ...args: Parameters<ReturnType<typeof createNotionApi>["getSingleRelationIdFromPageProperty"]>
) => getApi(ctx).getSingleRelationIdFromPageProperty(...args);


