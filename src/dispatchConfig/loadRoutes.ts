import { loadConfig } from "../config";
import { notionRequest } from "../notion/client";
import type { DispatchConfigSnapshot, DispatchRoute, FanoutMapping } from "./types";
import { parseDispatchYaml, parseFanoutYaml } from "./parseYaml";

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

/**
 * Helpers that accept either a property **id** or **name**.
 * In Notion page objects, `properties` is a map of name -> { id, type, ... }.
 */
function extractCheckboxByKey(props: Record<string, any>, key: string | null): boolean {
  if (!key) return false;
  for (const [name, prop] of Object.entries(props)) {
    if (!prop || typeof prop !== "object") continue;
    if ((prop as any).type !== "checkbox") continue;
    if ((prop as any).id === key || name === key) {
      return Boolean((prop as any).checkbox);
    }
  }
  return false;
}

function extractRichTextByKey(props: Record<string, any>, key: string | null): string {
  if (!key) return "";
  for (const [name, prop] of Object.entries(props)) {
    if (!prop || typeof prop !== "object") continue;
    if ((prop as any).type !== "rich_text") continue;
    if ((prop as any).id === key || name === key) {
      const segments = Array.isArray((prop as any).rich_text) ? (prop as any).rich_text : [];
      return segments
        .map((t: any) => t.plain_text || t.text?.content || "")
        .join("");
    }
  }
  return "";
}

export async function loadDispatchConfig(): Promise<DispatchConfigSnapshot> {
  if (!config.dispatchConfigDbId) {
    throw new Error("DISPATCH_CONFIG_DB_ID is not configured");
  }

  const routes: DispatchRoute[] = [];
  const fanoutMappings: FanoutMapping[] = [];
  let hasPages = false;

  // Track whether the configured property keys actually exist in the DB schema.
  let sawEnabledProp =
    !config.dispatchConfigEnabledPropId || config.dispatchConfigEnabledPropId.trim().length === 0;
  let sawRuleProp =
    !config.dispatchConfigRulePropId || config.dispatchConfigRulePropId.trim().length === 0;
  let cursor: string | null | undefined;

  // eslint-disable-next-line no-console
  console.log("[dispatch] config_cache_refresh_started", {
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
      console.error("[dispatch] config_cache_refresh_failed", {
        status: response.status,
        body: text,
      });
      throw new Error(`Failed to query dispatch config: ${response.status} ${text}`);
    }

    const data = (await response.json()) as QueryResponse;
    for (const page of data.results) {
      hasPages = true;

      const props = page.properties;

      // Scan properties once to see if the configured keys line up with either an id or name.
      if (config.dispatchConfigEnabledPropId && !sawEnabledProp) {
        for (const [name, prop] of Object.entries(props)) {
          if (
            prop &&
            typeof prop === "object" &&
            (prop as any).type === "checkbox" &&
            (((prop as any).id as string) === config.dispatchConfigEnabledPropId || name === config.dispatchConfigEnabledPropId)
          ) {
            sawEnabledProp = true;
            break;
          }
        }
      }

      if (config.dispatchConfigRulePropId && !sawRuleProp) {
        for (const [name, prop] of Object.entries(props)) {
          if (
            prop &&
            typeof prop === "object" &&
            (prop as any).type === "rich_text" &&
            (((prop as any).id as string) === config.dispatchConfigRulePropId || name === config.dispatchConfigRulePropId)
          ) {
            sawRuleProp = true;
            break;
          }
        }
      }

      const title = extractTitle(props) || page.id;
      const enabled = extractCheckboxByKey(props, config.dispatchConfigEnabledPropId);

      // eslint-disable-next-line no-console
      console.log("[dispatch] config_row_evaluated", {
        page_id: page.id,
        title,
        enabled,
      });

      if (!enabled) continue;

      const yamlText = extractRichTextByKey(props, config.dispatchConfigRulePropId);

      if (title === "ObjectiveFanoutConfig") {
        const parsedFanout = parseFanoutYaml(title, yamlText);
        fanoutMappings.push(...parsedFanout);
      } else {
        const parsedRoutes = parseDispatchYaml(title, yamlText);
        routes.push(...parsedRoutes);
      }
    }

    if (!data.has_more || !data.next_cursor) {
      break;
    }
    cursor = data.next_cursor;
  }

  if (hasPages && (!sawEnabledProp || !sawRuleProp)) {
    // eslint-disable-next-line no-console
    console.error("[dispatch] config_props_misconfigured", {
      dispatchConfigDbId: config.dispatchConfigDbId,
      missingEnabledProp:
        !!config.dispatchConfigEnabledPropId && !sawEnabledProp ? config.dispatchConfigEnabledPropId : null,
      missingRuleProp:
        !!config.dispatchConfigRulePropId && !sawRuleProp ? config.dispatchConfigRulePropId : null,
    });
    throw new Error("Dispatch config properties are misconfigured; see logs for details.");
  }

  // eslint-disable-next-line no-console
  console.log("[dispatch] config_cache_loaded", {
    routes_count: routes.length,
    fanout_count: fanoutMappings.length,
  });

  return {
    fanoutMappings,
    routes,
  };
}


