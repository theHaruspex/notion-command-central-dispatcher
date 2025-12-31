import { loadConfig } from "../config";
import { notionRequest } from "../notion/client";
import type { DispatchRoute } from "./types";
import { parseDispatchYaml } from "./parseYaml";

const config = loadConfig();

interface NotionPage {
  id: string;
  properties: Record<string, any>;
}

interface QueryResponse {
  results: NotionPage[];
  has_more?: boolean;
  next_cursor?: string | null;
}

function extractTitle(props: Record<string, any>): string {
  for (const prop of Object.values(props)) {
    if (prop && typeof prop === "object" && prop.type === "title" && Array.isArray(prop.title)) {
      return prop.title.map((t: any) => t.plain_text || t.text?.content || "").join("");
    }
  }
  return "";
}

function extractCheckboxById(props: Record<string, any>, propId: string | null): boolean {
  if (!propId) return false;
  for (const prop of Object.values(props)) {
    if (prop && typeof prop === "object" && prop.id === propId && prop.type === "checkbox") {
      return Boolean(prop.checkbox);
    }
  }
  return false;
}

function extractRichTextById(props: Record<string, any>, propId: string | null): string {
  if (!propId) return "";
  for (const prop of Object.values(props)) {
    if (prop && typeof prop === "object" && prop.id === propId && prop.type === "rich_text") {
      const segments = Array.isArray(prop.rich_text) ? prop.rich_text : [];
      return segments
        .map((t: any) => t.plain_text || t.text?.content || "")
        .join("");
    }
  }
  return "";
}

export async function loadDispatchRoutes(): Promise<DispatchRoute[]> {
  if (!config.dispatchConfigDbId) {
    throw new Error("DISPATCH_CONFIG_DB_ID is not configured");
  }

  const routes: DispatchRoute[] = [];
  let cursor: string | null | undefined;

  // eslint-disable-next-line no-console
  console.log("[dispatch] dispatch_cache_refresh_started", {
    dispatchConfigDbId: config.dispatchConfigDbId,
  });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const body: any = {};
    if (cursor) {
      body.start_cursor = cursor;
    }

    const response = await notionRequest({
      path: `/databases/${config.dispatchConfigDbId}/query`,
      method: "POST",
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      // eslint-disable-next-line no-console
      console.error("[dispatch] dispatch_cache_refresh_failed", {
        status: response.status,
        body: text,
      });
      throw new Error(`Failed to query dispatch config: ${response.status} ${text}`);
    }

    const data = (await response.json()) as QueryResponse;
    for (const page of data.results) {
      const title = extractTitle(page.properties);
      const enabled = extractCheckboxById(page.properties, config.dispatchConfigEnabledPropId);
      if (!enabled) continue;

      const yamlText = extractRichTextById(page.properties, config.dispatchConfigRulePropId);
      const parsed = parseDispatchYaml(title || page.id, yamlText);
      routes.push(...parsed);
    }

    if (!data.has_more || !data.next_cursor) {
      break;
    }
    cursor = data.next_cursor;
  }

  // eslint-disable-next-line no-console
  console.log("[dispatch] dispatch_cache_loaded", { count: routes.length });

  return routes;
}


