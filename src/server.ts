import express, { Request, Response } from "express";
import crypto from "crypto";
import { loadConfig } from "./config";
import { handleDebugWebhook } from "./webhook/debug";
import { enqueueObjectiveEvent } from "./coordinator/objectiveCoordinator";
import { normalizeWebhookEvent } from "./sources/normalizeWebhook";
import { getDispatchConfigSnapshot } from "./dispatchConfig/cache";
import { matchRoutes } from "./dispatchConfig/match";
import type { DispatchEvent } from "./dispatchConfig/match";
import { getObjectiveIdForTask } from "./notion/api";
import type { AutomationEvent } from "./types";

const config = loadConfig();
const app = express();

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.post("/webhook/debug", (req: Request, res: Response) => {
  void handleDebugWebhook(req, res);
});

app.post("/webhook", async (req: Request, res: Response) => {
  const requestId = crypto.randomUUID();
  try {
    // eslint-disable-next-line no-console
    console.log("[/webhook] webhook_received", {
      request_id: requestId,
      body: req.body,
    });

    if (config.webhookSharedSecret) {
      const headerSecret = req.header("x-webhook-secret");
      if (!headerSecret || headerSecret !== config.webhookSharedSecret) {
        return res.status(401).json({ ok: false, error: "Invalid webhook shared secret" });
      }
    }

    let normalized;
    try {
      normalized = normalizeWebhookEvent(req.body);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid webhook payload";
      // eslint-disable-next-line no-console
      console.error("[/webhook] parse error", { request_id: requestId, error: message });
      return res.status(400).json({ ok: false, error: message, request_id: requestId });
    }

    const snapshot = await getDispatchConfigSnapshot();

    let fanoutApplied = false;
    let objectiveId: string | null = null;

    // Fan-out path driven by ObjectiveFanoutConfig row
    const fanoutMapping = snapshot.fanoutMappings.find(
      (m) => m.taskDatabaseId === normalized.originDatabaseId,
    );

    if (fanoutMapping) {
      // eslint-disable-next-line no-console
      console.log("[/webhook] fanout_mapping_matched", {
        request_id: requestId,
        origin_database_id: normalized.originDatabaseId,
      });

      objectiveId = await getObjectiveIdForTask(
        normalized.originPageId,
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
          taskId: normalized.originPageId,
          objectiveId,
          newStatus: normalized.newStatusName,
          objectiveTasksRelationPropIdOverride: fanoutMapping.objectiveTasksPropId,
        };

        enqueueObjectiveEvent(fanoutEvent);
      }
    }

    // Normal dispatch rules
    const dispatchEvent: DispatchEvent = {
      originDatabaseId: normalized.originDatabaseId,
      originPageId: normalized.originPageId,
      newStatusName: normalized.newStatusName,
      properties: normalized.properties,
    };

    const matchedRoutes = matchRoutes(dispatchEvent, snapshot.routes);

    // eslint-disable-next-line no-console
    console.log("[/webhook] dispatch_routing_decision", {
      request_id: requestId,
      origin_database_id: normalized.originDatabaseId,
      origin_page_id: normalized.originPageId,
      new_status_name: normalized.newStatusName,
      fanout_applied: fanoutApplied,
      objective_id: objectiveId,
      matched_routes: matchedRoutes.map((r) => r.routeName),
    });

    // Command creation for matched routes
    if (!config.commandsDbId) {
      throw new Error("COMMANDS_DB_ID is not configured");
    }
    if (!config.commandsTargetPagePropId) {
      throw new Error("COMMANDS_TARGET_PAGE_PROP_ID is not configured");
    }

    let commandsCreated = 0;

    for (const route of matchedRoutes) {
      const title = route.routeName;

      const body: any = {
        parent: {
          database_id: config.commandsDbId,
        },
        properties: {
          [config.commandsTargetPagePropId]: {
            relation: [{ id: normalized.originPageId }],
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
    }

    return res.status(200).json({
      ok: true,
      request_id: requestId,
      fanout_applied: fanoutApplied,
      objective_id: objectiveId,
      matched_routes: matchedRoutes.map((r) => r.routeName),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[/webhook] unexpected_error", {
      error: err,
    });
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

const port = config.port;

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${port}`);
});


