import { loadConfig } from "../config";
import { normalizeWebhookEvent } from "./normalizeWebhook";
import { routeWebhookEvent } from "../dispatch";
import type { RouteWebhookResult } from "../dispatch";
import { WebhookAuthError, WebhookParseError } from "./errors";

export interface HandleWebhookArgs {
  requestId: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export async function handleWebhook(args: HandleWebhookArgs): Promise<RouteWebhookResult> {
  const config = loadConfig();
  const { requestId, headers, body } = args;

  if (config.webhookSharedSecret) {
    const headerSecret = headers["x-webhook-secret"];
    const secretValue = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret;
    if (!secretValue || secretValue !== config.webhookSharedSecret) {
      throw new WebhookAuthError();
    }
  }

  let webhookEvent;
  try {
    webhookEvent = normalizeWebhookEvent(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid webhook payload";
    throw new WebhookParseError(message);
  }

  return routeWebhookEvent({
    requestId,
    webhookEvent,
  });
}


