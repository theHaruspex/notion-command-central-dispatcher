import dotenv from "dotenv";

dotenv.config();

export interface AppConfig {
  port: number;
  notionToken: string;
  notionVersion: string;
  commandsDbId: string | null;
  commandsTargetTaskPropId: string | null;
  commandsTriggerKeyPropId: string | null;
  objectiveTasksRelationPropId: string | null;
  webhookSharedSecret: string | null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  const portRaw = process.env.PORT ?? "3000";
  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${portRaw}`);
  }

  const notionToken = requireEnv("NOTION_TOKEN");
  const notionVersion = process.env.NOTION_VERSION ?? "2022-06-28";

  return {
    port,
    notionToken,
    notionVersion,
    commandsDbId: process.env.COMMANDS_DB_ID ?? null,
    commandsTargetTaskPropId: process.env.COMMANDS_TARGET_TASK_PROP_ID ?? null,
    commandsTriggerKeyPropId: process.env.COMMANDS_TRIGGER_KEY_PROP_ID ?? null,
    objectiveTasksRelationPropId: process.env.OBJECTIVE_TASKS_RELATION_PROP_ID ?? null,
    webhookSharedSecret: process.env.WEBHOOK_SHARED_SECRET ?? null,
  };
}


