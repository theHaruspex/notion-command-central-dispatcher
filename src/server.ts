import express, { Request, Response } from "express";
import crypto from "crypto";
import { loadConfig } from "./config";
import { handleWebhook } from "./webhook";
import { WebhookAuthError, WebhookParseError } from "./webhook/errors";

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

    const result = await handleWebhook({
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

const port = config.port;

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${port}`);
});


