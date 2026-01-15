import { loadConfig } from "../../lib/config";
import { createNotionClientPool } from "../../lib/notion/clientPool";
import { createNotionApi } from "../../lib/notion/api";

let api: ReturnType<typeof createNotionApi> | null = null;

function getApi(): ReturnType<typeof createNotionApi> {
  if (api) return api;

  const config = loadConfig();
  const pool = createNotionClientPool({
    name: "events",
    tokens: config.events.notionTokens,
    notionVersion: config.notionVersion,
  });

  api = createNotionApi((options) => pool.request(options));
  return api;
}

export const queryDatabase = (...args: Parameters<ReturnType<typeof createNotionApi>["queryDatabase"]>) =>
  getApi().queryDatabase(...args);

export const createPage = (...args: Parameters<ReturnType<typeof createNotionApi>["createPage"]>) =>
  getApi().createPage(...args);

export const getPage = (...args: Parameters<ReturnType<typeof createNotionApi>["getPage"]>) =>
  getApi().getPage(...args);

export const updatePage = (...args: Parameters<ReturnType<typeof createNotionApi>["updatePage"]>) =>
  getApi().updatePage(...args);

export const getRelationIdsFromPageProperty = (
  ...args: Parameters<ReturnType<typeof createNotionApi>["getRelationIdsFromPageProperty"]>
) => getApi().getRelationIdsFromPageProperty(...args);

export const getSingleRelationIdFromPageProperty = (
  ...args: Parameters<ReturnType<typeof createNotionApi>["getSingleRelationIdFromPageProperty"]>
) => getApi().getSingleRelationIdFromPageProperty(...args);


