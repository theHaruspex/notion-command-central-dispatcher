import type { NotionRequestOptions } from "./client";

export type NotionRequestFn = (options: NotionRequestOptions) => Promise<Response>;

export interface NotionPage {
  id: string;
  parent: { [key: string]: any };
  properties: Record<string, any>;
  url?: string;
}

export function createNotionApi(notionRequest: NotionRequestFn) {
  async function getPage(pageId: string): Promise<NotionPage> {
    const path = `/pages/${pageId}`;
    const response = await notionRequest({ path, method: "GET" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to fetch page ${pageId}: ${response.status} ${text}`);
    }
    const data = (await response.json()) as any;
    return {
      id: data.id,
      parent: data.parent || {},
      properties: (data.properties as Record<string, any>) || {},
      url: typeof data.url === "string" ? data.url : undefined,
    };
  }

  async function queryDatabase(
    databaseId: string,
    args: { startCursor?: string | null; body?: Record<string, any> } = {},
  ): Promise<any> {
    const body: Record<string, any> = { ...(args.body ?? {}) };
    if (args.startCursor) {
      body.start_cursor = args.startCursor;
    }

    const path = `/databases/${databaseId}/query`;
    const response = await notionRequest({ path, method: "POST", body });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to query database ${databaseId}: ${response.status} ${text}`);
    }
    return await response.json();
  }

  async function createPage(args: {
    parentDatabaseId: string;
    properties: Record<string, any>;
  }): Promise<any> {
    const body = {
      parent: { database_id: args.parentDatabaseId },
      properties: args.properties,
    };

    const response = await notionRequest({ path: "/pages", method: "POST", body });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Failed to create page in database ${args.parentDatabaseId}: ${response.status} ${text}`,
      );
    }
    return await response.json();
  }

  async function updatePage(args: { pageId: string; properties: Record<string, any> }): Promise<any> {
    const body = {
      properties: args.properties,
    };

    const path = `/pages/${args.pageId}`;
    const response = await notionRequest({ path, method: "PATCH", body });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to update page ${args.pageId}: ${response.status} ${text}`);
    }
    return await response.json();
  }

  async function getPagePropertyItems(
    pageId: string,
    propId: string,
    args: { startCursor?: string | null } = {},
  ): Promise<any> {
    const searchParams = new URLSearchParams();
    if (args.startCursor) {
      searchParams.set("start_cursor", args.startCursor);
    }
    const qs = searchParams.toString();
    const path = `/pages/${pageId}/properties/${propId}${qs ? `?${qs}` : ""}`;

    const response = await notionRequest({ path, method: "GET" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to fetch page property items ${pageId}/${propId}: ${response.status} ${text}`);
    }
    return await response.json();
  }

  function extractRelationIdsFromPropertyItemsResponse(data: any): string[] {
  // For relation properties, Notion usually returns:
  // { object: "list", results: [{ relation: { id } }, ...], has_more, next_cursor }
  const results = Array.isArray(data?.results) ? data.results : [];
  const ids: string[] = [];
  for (const item of results) {
    const rel = (item as any)?.relation;
    if (rel && typeof rel.id === "string") {
      ids.push(rel.id);
    }
  }
  return ids;
  }

  async function getRelationIdsFromPageProperty(pageId: string, propId: string): Promise<string[]> {
    const ids: string[] = [];
    let cursor: string | null | undefined = null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const data = await getPagePropertyItems(pageId, propId, { startCursor: cursor ?? null });
      ids.push(...extractRelationIdsFromPropertyItemsResponse(data));

      if (!data?.has_more || !data?.next_cursor) {
        break;
      }
      cursor = data.next_cursor;
    }

    return ids;
  }

  async function getSingleRelationIdFromPageProperty(pageId: string, propId: string): Promise<string | null> {
    const data = await getPagePropertyItems(pageId, propId, { startCursor: null });
    const ids = extractRelationIdsFromPropertyItemsResponse(data);
    return ids.length > 0 ? ids[0] : null;
  }

  return {
    getPage,
    queryDatabase,
    createPage,
    updatePage,
    getPagePropertyItems,
    getRelationIdsFromPageProperty,
    getSingleRelationIdFromPageProperty,
  };
}


