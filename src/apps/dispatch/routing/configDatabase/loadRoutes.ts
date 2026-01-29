import { loadConfig } from "../../../../lib/config";
import { queryDatabase } from "../../notion";
import { normalizeNotionId } from "../../../../lib/notion/utils";
import { createSpineLogger } from "../../../../lib/logging";
import type { RequestContext } from "../../../../lib/logging";
import type {
  DispatchConfigSnapshot,
  DispatchRoute,
  FanoutMapping,
  DispatchPredicate,
} from "./types";

const config = loadConfig().dispatch;
const debugPayloads = process.env.DEBUG_PAYLOADS === "1";

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

export async function loadDispatchConfig(ctx?: RequestContext): Promise<DispatchConfigSnapshot> {
  if (!config.dispatchConfigDbId) {
    throw new Error("DISPATCH_CONFIG_DB_ID is not configured");
  }

  const log = ctx ? ctx.withDomain("routing:config") : createSpineLogger({ app: "dispatch", domain: "routing:config" });
  const routes: DispatchRoute[] = [];
  const fanoutMappings: FanoutMapping[] = [];
  let hasPages = false;
  let cursor: string | null | undefined;

  log.log("info", "config_cache_refresh_started", {
    dispatch_config_db_id: config.dispatchConfigDbId,
  });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let data: QueryResponse;
    try {
      data = (await queryDatabase(ctx, config.dispatchConfigDbId, {
        startCursor: cursor ?? null,
      })) as QueryResponse;
    } catch (err) {
      log.log("error", "config_cache_refresh_failed", {
        dispatch_config_db_id: config.dispatchConfigDbId,
        error: err instanceof Error ? err.message : String(err),
        error_stack: err instanceof Error && process.env.DEBUG_STACKS === "1" ? err.stack : undefined,
      });
      throw err;
    }

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
      const originDatabaseId = originDatabaseIdRaw ? normalizeNotionId(originDatabaseIdRaw) : "";

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

      log.log("info", "config_row_evaluated", {
        page_id: page.id,
        title,
        enabled,
        origin_database_id: originDatabaseIdRaw,
        rule_type: ruleType,
        condition_property_name: conditionPropertyName,
        condition_value: conditionValue,
      });

      if (debugPayloads) {
        const preview = JSON.stringify(props);
        log.log("info", "config_row_properties", {
          page_id: page.id,
          properties_preview: preview.length > 500 ? `${preview.slice(0, 500)}...` : preview,
        });
      }

      if (!enabled) continue;

      if (!originDatabaseId || !ruleType) {
        log.log("error", "config_row_invalid", {
          page_id: page.id,
          title,
          origin_database_id: originDatabaseId,
          rule_type: ruleType,
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
          log.log("error", "fanout_config_row_invalid", {
            page_id: page.id,
            title,
            origin_database_id: originDatabaseId,
            task_objective_prop_id: taskObjectivePropId,
            objective_tasks_prop_id: objectiveTasksPropId,
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
    log.log("warn", "config_db_empty", {
      dispatch_config_db_id: config.dispatchConfigDbId,
    });
  }

  return {
    routes,
    fanoutMappings,
  };
}


