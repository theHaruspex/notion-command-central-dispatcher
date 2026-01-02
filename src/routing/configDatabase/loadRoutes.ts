import { loadConfig } from "../../config";
import { notionRequest } from "../../notion/client";
import type {
  DispatchConfigSnapshot,
  DispatchRoute,
  FanoutMapping,
  DispatchPredicate,
} from "./types";

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

function normalizeDatabaseId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
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

      const originDbIdProp = props["Origin Database ID"];
      const originDatabaseIdRaw: string =
        originDbIdProp && originDbIdProp.type === "rich_text" && Array.isArray(originDbIdProp.rich_text)
          ? originDbIdProp.rich_text
              .map((t: any) => t.plain_text || t.text?.content || "")
              .join("")
              .trim()
          : "";
      const originDatabaseId = originDatabaseIdRaw ? normalizeDatabaseId(originDatabaseIdRaw) : "";

      const ruleTypeProp = props["Rule Tyoe"];
      const ruleType: string | null =
        ruleTypeProp &&
        typeof ruleTypeProp === "object" &&
        ruleTypeProp.type === "select" &&
        ruleTypeProp.select &&
        typeof ruleTypeProp.select.name === "string"
          ? ruleTypeProp.select.name
          : null;

      const conditionPropNameProp = props["Condition 1: Property Name"];
      const conditionPropertyName: string =
        conditionPropNameProp &&
        conditionPropNameProp.type === "rich_text" &&
        Array.isArray(conditionPropNameProp.rich_text)
          ? conditionPropNameProp.rich_text
              .map((t: any) => t.plain_text || t.text?.content || "")
              .join("")
              .trim()
          : "";

      const conditionValueProp = props["Condition 1: Value"];
      const conditionValue: string =
        conditionValueProp &&
        conditionValueProp.type === "rich_text" &&
        Array.isArray(conditionValueProp.rich_text)
          ? conditionValueProp.rich_text
              .map((t: any) => t.plain_text || t.text?.content || "")
              .join("")
              .trim()
          : "";

      const title = extractTitle(props) || page.id;
      const enabled = extractCheckboxByKey(props, config.dispatchConfigEnabledPropId);

      // eslint-disable-next-line no-console
      console.log("[dispatch] config_row_evaluated", {
        page_id: page.id,
        title,
        enabled,
        originDatabaseId: originDatabaseIdRaw,
        ruleType,
        conditionPropertyName,
        conditionValue,
      });

      // eslint-disable-next-line no-console
      console.log("[dispatch] config_row_properties", {
        page_id: page.id,
        properties: props,
      });

      if (!enabled) continue;

      if (!originDatabaseId || !ruleType) {
        // eslint-disable-next-line no-console
        console.error("[dispatch] config_row_invalid", {
          page_id: page.id,
          title,
          originDatabaseId,
          ruleType,
        });
        continue;
      }

      if (ruleType === "DispatchCommand") {
        const pred: DispatchPredicate | undefined =
          conditionPropertyName && conditionValue
            ? { equals: { [conditionPropertyName]: conditionValue } }
            : undefined;

        routes.push({
          routeName: title,
          databaseId: originDatabaseId,
          predicate: pred,
        });
      } else if (ruleType === "ObjectiveFanoutConfig") {
        const taskObjectivePropIdProp = props["Task → Objective Property ID"];
        const taskObjectivePropId: string =
          taskObjectivePropIdProp &&
          taskObjectivePropIdProp.type === "rich_text" &&
          Array.isArray(taskObjectivePropIdProp.rich_text)
            ? taskObjectivePropIdProp.rich_text
                .map((t: any) => t.plain_text || t.text?.content || "")
                .join("")
                .trim()
            : "";

        const objectiveTasksPropIdProp = props["Objective → Tasks Property ID"];
        const objectiveTasksPropId: string =
          objectiveTasksPropIdProp &&
          objectiveTasksPropIdProp.type === "rich_text" &&
          Array.isArray(objectiveTasksPropIdProp.rich_text)
            ? objectiveTasksPropIdProp.rich_text
                .map((t: any) => t.plain_text || t.text?.content || "")
                .join("")
                .trim()
            : "";

        if (!taskObjectivePropId || !objectiveTasksPropId) {
          // eslint-disable-next-line no-console
          console.error("[dispatch] fanout_config_row_invalid", {
            page_id: page.id,
            title,
            originDatabaseId,
            taskObjectivePropId,
            objectiveTasksPropId,
          });
          continue;
        }

        const mapping: FanoutMapping = {
          taskDatabaseId: originDatabaseId,
          taskObjectivePropId,
          objectiveTasksPropId,
          conditionPropertyName: conditionPropertyName || undefined,
          conditionValue: conditionValue || undefined,
        };

        fanoutMappings.push(mapping);
      }
    }

    if (!data.has_more || !data.next_cursor) {
      break;
    }

    cursor = data.next_cursor;
  }

  if (!hasPages) {
    // eslint-disable-next-line no-console
    console.warn("[dispatch] config_db_empty", {
      dispatchConfigDbId: config.dispatchConfigDbId,
    });
  }

  return {
    routes,
    fanoutMappings,
  };
}


