import { loadConfig } from "../config";
import type { WebhookEvent } from "../webhook/normalizeWebhook";
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

  let commandsCreated = 0;

  for (const routeName of plan.matchedRouteNames) {
    // eslint-disable-next-line no-console
    console.log("[dispatch] creating_origin_command", {
      request_id: requestId,
      routeName,
      directive_command_prop_key: config.commandsDirectiveCommandPropId,
    });

    try {
      await createCommand({
        commandsDbId: config.commandsDbId,
        titlePropNameOrId: config.commandsCommandNamePropId || "Name",
        commandTitle: routeName,
        triggerKeyPropId: config.commandsTriggerKeyPropId,
        triggerKeyValue: config.commandTriggerKey,
        directiveCommandPropId: config.commandsDirectiveCommandPropId || undefined,
        directiveCommandValues: config.commandsDirectiveCommandPropId ? [routeName] : undefined,
        targetRelationPropId: config.commandsTargetPagePropId,
        targetPageId: plan.originPageId,
      });
      commandsCreated += 1;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[dispatch] create_origin_command_failed", {
        request_id: requestId,
        routeName,
        error: err,
      });
    }
  }

  return {
    ok: true,
    request_id: requestId,
    fanout_applied: false,
    objective_id: null,
    matched_routes: plan.matchedRouteNames,
    commands_created: commandsCreated,
  };
}


