import { loadConfig } from "../../../lib/config";
import type { WebhookEvent } from "../../../lib/webhook/normalizeWebhook";
import type { RoutePlan } from "../routing/plan";
import { createCommand } from "./createCommand";
import { enqueueObjectiveFanoutFromOrigin } from "./fanout";
import type { RequestContext } from "../../../lib/logging";

const config = loadConfig().dispatch;

export interface RouteWebhookResult {
  ok: true;
  request_id: string;
  fanout_applied: boolean;
  objective_id: string | null;
  matched_routes: string[];
  commands_created: number;
}

export async function executeRoutePlan(args: {
  ctx: RequestContext;
  webhookEvent: WebhookEvent;
  plan: RoutePlan;
}): Promise<RouteWebhookResult> {
  const { ctx, webhookEvent, plan } = args;
  const dispatchCtx = ctx.withDomain("execute");

  if (plan.kind === "noop") {
    return {
      ok: true,
      request_id: ctx.requestId,
      fanout_applied: false,
      objective_id: null,
      matched_routes: [],
      commands_created: 0,
    };
  }

  if (plan.kind === "fanout") {
    dispatchCtx.log("info", "fanout_plan_executing", {
      origin_db: webhookEvent.originDatabaseId,
    });

    await enqueueObjectiveFanoutFromOrigin({
      ctx,
      originTaskId: plan.originTaskId,
      taskObjectivePropId: plan.taskObjectivePropId,
      objectiveTasksPropId: plan.objectiveTasksPropId,
      matchedRouteNames: plan.matchedRouteNames,
    });

    return {
      ok: true,
      request_id: ctx.requestId,
      fanout_applied: true,
      objective_id: null,
      matched_routes: plan.matchedRouteNames,
      commands_created: 0,
    };
  }

  // plan.kind === "single"
  if (!config.commandsDbId) {
    throw new Error("COMMANDS_DB_ID is not configured");
  }
  if (!config.commandsTargetPagePropId) {
    throw new Error("COMMANDS_TARGET_PAGE_PROP_ID is not configured");
  }
  if (!config.commandsTriggerKeyPropId) {
    throw new Error("COMMANDS_TRIGGER_KEY_PROP_ID is not configured");
  }
  if (!config.commandTriggerKey) {
    throw new Error("COMMAND_TRIGGER_KEY is not configured");
  }

  const commandsDbId = config.commandsDbId;
  const commandsTargetPagePropId = config.commandsTargetPagePropId;
  const commandsTriggerKeyPropId = config.commandsTriggerKeyPropId;
  const commandTriggerKey = config.commandTriggerKey;

  const startedAt = Date.now();

  const results = await Promise.allSettled(
    plan.matchedRouteNames.map(async (routeName) => {
      dispatchCtx.log("info", "creating_origin_command", {
        route: routeName,
        directive_command_prop_key: config.commandsDirectiveCommandPropId,
      });

      await createCommand({
        ctx,
        commandsDbId,
        titlePropNameOrId: config.commandsCommandNamePropId || "Name",
        commandTitle: routeName,
        triggerKeyPropId: commandsTriggerKeyPropId,
        triggerKeyValue: commandTriggerKey,
        directiveCommandPropId: config.commandsDirectiveCommandPropId || undefined,
        directiveCommandValues: config.commandsDirectiveCommandPropId ? [routeName] : undefined,
        targetRelationPropId: commandsTargetPagePropId,
        targetPageId: plan.originPageId,
      });
    }),
  );

  const commandsCreated = results.filter((r) => r.status === "fulfilled").length;
  const failedCount = results.filter((r) => r.status === "rejected").length;

  results.forEach((r, idx) => {
    if (r.status === "fulfilled") return;
    const routeName = plan.matchedRouteNames[idx];
    dispatchCtx.log("error", "create_origin_command_failed", {
      route: routeName,
      error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      error_stack: r.reason instanceof Error && process.env.DEBUG_STACKS === "1" ? r.reason.stack : undefined,
    });
  });

  dispatchCtx.log("info", "origin_commands_batch_completed", {
    matched_route_count: plan.matchedRouteNames.length,
    commands_created: commandsCreated,
    failed_count: failedCount,
    duration_ms: Date.now() - startedAt,
  });

  return {
    ok: true,
    request_id: ctx.requestId,
    fanout_applied: false,
    objective_id: null,
    matched_routes: plan.matchedRouteNames,
    commands_created: commandsCreated,
  };
}


