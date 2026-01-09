import { queryDatabase } from "../notion";
import { normalizeNotionId } from "../../../lib/notion/utils";

export interface ResolvedEventsConfig {
  workflowDefinitionId: string;
  statePropertyName: string;
  originDatabaseName: string;
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

export async function resolveEventsConfig(args: {
  eventsConfigDbId: string;
  originDatabaseId: string;
  statePropertyName: string;
}): Promise<{ workflowDefinitionId: string; originDatabaseName: string } | null> {
  const originDatabaseIdKey = normalizeNotionId(args.originDatabaseId);

  const data = await queryDatabase(args.eventsConfigDbId, {
    body: {
      filter: {
        and: [
          { property: "Enabled", checkbox: { equals: true } },
          {
            property: "Origin Database ID",
            rich_text: { equals: originDatabaseIdKey },
          },
          {
            property: "State Property Name",
            rich_text: { equals: args.statePropertyName },
          },
        ],
      },
      page_size: 1,
    },
  });

  const results = Array.isArray((data as any)?.results) ? (data as any).results : [];
  const first = results[0];
  if (!first || typeof first !== "object") return null;
  const props = (first as any).properties as Record<string, any>;
  const workflowDefinitionId = readRelationFirstId(props, "Workflow Definition");
  if (!workflowDefinitionId) return null;

  const originDatabaseName = readTitleAsPlain(props, "Origin Database Name");
  return { workflowDefinitionId, originDatabaseName };
}

export async function resolveEventsConfigForWebhook(args: {
  eventsConfigDbId: string;
  originDatabaseId: string;
  webhookProperties: Record<string, any>;
}): Promise<ResolvedEventsConfig | null> {
  const originDatabaseIdKey = normalizeNotionId(args.originDatabaseId);

  // Load all enabled configs for this origin DB, then pick the one whose state property exists in the webhook payload.
  const data = await queryDatabase(args.eventsConfigDbId, {
    body: {
      filter: {
        and: [
          { property: "Enabled", checkbox: { equals: true } },
          {
            property: "Origin Database ID",
            rich_text: { equals: originDatabaseIdKey },
          },
        ],
      },
      page_size: 100,
    },
  });

  const results = Array.isArray((data as any)?.results) ? (data as any).results : [];
  for (const row of results) {
    const props = (row as any)?.properties as Record<string, any>;
    if (!props || typeof props !== "object") continue;

    // Double-check enabled (defensive).
    if (!readCheckbox(props, "Enabled")) continue;

    const statePropertyName = readRichTextAsPlain(props, "State Property Name");
    if (!statePropertyName) continue;
    if (!(statePropertyName in args.webhookProperties)) continue;

    const workflowDefinitionId = readRelationFirstId(props, "Workflow Definition");
    if (!workflowDefinitionId) continue;

    const originDatabaseName = readTitleAsPlain(props, "Origin Database Name");
    return { workflowDefinitionId, statePropertyName, originDatabaseName };
  }

  return null;
}


