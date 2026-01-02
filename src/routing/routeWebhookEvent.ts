import { loadConfig } from "../config";
import { getDispatchConfigSnapshot } from "../dispatch/configDatabase";
import { matchRoutes } from "../dispatch/match";
import type { DispatchEvent } from "../dispatch/match";
import { createCommand } from "../dispatch/createCommand";
import { enqueueObjectiveFanoutFromOrigin } from "../dispatch/fanout";
import type { WebhookEvent } from "../webhook/normalizeWebhook";

const config = loadConfig();

export interface RouteWebhookArgs {
  requestId: string;
  webhookEvent: WebhookEvent;
}

export interface RouteWebhookResult {
  ok: true;
  request_id: string;
  fanout_applied: boolean;
  objective_id: string | null;
  matched_routes: string[];
  commands_created: number;
}

function normalizeDatabaseId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

export async function routeWebhookEvent(
  args: RouteWebhookArgs,
): Promise<RouteWebhookResult> {
  const { requestId, webhookEvent } = args;

  const snapshot = await getDispatchConfigSnapshot();

  const originDatabaseIdKey = normalizeDatabaseId(webhookEvent.originDatabaseId);

  const dispatchEvent: DispatchEvent = {
    originDatabaseId: originDatabaseIdKey,
    originPageId: webhookEvent.originPageId,
    properties: webhookEvent.properties,
  };

  const matchedRoutes = matchRoutes(dispatchEvent, snapshot.routes);

  let fanoutApplied = false;
  let objectiveId: string | null = null;

  // eslint-disable-next-line no-console
  console.log("[/webhook] dispatch_routing_decision", {
    request_id: requestId,
    origin_database_id: webhookEvent.originDatabaseId,
    origin_page_id: webhookEvent.originPageId,
    fanout_applied: fanoutApplied,
    objective_id: objectiveId,
    matched_routes: matchedRoutes.map((r) => r.routeName),
  });

  if (matchedRoutes.length === 0) {
    return {
      ok: true,
      request_id: requestId,
      fanout_applied: false,
      objective_id: null,
      matched_routes: [],
      commands_created: 0,
    };
  }

  // If at least one rule matched the origin, optionally fan out.
  const fanoutMapping = snapshot.fanoutMappings.find(
    (m) => m.taskDatabaseId === originDatabaseIdKey,
  );

  if (fanoutMapping) {
    // eslint-disable-next-line no-console
    console.log("[/webhook] fanout_mapping_matched", {
      request_id: requestId,
      origin_database_id: webhookEvent.originDatabaseId,
    });

    await enqueueObjectiveFanoutFromOrigin({
      requestId,
      originTaskId: webhookEvent.originPageId,
      taskObjectivePropId: fanoutMapping.taskObjectivePropId,
      objectiveTasksPropId: fanoutMapping.objectiveTasksPropId,
      matchedRouteNames: matchedRoutes.map((r) => r.routeName),
    });

    fanoutApplied = true;
  }

  // Command creation for matched routes (single-object path only).
  // When fanout is applied, per-task commands are created in the fanout processor instead,
  // so we skip origin-level command creation here to avoid duplicates.
  let commandsCreated = 0;

  if (!fanoutApplied) {
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

    for (const route of matchedRoutes) {
      const title = route.routeName;

      // eslint-disable-next-line no-console
      console.log("[/webhook] creating_dispatch_command", {
        request_id: requestId,
        routeName: title,
        directive_command_prop_key: config.commandsDirectiveCommandPropId,
      });

      try {
        await createCommand({
          commandsDbId: config.commandsDbId,
          titlePropNameOrId: config.commandsCommandNamePropId || "Name",
          commandTitle: title,
          triggerKeyPropId: config.commandsTriggerKeyPropId,
          triggerKeyValue: config.commandTriggerKey,
          directiveCommandPropId: config.commandsDirectiveCommandPropId || undefined,
          directiveCommandValues: config.commandsDirectiveCommandPropId ? [title] : undefined,
          targetRelationPropId: config.commandsTargetPagePropId,
          targetPageId: webhookEvent.originPageId,
        });
        commandsCreated += 1;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[/webhook] create_command_failed", {
          request_id: requestId,
          routeName: title,
          error: err,
        });
      }
    }
  }

  return {
    ok: true,
    request_id: requestId,
    fanout_applied: fanoutApplied,
    objective_id: null,
    matched_routes: matchedRoutes.map((r) => r.routeName),
    commands_created: commandsCreated,
  };
}


