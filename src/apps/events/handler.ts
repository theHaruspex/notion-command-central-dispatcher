import type { RequestContext } from "../../lib/logging";
import { authenticateAndNormalizeWebhook } from "../../lib/webhook";

export async function handleEventsWebhook(args: {
  ctx: RequestContext;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}): Promise<any> {
  const { ctx, headers, body } = args;

  ctx.log("info", "webhook_received");

  await authenticateAndNormalizeWebhook({ headers, body });

  return { ok: true, request_id: ctx.requestId, note: "events endpoint stub" };
}


