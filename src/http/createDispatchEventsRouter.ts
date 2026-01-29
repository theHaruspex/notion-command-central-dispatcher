import crypto from "crypto";
import express from "express";
import type { Request, Response } from "express";
import { handleDispatchWebhook } from "../apps/dispatch/handler";
import { handleEventsWebhook } from "../apps/events/handler";
import { createRequestContext } from "../lib/logging";
import { maybeCaptureWebhook } from "../lib/webhook/capture";
import { extractOriginPageTitle } from "../lib/webhook/extractOriginPageTitle";

function captureDirFor(appName: "dispatch" | "events"): string {
  const base = process.env.WEBHOOK_CAPTURE_DIR ?? "captures/webhooks";
  return `${base}/${appName}`;
}

function getPayloadPreview(body: unknown, limit = 500): string {
  try {
    if (body === null || body === undefined) return String(body);
    if (typeof body === "string") return body.length > limit ? `${body.slice(0, limit)}...` : body;
    const json = JSON.stringify(body);
    return json.length > limit ? `${json.slice(0, limit)}...` : json;
  } catch {
    return "[unserializable]";
  }
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
  const httpCtx = ctx.withDomain("http");
  const sourceEventId = extractSourceEventId(req.body);
  const originPage = extractOriginPageTitle(req.body) ?? "<unknown>";

  ctx.set({
    source_event_id: sourceEventId,
    origin_page: originPage,
    path: req.path,
  });

  res.on("finish", () => {
    const contentLength = res.getHeader("content-length");
    httpCtx.log("info", "response_finished", {
      status_code: res.statusCode,
      duration_ms: Date.now() - startedAt,
      ...(contentLength !== undefined ? { content_length: contentLength } : {}),
      headers_sent: res.headersSent,
    });
  });

  res.on("close", () => {
    const contentLength = res.getHeader("content-length");
    httpCtx.log("warn", "response_closed", {
      status_code: res.statusCode,
      duration_ms: Date.now() - startedAt,
      ...(contentLength !== undefined ? { content_length: contentLength } : {}),
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
      httpCtx.log("info", "captured_webhook", { capture_dir: captureDir });
    }

    httpCtx.log("info", "request_received");

    if (process.env.DEBUG_PAYLOADS === "1") {
      httpCtx.withDomain("ingress").log("info", "payload_preview", {
        payload_preview: getPayloadPreview(req.body),
      });
    }

    // Acceptance: ack is sent immediately; async processing logs later.
    httpCtx.log("info", "ack_sent");
    res.status(200).json({ ok: true, request_id: requestId, ack: true });

    void Promise.resolve().then(async () => {
      try {
        if (appName === "dispatch") {
          await handleDispatchWebhook({ ctx, headers: req.headers, body: req.body });
        } else {
          await handleEventsWebhook({ ctx, headers: req.headers, body: req.body });
        }
        httpCtx.log("info", "async_processing_completed", {
          duration_ms: Date.now() - ctx.startedAtMs,
        });
      } catch (err) {
        const error =
          err instanceof Error
            ? { message: err.message, name: err.name, stack: err.stack }
            : { value: String(err) };
        httpCtx.log("error", "async_processing_failed", {
          error: error.message ?? error.value,
          error_name: error.name,
          error_stack: process.env.DEBUG_STACKS === "1" ? error.stack : undefined,
        });
      }
    });

    return res;
  } catch (err) {
    httpCtx.log("error", "unexpected_error", {
      error: err instanceof Error ? err.message : String(err),
      error_name: err instanceof Error ? err.name : undefined,
      error_stack: err instanceof Error && process.env.DEBUG_STACKS === "1" ? err.stack : undefined,
    });
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
}

export function createDispatchEventsRouter(): express.Router {
  const router = express.Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  router.post("/webhook/dispatch", async (req: Request, res: Response) => {
    return await handleWebhookRequest("dispatch", req, res);
  });

  router.post("/webhook/events", async (req: Request, res: Response) => {
    return await handleWebhookRequest("events", req, res);
  });

  return router;
}
