import { queryDatabase } from "../notion";

export async function isDuplicateEvent(eventsDbId: string, eventUid: string): Promise<boolean> {
  const data = await queryDatabase(eventsDbId, {
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


