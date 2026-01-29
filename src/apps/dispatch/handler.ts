import type { RequestContext } from "../../lib/logging";
import { authenticateAndNormalizeWebhook } from "../../lib/webhook";
import { routeWebhookEvent } from "./routing";
import { executeRoutePlan } from "./dispatch";

function extractSourceEventId(body: unknown): string | null {
  try {
    if (!body || typeof body !== "object") return null;
    const b: any = body as any;
    const source = b.source;
    const eventId = source?.event_id;
    return typeof eventId === "string" && eventId ? eventId : null;
  } catch {
    return null;
  }
}

export async function handleDispatchWebhook(args: {
  ctx: RequestContext;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}): Promise<any> {
  const { ctx, headers, body } = args;
  const dispatchCtx = ctx.withDomain("handler");

  dispatchCtx.log("info", "webhook_received");
  dispatchCtx.log("info", "webhook_source", { source_event_id: extractSourceEventId(body) });

  const webhookEvent = await authenticateAndNormalizeWebhook({ headers, body });
  const plan = await routeWebhookEvent({ ctx, webhookEvent });
  const result = await executeRoutePlan({ ctx, webhookEvent, plan });

  dispatchCtx.log("info", "dispatch_completed", {
    matched_routes_count: Array.isArray(result.matched_routes) ? result.matched_routes.length : 0,
    fanout_applied: result.fanout_applied,
    commands_created: result.commands_created,
    duration_ms: Date.now() - ctx.startedAtMs,
  });

  return result;
}


