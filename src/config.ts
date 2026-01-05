import dotenv from "dotenv";

dotenv.config();

export interface AppConfig {
  port: number;
  notionToken: string;
  notionVersion: string;
  commandsDbId: string | null;
  commandsTargetTaskPropId: string | null;
  commandsTriggerKeyPropId: string | null;
  commandsTargetPagePropId: string | null;
  commandsCommandNamePropId: string | null;
  commandsDirectiveCommandPropId: string | null;
  webhookSharedSecret: string | null;
  commandTriggerKey: string | null;
  dispatchConfigDbId: string | null;
  dispatchConfigEnabledPropId: string | null;
  dispatchConfigRulePropId: string | null;
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
    commandsTargetPagePropId: process.env.COMMANDS_TARGET_PAGE_PROP_ID ?? null,
    commandsCommandNamePropId: process.env.COMMANDS_COMMAND_NAME_PROP_ID ?? null,
    commandsDirectiveCommandPropId: process.env.COMMANDS_DIRECTIVE_COMMAND_PROP_ID ?? null,
    webhookSharedSecret: process.env.WEBHOOK_SHARED_SECRET ?? null,
    commandTriggerKey: process.env.COMMAND_TRIGGER_KEY ?? null,
    dispatchConfigDbId: process.env.DISPATCH_CONFIG_DB_ID ?? null,
    dispatchConfigEnabledPropId: process.env.DISPATCH_CONFIG_ENABLED_PROP_ID ?? null,
    dispatchConfigRulePropId: process.env.DISPATCH_CONFIG_RULE_PROP_ID ?? null,
  };
}


