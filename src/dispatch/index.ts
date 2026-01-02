import { loadConfig } from "../config";
import { getDispatchConfigSnapshot } from "./config/cache";
import { matchRoutes } from "./match";
import type { DispatchEvent } from "./match";
import { getObjectiveIdForTask } from "../notion/api";
import { notionRequest } from "../notion/client";
import { enqueueObjectiveEvent } from "../coordinator/objectiveCoordinator";
import type { AutomationEvent } from "../types";
import type { NormalizedEvent } from "../sources/normalizeWebhook";

const config = loadConfig();

export interface DispatchWebhookArgs {
  requestId: string;
  normalizedEvent: NormalizedEvent;
}

export interface DispatchWebhookResult {
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

export async function dispatchWebhookEvent(
  args: DispatchWebhookArgs,
): Promise<DispatchWebhookResult> {
  const { requestId, normalizedEvent } = args;

  const snapshot = await getDispatchConfigSnapshot();

  const originDatabaseIdKey = normalizeDatabaseId(normalizedEvent.originDatabaseId);

  const dispatchEvent: DispatchEvent = {
    originDatabaseId: originDatabaseIdKey,
    originPageId: normalizedEvent.originPageId,
    properties: normalizedEvent.properties,
  };

  const matchedRoutes = matchRoutes(dispatchEvent, snapshot.routes);

  let fanoutApplied = false;
  let objectiveId: string | null = null;

  // eslint-disable-next-line no-console
  console.log("[/webhook] dispatch_routing_decision", {
    request_id: requestId,
    origin_database_id: normalizedEvent.originDatabaseId,
    origin_page_id: normalizedEvent.originPageId,
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
      origin_database_id: normalizedEvent.originDatabaseId,
    });

    objectiveId = await getObjectiveIdForTask(
      normalizedEvent.originPageId,
      fanoutMapping.taskObjectivePropId,
    );

    if (objectiveId) {
      fanoutApplied = true;
      // eslint-disable-next-line no-console
      console.log("[/webhook] fanout_started", {
        request_id: requestId,
        objective_id: objectiveId,
      });

      const fanoutEvent: AutomationEvent = {
        taskId: normalizedEvent.originPageId,
        objectiveId,
        objectiveTasksRelationPropIdOverride: fanoutMapping.objectiveTasksPropId,
      };

      enqueueObjectiveEvent(fanoutEvent);
    }
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

      const body: any = {
        parent: {
          database_id: config.commandsDbId,
        },
        properties: {
          [config.commandsTargetPagePropId]: {
            relation: [{ id: normalizedEvent.originPageId }],
          },
          [config.commandsTriggerKeyPropId]: {
            rich_text: [
              {
                text: {
                  content: config.commandTriggerKey,
                },
              },
            ],
          },
        },
      };

      if (config.commandsDirectiveCommandPropId) {
        body.properties[config.commandsDirectiveCommandPropId] = {
          multi_select: [
            {
              name: title,
            },
          ],
        };
      }

      if (config.commandsCommandNamePropId) {
        body.properties[config.commandsCommandNamePropId] = {
          title: [
            {
              text: {
                content: title,
              },
            },
          ],
        };
      } else {
        body.properties.Name = {
          title: [
            {
              text: {
                content: title,
              },
            },
          ],
        };
      }

      // eslint-disable-next-line no-console
      console.log("[/webhook] creating_dispatch_command", {
        request_id: requestId,
        routeName: title,
        directive_command_prop_key: config.commandsDirectiveCommandPropId,
        property_keys: Object.keys(body.properties),
      });

      const response = await notionRequest({
        path: "/pages",
        method: "POST",
        body,
      });

      if (!response.ok) {
        const text = await response.text();
        // eslint-disable-next-line no-console
        console.error("[/webhook] create_command_failed", {
          request_id: requestId,
          routeName: title,
          status: response.status,
          body: text,
        });
      } else {
        commandsCreated += 1;
      }
    }
  }

  return {
    ok: true,
    request_id: requestId,
    fanout_applied: fanoutApplied,
    objective_id: objectiveId,
    matched_routes: matchedRoutes.map((r) => r.routeName),
    commands_created: commandsCreated,
  };
}


