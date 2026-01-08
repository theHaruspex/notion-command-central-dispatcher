import { loadConfig } from "../config";
import { createNotionClient, type NotionRequestOptions } from "./client";

let clients: Array<ReturnType<typeof createNotionClient>> | null = null;
let cursor = 0;
let loggedStartup = false;

function getClients(): Array<ReturnType<typeof createNotionClient>> {
  if (clients) return clients;

  const config = loadConfig();
  clients = config.notionTokens.map((token) => createNotionClient({ token, notionVersion: config.notionVersion }));

  if (!loggedStartup) {
    loggedStartup = true;
    // eslint-disable-next-line no-console
    console.log("[notion:pool] initialized", { poolSize: clients.length });
  }

  return clients;
}

export async function notionRequest(options: NotionRequestOptions): Promise<Response> {
  const pool = getClients();
  const idx = cursor % pool.length;
  cursor += 1;

  // eslint-disable-next-line no-console
  console.log("[notion:pool] selected_client", { idx, poolSize: pool.length });

  return pool[idx].request(options);
}


