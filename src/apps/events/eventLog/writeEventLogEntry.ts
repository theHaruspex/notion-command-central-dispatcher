import { createPage } from "../notion";
import type { RequestContext } from "../../../lib/logging";

export async function writeEventLogEntry(args: {
  ctx: RequestContext;
  eventsDbId: string;
  properties: Record<string, any>;
}): Promise<void> {
  await createPage(args.ctx, {
    parentDatabaseId: args.eventsDbId,
    properties: args.properties,
  });
}



