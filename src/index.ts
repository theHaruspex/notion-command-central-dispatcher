import crypto from "crypto";
import type { Request, Response } from "express";
import { loadConfig } from "./config";
import { createApp } from "./server";
import { authenticateAndNormalizeWebhook } from "./webhook";
import { routeWebhookEvent } from "./routing";
import { executeRoutePlan } from "./dispatch";
import { WebhookAuthError, WebhookParseError } from "./webhook/errors";
import { maybeCaptureWebhook } from "./webhook/capture";

const config = loadConfig();

const app = createApp();

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.post("/webhook", async (req: Request, res: Response) => {
  const requestId = crypto.randomUUID();
  try {
    const captureDir = process.env.WEBHOOK_CAPTURE_DIR ?? "captures/webhooks";
    const captureEnabled = process.env.WEBHOOK_CAPTURE === "1";
    await maybeCaptureWebhook({
      enabled: captureEnabled,
      captureDir,
      requestId,
      headers: req.headers as Record<string, unknown>,
      body: req.body,
    });
    if (captureEnabled) {
      // eslint-disable-next-line no-console
      console.log("[/webhook] captured_webhook", { request_id: requestId, captureDir });
    }

    // eslint-disable-next-line no-console
    console.log("[/webhook] webhook_received", {
      request_id: requestId,
      body: req.body,
    });

    const webhookEvent = await authenticateAndNormalizeWebhook({
      headers: req.headers,
      body: req.body,
    });

    const plan = await routeWebhookEvent({ requestId, webhookEvent });
    const result = await executeRoutePlan({ requestId, webhookEvent, plan });

    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof WebhookAuthError) {
      return res.status(401).json({ ok: false, error: "Invalid webhook shared secret" });
    }
    if (err instanceof WebhookParseError) {
      return res.status(400).json({ ok: false, error: err.message, request_id: requestId });
    }
    // eslint-disable-next-line no-console
    console.error("[/webhook] unexpected_error", {
      error: err,
    });
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${config.port}`);
});


