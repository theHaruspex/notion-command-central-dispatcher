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
      error: "YAML must be a mapping",
    });
    return [];
  }

  const obj = raw as Record<string, unknown>;

  // Option A: flat shape
  // database_id: "<db>"
  // Status: "Done"
  // OtherProp: "Foo"
  const flatDatabaseId = (obj.database_id as string) || (obj.db as string);
  if (typeof flatDatabaseId === "string" && flatDatabaseId.trim().length > 0) {
    const predicate: DispatchPredicate = { equals: {} };
    for (const [key, value] of Object.entries(obj)) {
      if (key === "database_id" || key === "db") continue;
      if (typeof value === "string" && value.trim().length > 0) {
        predicate.equals[key] = value;
      }
    }

    if (Object.keys(predicate.equals).length === 0) {
      return [
        {
          routeName,
          databaseId: flatDatabaseId,
        },
      ];
    }

    return [
      {
        routeName,
        databaseId: flatDatabaseId,
        predicate,
      },
    ];
  }

  // Legacy shape: mapping of databaseId -> predicates
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
      error: "YAML must be a mapping",
    });
    return mappings;
  }

  const obj = raw as Record<string, unknown>;

  // Option A: flat shape
  // task_database_id: "<db>"
  // task_objective_prop_id: "<prop>"
  // objective_tasks_prop_id: "<prop>"
  const flatTaskDb =
    (obj.task_database_id as string) || (obj.task_db_id as string) || (obj.db as string);
  if (typeof flatTaskDb === "string" && flatTaskDb.trim().length > 0) {
    const taskObjectivePropId =
      typeof obj.task_objective_prop_id === "string" ? (obj.task_objective_prop_id as string) : "";
    const objectiveTasksPropId =
      typeof obj.objective_tasks_prop_id === "string"
        ? (obj.objective_tasks_prop_id as string)
        : "";

    if (!taskObjectivePropId || !objectiveTasksPropId) {
      // eslint-disable-next-line no-console
      console.error("[dispatch] fanout_config_parse_failed", {
        routeName,
        taskDatabaseId: flatTaskDb,
        error: "Both task_objective_prop_id and objective_tasks_prop_id must be non-empty strings",
      });
      return mappings;
    }

    mappings.push({
      taskDatabaseId: flatTaskDb,
      taskObjectivePropId,
      objectiveTasksPropId,
    });

    return mappings;
  }

  // Legacy shape: mapping of task_db_id -> { task_objective_prop_id, objective_tasks_prop_id }
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



