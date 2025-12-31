import yaml from "js-yaml";
import type { DispatchRoute, DispatchPredicate } from "./types";

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
    const predicate: DispatchPredicate = {};
    let unsupported = false;

    for (const [key, v] of Object.entries(predicates)) {
      if (key === "Status") {
        if (typeof v === "string" && v.trim().length > 0) {
          predicate.statusEquals = v;
        } else {
          // eslint-disable-next-line no-console
          console.error("[dispatch] dispatch_rule_parse_failed", {
            routeName,
            databaseId,
            error: "Status predicate must be a non-empty string",
          });
          unsupported = true;
          break;
        }
      } else {
        // Unsupported predicate key
        // eslint-disable-next-line no-console
        console.warn("[dispatch] dispatch_rule_unsupported_predicate", {
          routeName,
          databaseId,
          key,
        });
        unsupported = true;
        break;
      }
    }

    if (unsupported) {
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


