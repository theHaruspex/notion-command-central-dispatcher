import { loadConfig } from "../../../lib/config";
import type { WebhookEvent } from "../../../lib/webhook/normalizeWebhook";
import type { RoutePlan } from "../routing/plan";
import { createCommand } from "./createCommand";
import { enqueueObjectiveFanoutFromOrigin } from "./fanout";

const config = loadConfig();

export interface RouteWebhookResult {
  ok: true;
  request_id: string;
  fanout_applied: boolean;
  objective_id: string | null;
  matched_routes: string[];
  commands_created: number;
}

export async function executeRoutePlan(args: {
  requestId: string;
  webhookEvent: WebhookEvent;
  plan: RoutePlan;
}): Promise<RouteWebhookResult> {
  const { requestId, webhookEvent, plan } = args;

  if (plan.kind === "noop") {
    return {
      ok: true,
      request_id: requestId,
      fanout_applied: false,
      objective_id: null,
      matched_routes: [],
      commands_created: 0,
    };
  }

  if (plan.kind === "fanout") {
    // eslint-disable-next-line no-console
    console.log("[dispatch] fanout_plan_executing", {
      request_id: requestId,
      origin_database_id: webhookEvent.originDatabaseId,
    });

    await enqueueObjectiveFanoutFromOrigin({
      requestId,
      originTaskId: plan.originTaskId,
      taskObjectivePropId: plan.taskObjectivePropId,
      objectiveTasksPropId: plan.objectiveTasksPropId,
      matchedRouteNames: plan.matchedRouteNames,
    });

    return {
      ok: true,
      request_id: requestId,
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
      // eslint-disable-next-line no-console
      console.log("[dispatch] creating_origin_command", {
        request_id: requestId,
        routeName,
        directive_command_prop_key: config.commandsDirectiveCommandPropId,
      });

      await createCommand({
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
    // eslint-disable-next-line no-console
    console.error("[dispatch] create_origin_command_failed", {
      request_id: requestId,
      routeName,
      error: r.reason,
    });
  });

  // eslint-disable-next-line no-console
  console.log("[dispatch] origin_commands_batch_completed", {
    request_id: requestId,
    matchedRouteCount: plan.matchedRouteNames.length,
    commandsCreated,
    failedCount,
    durationMs: Date.now() - startedAt,
  });

  return {
    ok: true,
    request_id: requestId,
    fanout_applied: false,
    objective_id: null,
    matched_routes: plan.matchedRouteNames,
    commands_created: commandsCreated,
  };
}


