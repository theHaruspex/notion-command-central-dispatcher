import express, { Request, Response } from "express";
import crypto from "crypto";
import type { RouteWebhookResult } from "./dispatch";
import { WebhookAuthError, WebhookParseError } from "./webhook/errors";

export interface CreateAppArgs {
  handleWebhook: (args: { requestId: string; headers: Request["headers"]; body: unknown }) => Promise<RouteWebhookResult>;
}

export function createApp(args: CreateAppArgs) {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post("/webhook", async (req: Request, res: Response) => {
    const requestId = crypto.randomUUID();
    try {
      // eslint-disable-next-line no-console
      console.log("[/webhook] webhook_received", {
        request_id: requestId,
        body: req.body,
      });

      const result = await args.handleWebhook({
        requestId,
        headers: req.headers,
        body: req.body,
      });

      return res.status(200).json(result);
    } catch (err) {
      if (err instanceof WebhookAuthError) {
        return res.status(401).json({ ok: false, error: "Invalid webhook shared secret" });
      }
      if (err instanceof WebhookParseError) {
        return res
          .status(400)
          .json({ ok: false, error: err.message, request_id: requestId });
      }
      // eslint-disable-next-line no-console
      console.error("[/webhook] unexpected_error", {
        error: err,
      });
      return res.status(500).json({ ok: false, error: "Internal server error" });
    }
  });

  return app;
}

