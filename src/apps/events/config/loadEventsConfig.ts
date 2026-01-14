import { queryDatabase } from "../notion";
import { normalizeNotionId } from "../../../lib/notion/utils";

interface ResolvedEventsConfig {
  workflowDefinitionId: string;
  statePropertyName: string;
  originDatabaseName: string;
}

/**
 * Normalize an ID-like string (Notion DB IDs are often copied with dashes;
 * we normalize both webhook IDs and config IDs to avoid mismatches).
 */
function normalizeIdLike(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return normalizeNotionId(trimmed);
}

function readCheckbox(props: Record<string, any>, name: string): boolean {
  const p = props[name];
  return !!(p && typeof p === "object" && (p as any).type === "checkbox" && (p as any).checkbox === true);
}

function readRichTextAsPlain(props: Record<string, any>, name: string): string {
  const p = props[name];
  if (!p || typeof p !== "object") return "";
  const type = (p as any).type;
  if (type === "rich_text" || type === "text") {
    const rt = Array.isArray((p as any).rich_text) ? (p as any).rich_text : [];
    return rt.map((t: any) => t.plain_text || t.text?.content || "").join("").trim();
  }
  return "";
}

function readTitleAsPlain(props: Record<string, any>, name: string): string {
  const p = props[name];
  if (!p || typeof p !== "object") return "";
  if ((p as any).type === "title") {
    const title = Array.isArray((p as any).title) ? (p as any).title : [];
    return title.map((t: any) => t.plain_text || t.text?.content || "").join("").trim();
  }
  return "";
}

function readRelationFirstId(props: Record<string, any>, name: string): string | null {
  const p = props[name];
  if (!p || typeof p !== "object") return null;
  if ((p as any).type !== "relation") return null;
  const rel = Array.isArray((p as any).relation) ? (p as any).relation : [];
  const first = rel[0];
  return first && typeof first.id === "string" ? first.id : null;
}

export async function resolveEventsConfigForWebhook(args: {
  eventsConfigDbId: string;
  originDatabaseId: string;
  webhookProperties: Record<string, any>;
}): Promise<ResolvedEventsConfig | null> {
  const originDatabaseIdKey = normalizeIdLike(args.originDatabaseId);

  // Load all enabled configs, then filter by normalized Origin Database ID in code
  // (Notion DB IDs in config rows may be stored with or without dashes, so we normalize both sides for comparison)
  // Pick the config whose state property exists in the webhook payload.
  let cursor: string | null | undefined = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = await queryDatabase(args.eventsConfigDbId, {
      body: {
        filter: {
          property: "Enabled",
          checkbox: { equals: true },
        },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      },
    });

    const results = Array.isArray((data as any)?.results) ? (data as any).results : [];
    for (const row of results) {
      const props = (row as any)?.properties as Record<string, any>;
      if (!props || typeof props !== "object") continue;

      // Double-check enabled (defensive)
      if (!readCheckbox(props, "Enabled")) continue;

      // Normalize the stored Origin Database ID and compare to the target
      const storedOriginDbId = readRichTextAsPlain(props, "Origin Database ID");
      if (normalizeIdLike(storedOriginDbId) !== originDatabaseIdKey) continue;

      const statePropertyName = readRichTextAsPlain(props, "State Property Name");
      if (!statePropertyName) continue;
      if (!(statePropertyName in args.webhookProperties)) continue;

      const workflowDefinitionId = readRelationFirstId(props, "Workflow Definition");
      if (!workflowDefinitionId) continue;

      const originDatabaseName = readTitleAsPlain(props, "Origin Database Name");
      return { workflowDefinitionId, statePropertyName, originDatabaseName };
    }

    if (!(data as any)?.has_more || !(data as any)?.next_cursor) break;
    cursor = (data as any).next_cursor;
  }

  return null;
}


