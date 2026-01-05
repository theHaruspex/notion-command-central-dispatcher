import { loadConfig } from "../config";
import { normalizeWebhookEvent } from "./normalizeWebhook";
import { WebhookAuthError, WebhookParseError } from "./errors";
import type { WebhookEvent } from "./normalizeWebhook";

export interface AuthenticateAndNormalizeWebhookArgs {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

/**
 * Webhook boundary: auth + normalization only.
 *
 * Important: this layer does NOT call dispatch. The process orchestrator decides
 * whether/how to route events.
 */
export async function authenticateAndNormalizeWebhook(
  args: AuthenticateAndNormalizeWebhookArgs,
): Promise<WebhookEvent> {
  const config = loadConfig();
  const { headers, body } = args;

  if (config.webhookSharedSecret) {
    const headerSecret = headers["x-webhook-secret"];
    const secretValue = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret;
    if (!secretValue || secretValue !== config.webhookSharedSecret) {
      throw new WebhookAuthError();
    }
  }

  let webhookEvent: WebhookEvent;
  try {
    webhookEvent = normalizeWebhookEvent(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid webhook payload";
    throw new WebhookParseError(message);
  }

  return webhookEvent;
}


