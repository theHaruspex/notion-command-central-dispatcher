import type { DispatchRoute } from "./types";

export interface DispatchEvent {
  originDatabaseId: string;
  originPageId: string;
  newStatusName: string;
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

    if (pred.statusEquals && pred.statusEquals !== event.newStatusName) {
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


