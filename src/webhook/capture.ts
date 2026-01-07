import fs from "fs/promises";
import path from "path";

export async function maybeCaptureWebhook(args: {
  enabled: boolean;
  captureDir: string;
  requestId: string;
  headers: Record<string, unknown>;
  body: unknown;
}): Promise<void> {
  if (!args.enabled) return;

  const dir = args.captureDir;
  await fs.mkdir(dir, { recursive: true });

  const payload = {
    receivedAt: new Date().toISOString(),
    requestId: args.requestId,
    headers: args.headers,
    body: args.body,
  };

  const filename = `${Date.now()}_${args.requestId}.json`;
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}


