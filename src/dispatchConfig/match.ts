import type { DispatchRoute } from "./types";

export interface DispatchEvent {
  originDatabaseId: string;
  originPageId: string;
  newStatusName: string;
  /**
   * Raw Notion properties keyed by property name, as received in the webhook.
   */
  properties: Record<string, any>;
}

function getPropertyStringValue(prop: any): string | null {
  if (!prop || typeof prop !== "object") return null;

  switch (prop.type) {
    case "status":
      return prop.status?.name ?? null;
    case "select":
      return prop.select?.name ?? null;
    case "multi_select":
      return Array.isArray(prop.multi_select) && prop.multi_select.length > 0
        ? prop.multi_select.map((o: any) => o.name || "").join(",")
        : null;
    case "title":
      return Array.isArray(prop.title)
        ? prop.title.map((t: any) => t.plain_text || t.text?.content || "").join("")
        : null;
    case "rich_text":
      return Array.isArray(prop.rich_text)
        ? prop.rich_text.map((t: any) => t.plain_text || t.text?.content || "").join("")
        : null;
    case "number":
      return typeof prop.number === "number" ? String(prop.number) : null;
    case "checkbox":
      return typeof prop.checkbox === "boolean" ? String(prop.checkbox) : null;
    default:
      return null;
  }
}

export function matchRoutes(event: DispatchEvent, routes: DispatchRoute[]): DispatchRoute[] {
  const matched: DispatchRoute[] = [];

  for (const route of routes) {
    if (route.databaseId !== event.originDatabaseId) continue;

    const pred = route.predicate;
    if (!pred) {
      matched.push(route);
      // eslint-disable-next-line no-console
      console.log("[dispatch] dispatch_rule_matched", {
        routeName: route.routeName,
        originDatabaseId: event.originDatabaseId,
        originPageId: event.originPageId,
      });
      continue;
    }

    let allMatched = true;
    for (const [propName, expected] of Object.entries(pred.equals)) {
      const prop = event.properties[propName];
      const actual = getPropertyStringValue(prop);
      if (actual !== expected) {
        allMatched = false;
        break;
      }
    }

    if (!allMatched) {
      continue;
    }

    matched.push(route);
    // eslint-disable-next-line no-console
    console.log("[dispatch] dispatch_rule_matched", {
      routeName: route.routeName,
      originDatabaseId: event.originDatabaseId,
      originPageId: event.originPageId,
    });
  }

  return matched;
}

