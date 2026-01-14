import type { RequestContext } from "../../lib/logging";
import { enqueueEventsJob } from "./queue";
import { processEventsWebhook } from "./processWebhook";

export async function handleEventsWebhook(args: {
  ctx: RequestContext;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}): Promise<any> {
  const { ctx, headers, body } = args;

  ctx.log("info", "webhook_received");

  return await enqueueEventsJob(() => processEventsWebhook({ ctx, headers, body }));
}


