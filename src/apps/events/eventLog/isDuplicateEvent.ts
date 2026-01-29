import { queryDatabase } from "../notion";
import type { RequestContext } from "../../../lib/logging";

export async function isDuplicateEvent(
  ctx: RequestContext,
  eventsDbId: string,
  eventUid: string,
): Promise<boolean> {
  const data = await queryDatabase(ctx, eventsDbId, {
    body: {
      filter: {
        property: "Event UID",
        title: { equals: eventUid },
      },
      page_size: 1,
    },
  });

  const results = Array.isArray((data as any)?.results) ? (data as any).results : [];
  return results.length > 0;
}


