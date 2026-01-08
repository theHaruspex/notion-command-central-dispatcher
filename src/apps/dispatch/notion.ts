import { loadConfig } from "../../lib/config";
import { createNotionClientPool } from "../../lib/notion/clientPool";
import { createNotionApi } from "../../lib/notion/api";

let api: ReturnType<typeof createNotionApi> | null = null;

function getApi(): ReturnType<typeof createNotionApi> {
  if (api) return api;

  const config = loadConfig();
  const pool = createNotionClientPool({
    name: "dispatch",
    tokens: config.dispatch.notionTokens,
    notionVersion: config.notionVersion,
  });

  api = createNotionApi((options) => pool.request(options));
  return api;
}

export const queryDatabase = (...args: Parameters<ReturnType<typeof createNotionApi>["queryDatabase"]>) =>
  getApi().queryDatabase(...args);

export const createPage = (...args: Parameters<ReturnType<typeof createNotionApi>["createPage"]>) =>
  getApi().createPage(...args);

export const getRelationIdsFromPageProperty = (
  ...args: Parameters<ReturnType<typeof createNotionApi>["getRelationIdsFromPageProperty"]>
) => getApi().getRelationIdsFromPageProperty(...args);

export const getSingleRelationIdFromPageProperty = (
  ...args: Parameters<ReturnType<typeof createNotionApi>["getSingleRelationIdFromPageProperty"]>
) => getApi().getSingleRelationIdFromPageProperty(...args);


