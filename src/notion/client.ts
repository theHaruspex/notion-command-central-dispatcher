import { loadConfig } from "../config";

const config = loadConfig();

const NOTION_BASE_URL = "https://api.notion.com/v1";
const MAX_REQUESTS_PER_SECOND = 3;
const MAX_RETRIES = 3;

type TaskFn<T> = () => Promise<T>;

interface QueueItem {
  task: TaskFn<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

const queue: QueueItem[] = [];
let isWorkerRunning = false;

function startWorker(): void {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  setInterval(() => {
    let processed = 0;
    while (processed < MAX_REQUESTS_PER_SECOND && queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      processed += 1;
      void item
        .task()
        .then(item.resolve)
        .catch(item.reject);
    }
  }, 1000);
}

function enqueue<T>(task: TaskFn<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      task: task as TaskFn<unknown>,
      resolve: resolve as (value: unknown) => void,
      reject,
    });
    startWorker();
  });
}

async function doFetchWithRetry(input: RequestInfo | URL, init: RequestInit, attempt = 1): Promise<Response> {
  const response = await fetch(input, init);

  if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
    const delayMs = 2 ** (attempt - 1) * 500;
    // eslint-disable-next-line no-console
    console.warn("[notion:request] transient error, will retry", {
      status: response.status,
      attempt,
      delayMs,
    });
    await new Promise((r) => setTimeout(r, delayMs));
    return doFetchWithRetry(input, init, attempt + 1);
  }

  return response;
}

export interface NotionRequestOptions {
  path: string;
  method?: string;
  body?: unknown;
  extraHeaders?: HeadersInit;
}

export async function notionRequest(options: NotionRequestOptions): Promise<Response> {
  const { path, method, body, extraHeaders } = options;

  const url = `${NOTION_BASE_URL}${path}`;
  const headers: HeadersInit = {
    Authorization: `Bearer ${config.notionToken}`,
    "Notion-Version": config.notionVersion,
    "Content-Type": "application/json",
  };

  const mergedInit: RequestInit = {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: {
      ...headers,
      ...extraHeaders,
    },
  };

  // eslint-disable-next-line no-console
  console.log("[notion:request] enqueue", { method: mergedInit.method, path });

  return enqueue(() => doFetchWithRetry(url, mergedInit));
}


