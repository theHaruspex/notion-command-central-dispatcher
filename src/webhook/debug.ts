import type { Request, Response } from "express";
import { promises as fs } from "fs";
import path from "path";

async function ensureSamplesDir(): Promise<string> {
  const dir = path.resolve(process.cwd(), "samples");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function handleDebugWebhook(req: Request, res: Response): Promise<void> {
  // Log headers and body for inspection
  // eslint-disable-next-line no-console
  console.log("[/webhook/debug] headers:", req.headers);
  // eslint-disable-next-line no-console
  console.log("[/webhook/debug] body:", req.body);

  try {
    const dir = await ensureSamplesDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = path.join(dir, `webhook-${timestamp}.json`);

    const payload = {
      receivedAt: new Date().toISOString(),
      headers: req.headers,
      body: req.body,
    };

    await fs.writeFile(filename, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to write debug webhook sample:", err);
  }

  res.status(200).json({ ok: true });
}


