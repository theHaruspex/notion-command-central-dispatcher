import express, { Request, Response } from "express";
import crypto from "crypto";
import { loadConfig } from "./config";
import { normalizeWebhookEvent } from "./webhook/normalizeWebhook";
import { handleWebhookHttp } from "./webhook/handleHttp";

const config = loadConfig();
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

    const result = await handleWebhookHttp({
      requestId,
      normalizedEvent: normalized,
    });

    return res.status(200).json(result);
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


