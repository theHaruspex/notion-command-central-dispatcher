import { createNotionClient, type NotionRequestOptions } from "./client";

export interface NotionClientPool {
  request(options: NotionRequestOptions): Promise<Response>;
}

export function createNotionClientPool(args: {
  name: string;
  tokens: string[];
  notionVersion: string;
}): NotionClientPool {
  const { name, tokens, notionVersion } = args;

  if (!Array.isArray(tokens) || tokens.length === 0) {
    throw new Error(`Notion client pool '${name}' must be initialized with at least one token`);
  }

  const clients = tokens.map((token) => createNotionClient({ token, notionVersion }));
  let cursor = 0;

  // eslint-disable-next-line no-console
  console.log("[notion:pool] initialized", { name, poolSize: clients.length });

  return {
    async request(options: NotionRequestOptions): Promise<Response> {
      const idx = cursor % clients.length;
      cursor += 1;

      // eslint-disable-next-line no-console
      console.log("[notion:pool] selected_client", { name, idx, poolSize: clients.length });

      return clients[idx].request(options);
    },
  };
}


