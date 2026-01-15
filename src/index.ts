import crypto from "crypto";
import express from "express";
import type { Request, Response } from "express";
import { loadConfig } from "./lib/config";
import { createRequestContext } from "./lib/logging";
import { maybeCaptureWebhook } from "./lib/webhook/capture";
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

function extractSourceEventId(body: unknown): string | null {
  try {
    if (!body || typeof body !== "object") return null;
    const b: any = body as any;
    const source = b.source;
    const eventId = source?.event_id;
    return typeof eventId === "string" && eventId ? eventId : null;
  } catch {
    return null;
  }
}

async function handleWebhookRequest(
  appName: "dispatch" | "events",
  req: Request,
  res: Response,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  const ctx = createRequestContext({ app: appName, requestId });
  const startedAt = Date.now();

  res.on("finish", () => {
    ctx.log("info", "http_response_finished", {
      status_code: res.statusCode,
      duration_ms: Date.now() - startedAt,
      app_name: appName,
      request_id: requestId,
      content_length: res.getHeader("content-length"),
      headers_sent: res.headersSent,
    });
  });

  res.on("close", () => {
    ctx.log("warn", "http_response_closed", {
      status_code: res.statusCode,
      duration_ms: Date.now() - startedAt,
      app_name: appName,
      request_id: requestId,
      content_length: res.getHeader("content-length"),
      headers_sent: res.headersSent,
    });
  });

  const captureEnabled = process.env.WEBHOOK_CAPTURE === "1";
  const captureDir = captureDirFor(appName);

  try {
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

    const sourceEventId = extractSourceEventId(req.body);
    ctx.log("info", "http_request_received", { source_event_id: sourceEventId });

    // Preserve existing ingress visibility (still logs the body, as before).
    // eslint-disable-next-line no-console
    console.log(`[/webhook/${appName}] webhook_received`, {
      request_id: requestId,
      source_event_id: sourceEventId,
      body: req.body,
    });

    // Acceptance: ack is sent immediately; async processing logs later.
    ctx.log("info", "ack_sent", { app_name: appName });
    res.status(200).json({ ok: true, request_id: requestId, ack: true });

    void Promise.resolve().then(async () => {
      try {
        if (appName === "dispatch") {
          await handleDispatchWebhook({ ctx, headers: req.headers, body: req.body });
        } else {
          await handleEventsWebhook({ ctx, headers: req.headers, body: req.body });
        }
        ctx.log("info", "async_processing_completed", {
          app_name: appName,
          duration_ms: Date.now() - ctx.startedAtMs,
        });
      } catch (err) {
        const error =
          err instanceof Error
            ? { message: err.message, stack: err.stack }
            : { value: String(err) };
        ctx.log("error", "async_processing_failed", { app_name: appName, error });
      }
    });

    return res;
  } catch (err) {
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


