import express, { Request, Response } from "express";
import { loadConfig } from "./config";
import { handleDebugWebhook } from "./webhook/debug";

const config = loadConfig();
const app = express();

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.post("/webhook/debug", (req: Request, res: Response) => {
  void handleDebugWebhook(req, res);
});

const port = config.port;

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${port}`);
});


