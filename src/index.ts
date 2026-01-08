import crypto from "crypto";
import express from "express";
import type { Request, Response } from "express";
import { loadConfig } from "./lib/config";
import { createRequestContext } from "./lib/logging";
import { maybeCaptureWebhook } from "./lib/webhook/capture";
import { WebhookAuthError, WebhookParseError } from "./lib/webhook/errors";
import { handleDispatchWebhook } from "./apps/dispatch/handler";
import { handleEventsWebhook } from "./apps/events/handler";

const config = loadConfig();

const app = express();
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

function captureDirFor(appName: "dispatch" | "events"): string {
  const base = process.env.WEBHOOK_CAPTURE_DIR ?? "captures/webhooks";
  return `${base}/${appName}`;
}

async function handleWebhookRequest(
  appName: "dispatch" | "events",
  req: Request,
  res: Response,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const ctx = createRequestContext({ app: appName, requestId });

  try {
    const captureEnabled = process.env.WEBHOOK_CAPTURE === "1";
    const captureDir = captureDirFor(appName);

    await maybeCaptureWebhook({
      enabled: captureEnabled,
      captureDir,
      requestId,
      headers: req.headers as Record<string, unknown>,
      body: req.body,
    });

    if (captureEnabled) {
      ctx.log("info", "captured_webhook", { capture_dir: captureDir });
    }

    // Preserve existing ingress visibility (still logs the body, as before).
    // eslint-disable-next-line no-console
    console.log(`[/webhook/${appName}] webhook_received`, {
      request_id: requestId,
      body: req.body,
    });

    const result =
      appName === "dispatch"
        ? await handleDispatchWebhook({ ctx, headers: req.headers, body: req.body })
        : await handleEventsWebhook({ ctx, headers: req.headers, body: req.body });

    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof WebhookAuthError) {
      return res.status(401).json({ ok: false, error: "Invalid webhook shared secret" });
    }
    if (err instanceof WebhookParseError) {
      return res.status(400).json({ ok: false, error: err.message, request_id: requestId });
    }
    // eslint-disable-next-line no-console
    console.error(`[/webhook/${appName}] unexpected_error`, {
      error: err,
    });
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
}

app.post("/webhook/dispatch", async (req: Request, res: Response) => {
  return await handleWebhookRequest("dispatch", req, res);
});

app.post("/webhook/events", async (req: Request, res: Response) => {
  return await handleWebhookRequest("events", req, res);
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${config.port}`);
});


