import type { RequestContext } from "../../lib/logging";
import { authenticateAndNormalizeWebhook } from "../../lib/webhook";
import { routeWebhookEvent } from "./routing";
import { executeRoutePlan } from "./dispatch";

export async function handleDispatchWebhook(args: {
  ctx: RequestContext;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}): Promise<any> {
  const { ctx, headers, body } = args;

  ctx.log("info", "webhook_received");

  const webhookEvent = await authenticateAndNormalizeWebhook({ headers, body });
  const plan = await routeWebhookEvent({ requestId: ctx.requestId, webhookEvent });
  const result = await executeRoutePlan({ requestId: ctx.requestId, webhookEvent, plan });

  ctx.log("info", "dispatch_completed", {
    matched_routes_count: Array.isArray(result.matched_routes) ? result.matched_routes.length : 0,
    fanout_applied: result.fanout_applied,
    commands_created: result.commands_created,
    duration_ms: Date.now() - ctx.startedAtMs,
  });

  return result;
}


