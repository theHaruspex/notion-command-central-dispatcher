import type { RequestContext } from "../../lib/logging";
import { enqueueEventsJob } from "./queue";
import { processEventsWebhook } from "./processWebhook";

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

export async function handleEventsWebhook(args: {
  ctx: RequestContext;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}): Promise<any> {
  const { ctx, headers, body } = args;
  const eventsCtx = ctx.withDomain("handler");

  eventsCtx.log("info", "webhook_received");
  eventsCtx.log("info", "webhook_source", { source_event: extractSourceEventId(body) });

  return await enqueueEventsJob(() => processEventsWebhook({ ctx, headers, body }));
}


