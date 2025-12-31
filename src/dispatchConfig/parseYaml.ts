import yaml from "js-yaml";
import type { DispatchRoute, DispatchPredicate, FanoutMapping } from "./types";

interface RawRuleMap {
  [databaseId: string]: null | Record<string, unknown> | undefined;
}

export function parseDispatchYaml(routeName: string, yamlText: string): DispatchRoute[] {
  if (!yamlText.trim()) {
    return [];
  }

  let raw: unknown;
  try {
    raw = yaml.load(yamlText);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[dispatch] dispatch_rule_parse_failed", { routeName, error: err });
    return [];
  }

  if (!raw || typeof raw !== "object") {
    // eslint-disable-next-line no-console
    console.error("[dispatch] dispatch_rule_parse_failed", {
      routeName,
      error: "YAML must be a mapping of databaseId -> predicates",
    });
    return [];
  }

  const rules: DispatchRoute[] = [];
  const rawMap = raw as RawRuleMap;

  for (const [databaseId, value] of Object.entries(rawMap)) {
    if (!databaseId.trim()) continue;

    // Match-all for a DB
    if (value == null || (typeof value === "object" && Object.keys(value).length === 0)) {
      rules.push({
        routeName,
        databaseId,
      });
      continue;
    }

    if (typeof value !== "object") {
      // eslint-disable-next-line no-console
      console.error("[dispatch] dispatch_rule_parse_failed", {
        routeName,
        databaseId,
        error: "Expected mapping of predicates",
      });
      continue;
    }

    const predicates = value as Record<string, unknown>;
    const predicate: DispatchPredicate = { equals: {} };
    let invalid = false;

    for (const [propName, v] of Object.entries(predicates)) {
      if (typeof v === "string" && v.trim().length > 0) {
        predicate.equals[propName] = v;
      } else {
        // eslint-disable-next-line no-console
        console.error("[dispatch] dispatch_rule_parse_failed", {
          routeName,
          databaseId,
          error: `Predicate for property '${propName}' must be a non-empty string`,
        });
        invalid = true;
        break;
      }
    }

    if (invalid || Object.keys(predicate.equals).length === 0) {
      continue;
    }

    rules.push({
      routeName,
      databaseId,
      predicate,
    });
  }

  return rules;
}

interface RawFanoutMapValue {
  task_objective_prop_id?: unknown;
  objective_tasks_prop_id?: unknown;
  [key: string]: unknown;
}

export function parseFanoutYaml(routeName: string, yamlText: string): FanoutMapping[] {
  const mappings: FanoutMapping[] = [];

  if (!yamlText.trim()) {
    return mappings;
  }

  let raw: unknown;
  try {
    raw = yaml.load(yamlText);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[dispatch] fanout_config_parse_failed", { routeName, error: err });
    return mappings;
  }

  if (!raw || typeof raw !== "object") {
    // eslint-disable-next-line no-console
    console.error("[dispatch] fanout_config_parse_failed", {
      routeName,
      error: "YAML must be a mapping of task_db_id -> { task_objective_prop_id, objective_tasks_prop_id }",
    });
    return mappings;
  }

  const rawMap = raw as Record<string, RawFanoutMapValue>;

  for (const [taskDatabaseId, value] of Object.entries(rawMap)) {
    if (!taskDatabaseId.trim()) continue;
    if (!value || typeof value !== "object") {
      // eslint-disable-next-line no-console
      console.error("[dispatch] fanout_config_parse_failed", {
        routeName,
        taskDatabaseId,
        error: "Expected mapping with task_objective_prop_id and objective_tasks_prop_id",
      });
      continue;
    }

    const taskObjectivePropId = typeof value.task_objective_prop_id === "string" ? value.task_objective_prop_id : "";
    const objectiveTasksPropId =
      typeof value.objective_tasks_prop_id === "string" ? value.objective_tasks_prop_id : "";

    if (!taskObjectivePropId || !objectiveTasksPropId) {
      // eslint-disable-next-line no-console
      console.error("[dispatch] fanout_config_parse_failed", {
        routeName,
        taskDatabaseId,
        error: "Both task_objective_prop_id and objective_tasks_prop_id must be non-empty strings",
      });
      continue;
    }

    mappings.push({
      taskDatabaseId,
      taskObjectivePropId,
      objectiveTasksPropId,
    });
  }

  return mappings;
}



