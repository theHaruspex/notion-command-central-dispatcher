import { getDispatchConfigSnapshot } from "./configDatabase";
import { matchRoutes } from "./match";
import type { DispatchEvent } from "./match";
import type { WebhookEvent } from "../../../lib/webhook/normalizeWebhook";
import type { RoutePlan } from "./plan";
import { normalizeNotionId } from "../../../lib/notion/utils";
import type { RequestContext } from "../../../lib/logging";

export interface RouteWebhookArgs {
  ctx: RequestContext;
  webhookEvent: WebhookEvent;
}

export async function routeWebhookEvent(
  args: RouteWebhookArgs,
): Promise<RoutePlan> {
  const { ctx, webhookEvent } = args;
  const routingCtx = ctx.withDomain("routing");

  const snapshot = await getDispatchConfigSnapshot(ctx);

  const originDatabaseIdKey = normalizeNotionId(webhookEvent.originDatabaseId);

  const dispatchEvent: DispatchEvent = {
    originDatabaseId: originDatabaseIdKey,
    originPageId: webhookEvent.originPageId,
    properties: webhookEvent.properties,
  };

  const matchedRoutes = matchRoutes(dispatchEvent, snapshot.routes, routingCtx);
  const matchedRouteNames = matchedRoutes.map((r) => r.routeName);

  routingCtx.log("info", "route_plan_created", {
    origin_db: webhookEvent.originDatabaseId,
    origin_page_id: webhookEvent.originPageId,
    matched_routes: matchedRouteNames,
  });

  if (matchedRoutes.length === 0) {
    return {
      kind: "noop",
      matchedRouteNames,
      originDatabaseIdKey,
      originPageId: webhookEvent.originPageId,
    };
  }

  // If at least one rule matched the origin, optionally fan out.
  const fanoutMapping = snapshot.fanoutMappings.find(
    (m) => m.taskDatabaseId === originDatabaseIdKey,
  );

  if (fanoutMapping) {
    return {
      kind: "fanout",
      matchedRouteNames,
      originDatabaseIdKey,
      originTaskId: webhookEvent.originPageId,
      taskObjectivePropId: fanoutMapping.taskObjectivePropId,
      objectiveTasksPropId: fanoutMapping.objectiveTasksPropId,
    };
  }

  return {
    kind: "single",
    matchedRouteNames,
    originDatabaseIdKey,
    originPageId: webhookEvent.originPageId,
  };
}


