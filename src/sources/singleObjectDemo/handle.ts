import { getDispatchConfigSnapshot } from "../../dispatchConfig/cache";
import { matchRoutes } from "../../dispatchConfig/match";
import type { DispatchEvent } from "../../dispatchConfig/match";
import { loadConfig } from "../../config";
import { notionRequest } from "../../notion/client";

const config = loadConfig();

interface SingleObjectResult {
  matchedRoutes: string[];
  commandsCreated: number;
}

export async function handleSingleObjectEvent(event: DispatchEvent, requestId: string): Promise<SingleObjectResult> {
  const snapshot = await getDispatchConfigSnapshot();
  const matched = matchRoutes(event, snapshot.routes);

  const matchedRouteNames = matched.map((r) => r.routeName);

  // eslint-disable-next-line no-console
  console.log("[dispatch] dispatch_routing_decision", {
    request_id: requestId,
    origin_database_id: event.originDatabaseId,
    origin_page_id: event.originPageId,
    new_status: event.newStatusName,
    matched_routes: matchedRouteNames,
  });

  if (!config.commandsDbId) {
    throw new Error("COMMANDS_DB_ID is not configured");
  }
  if (!config.commandsTargetPagePropId) {
    throw new Error("COMMANDS_TARGET_PAGE_PROP_ID is not configured");
  }

  let commandsCreated = 0;

  for (const route of matched) {
    const title = route.routeName;

    const body: any = {
      parent: {
        database_id: config.commandsDbId,
      },
      properties: {
        [config.commandsTargetPagePropId]: {
          relation: [{ id: event.originPageId }],
        },
      },
    };

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
      // Use the Commands DB title property
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

    const response = await notionRequest({
      path: "/pages",
      method: "POST",
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      // eslint-disable-next-line no-console
      console.error("[dispatch] command_create_failed", {
        request_id: requestId,
        routeName: route.routeName,
        origin_page_id: event.originPageId,
        status: response.status,
        body: text,
      });
      continue;
    }

    const created = (await response.json()) as { id?: string };
    const commandId = created.id ?? "unknown";
    commandsCreated += 1;

    // eslint-disable-next-line no-console
    console.log("[dispatch] command_created", {
      request_id: requestId,
      routeName: route.routeName,
      command_page_id: commandId,
      origin_page_id: event.originPageId,
    });
  }

  return {
    matchedRoutes: matchedRouteNames,
    commandsCreated,
  };
}


