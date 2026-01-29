import { createNotionClient, type NotionRequestOptions } from "./client";
import { createSpineLogger, type Logger } from "../logging";

export interface NotionClientPool {
  request(options: NotionRequestOptions): Promise<Response>;
}

export function createNotionClientPool(args: {
  name: string;
  tokens: string[];
  notionVersion: string;
  logger?: Logger;
}): NotionClientPool {
  const { name, tokens, notionVersion } = args;
  const baseLogger = args.logger ?? createSpineLogger({ app: name, domain: "notion" });

  if (!Array.isArray(tokens) || tokens.length === 0) {
    throw new Error(`Notion client pool '${name}' must be initialized with at least one token`);
  }

  const clients = tokens.map((token) => createNotionClient({ token, notionVersion }));
  let cursor = 0;

  baseLogger.withDomain("pool").log("info", "initialized", { name, pool_size: clients.length });

  return {
    async request(options: NotionRequestOptions): Promise<Response> {
      const idx = cursor % clients.length;
      cursor += 1;

      const logger = options.logger ?? baseLogger;
      logger.withDomain("pool").log("info", "selected_client", { name, idx, pool_size: clients.length });

      return clients[idx].request({
        ...options,
        logger: logger.withDomain("request"),
      });
    },
  };
}


