import express, { Request, Response } from "express";
import { loadConfig } from "./config";
import { handleDebugWebhook } from "./webhook/debug";
import { parseAutomationWebhook } from "./webhook/parse";
import { enqueueObjectiveEvent } from "./coordinator/objectiveCoordinator";

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
  try {
    // eslint-disable-next-line no-console
    console.log("[/webhook] incoming payload", JSON.stringify(req.body));

    if (config.webhookSharedSecret) {
      const headerSecret = req.header("x-webhook-secret");
      if (!headerSecret || headerSecret !== config.webhookSharedSecret) {
        return res.status(401).json({ ok: false, error: "Invalid webhook shared secret" });
      }
    }

    let event;
    try {
      event = parseAutomationWebhook(req.body);
      // eslint-disable-next-line no-console
      console.log("[/webhook] parsed event", event);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid webhook payload";
      // eslint-disable-next-line no-console
      console.error("[/webhook] parse error", message);
      return res.status(400).json({ ok: false, error: message });
    }

    enqueueObjectiveEvent(event);

    return res.status(200).json({ ok: true, enqueued: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Unexpected error in /webhook:", err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

const port = config.port;

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${port}`);
});


