## Notion Automation Webhook → Fan-out Commands

Minimal Node 20 + TypeScript service that receives Notion Automation webhooks and fans out **Command** pages for every Task in an Objective.

### How it works

- **/webhook** receives a POST from a Notion database automation (“Send webhook” action).
- Payload is parsed into `{ taskId, objectiveId, triggerKey, newStatus }`.
- If `newStatus !== "Done"`, the request is **ignored** with `200 { "ignored": true }`.
- If `newStatus === "Done"`:
  - The service enumerates all Tasks under the Objective via the Objective’s Tasks relation.
  - It creates one Command page per Task in the Commands DB, setting:
    - **Target Task relation** → that task’s page ID.
    - **Trigger Key** → the `triggerKey` value from the webhook.
- All Notion API calls are globally throttled to **3 requests/second** with lightweight retries on 429/5xx.

### Environment variables

Create a `.env` file next to `package.json`:

```bash
PORT=3000
NOTION_TOKEN=secret_***
NOTION_VERSION=2022-06-28

# Commands database
COMMANDS_DB_ID=your-commands-db-id
COMMANDS_TARGET_TASK_PROP_ID=relation-prop-id-for-target-task
COMMANDS_TRIGGER_KEY_PROP_ID=rich-text-prop-id-for-trigger-key

# Objective → Tasks relation
OBJECTIVE_TASKS_RELATION_PROP_ID=objective-tasks-relation-prop-id

# Optional shared secret for webhook validation
WEBHOOK_SHARED_SECRET=replace-with-random-string
```

> In your own repo, copy this into `.env.example` so others have a reference template.

### Running locally

Install dependencies:

```bash
npm install
```

Build and run:

```bash
npm run build
npm start
```

Or run in dev mode with auto-reload:

```bash
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
# → { "ok": true }
```

### Exposing locally (ngrok)

Use ngrok (or similar) to expose your local server so Notion can call it:

```bash
ngrok http 3000
```

Copy the HTTPS URL from ngrok (for example, `https://abcd1234.ngrok.io`) and use it as the base for your automation webhooks, e.g.:

- `https://abcd1234.ngrok.io/webhook`
- `https://abcd1234.ngrok.io/webhook/debug`

### Capturing sample payloads

Before finalizing the parser, point your Notion automation at:

- `POST https://<your-ngrok>.ngrok.io/webhook/debug`

The service will:

- Log headers and body.
- Persist JSON files into `samples/` (timestamped).

After you have a few examples, you can pick one and save it as `samples/done-sample.json` to use as a canonical example in this repo.

### Sample webhook payload (shape)

A typical payload (saved under `samples/done-sample.json`) might look like:

```json
{
  "trigger_task_id": "11111111-1111-1111-1111-111111111111",
  "objective_id": "22222222-2222-2222-2222-222222222222",
  "trigger_key": "status-changed-to-done",
  "new_status": "Done"
}
```

The parser also accepts camelCase field names (`taskId`, `objectiveId`, `triggerKey`, `newStatus`) if you prefer that style in the automation configuration.

### Configuring Notion Automation (“Send webhook”)

In your Tasks database, create an automation:

- **Trigger**: When a Task’s **Status** changes.
- **Condition**: (optional) Status is any value; the integration itself will filter for `"Done"`.
- **Action**: **Send webhook**.

Configure the webhook payload (JSON body) to include:

- **Task page ID** → map to `trigger_task_id` (or `taskId`).
- **Objective relation** → map the related Objective’s page ID to `objective_id` (or `objectiveId`).
- **Trigger key (TEXT)** → map to `trigger_key` (or `triggerKey`).
- **New status value** → map to `new_status` (or `newStatus`).

Set the webhook URL to:

- `https://<your-ngrok>.ngrok.io/webhook`

If you configured `WEBHOOK_SHARED_SECRET`, also set a custom header in the automation:

- Header name: `x-webhook-secret`
- Header value: your shared secret

### Expected outcome

With everything wired up:

1. You change a demo Task’s **Status** to **Done** in Notion.
2. Notion Automation fires the webhook to `/webhook`.
3. The service:
   - Parses the payload into `{ taskId, objectiveId, triggerKey, newStatus }`.
   - Verifies the shared secret (if configured).
   - Fetches all Tasks related to the Objective (pagination-safe).
   - Enqueues Notion API calls through a global throttle (max 3 req/s).
4. It creates **N Command pages** in the Commands DB:
   - Each Command’s **Target Task** relation points at one Task under the Objective.
   - Each Command’s **Trigger Key** rich_text matches the webhook’s `trigger_key`.
5. The HTTP response is:

```json
{
  "ok": true,
  "created": N,
  "failed": 0
}
```

If some Command creations fail, the processor:

- Logs the errors.
- Continues processing other tasks.
- Returns `{ "ok": true, "created": X, "failed": Y }`.


