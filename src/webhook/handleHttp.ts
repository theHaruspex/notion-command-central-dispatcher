import type { NormalizedEvent } from "./normalizeWebhook";
import { dispatchWebhookEvent } from "../dispatch";
import type { DispatchWebhookResult } from "../dispatch";

export interface HandleWebhookHttpArgs {
  requestId: string;
  normalizedEvent: NormalizedEvent;
}

export async function handleWebhookHttp(
  args: HandleWebhookHttpArgs,
): Promise<DispatchWebhookResult> {
  const { requestId, normalizedEvent } = args;
  return dispatchWebhookEvent({ requestId, normalizedEvent });
}


