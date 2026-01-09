import { createPage } from "../notion";

export async function createEvent(args: {
  eventsDbId: string;
  properties: Record<string, any>;
}): Promise<void> {
  await createPage({
    parentDatabaseId: args.eventsDbId,
    properties: args.properties,
  });
}



