import dotenv from "dotenv";

dotenv.config();

export interface DispatchConfig {
  notionTokens: string[];
  maxFanoutTasks: number;
  commandsDbId: string | null;
  commandsTargetTaskPropId: string | null;
  commandsTriggerKeyPropId: string | null;
  commandsTargetPagePropId: string | null;
  commandsCommandNamePropId: string | null;
  commandsDirectiveCommandPropId: string | null;
  commandTriggerKey: string | null;
  dispatchConfigDbId: string | null;
  dispatchConfigEnabledPropId: string | null;
  dispatchConfigRulePropId: string | null;
}

export interface EventsConfig {
  notionTokens: string[];
  eventsDbId: string | null;
  eventsConfigDbId: string | null;
}

export interface AppConfig {
  port: number;
  notionVersion: string;
  webhookSharedSecret: string | null;
  dispatch: DispatchConfig;
  events: EventsConfig;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function parseCommaSeparatedList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function loadConfig(): AppConfig {
  const portRaw = process.env.PORT ?? "3000";
  const port = Number(portRaw);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${portRaw}`);
  }

  const baseTokens = parseCommaSeparatedList(process.env.NOTION_TOKENS);
  const fallbackTokens = baseTokens.length > 0 ? baseTokens : [requireEnv("NOTION_TOKEN")];

  const dispatchTokensEnv = parseCommaSeparatedList(process.env.DISPATCH_NOTION_TOKENS);
  const eventsTokensEnv = parseCommaSeparatedList(process.env.EVENTS_NOTION_TOKENS);

  const dispatchTokens = dispatchTokensEnv.length > 0 ? dispatchTokensEnv : fallbackTokens;
  const eventsTokens = eventsTokensEnv.length > 0 ? eventsTokensEnv : fallbackTokens;

  const notionVersion = process.env.NOTION_VERSION ?? "2022-06-28";

  const maxFanoutTasksRaw = process.env.MAX_FANOUT_TASKS ?? "200";
  const maxFanoutTasks = Number(maxFanoutTasksRaw);
  if (!Number.isFinite(maxFanoutTasks) || maxFanoutTasks <= 0) {
    throw new Error(`Invalid MAX_FANOUT_TASKS value: ${maxFanoutTasksRaw}`);
  }

  return {
    port,
    notionVersion,
    webhookSharedSecret: process.env.WEBHOOK_SHARED_SECRET ?? null,
    dispatch: {
      notionTokens: dispatchTokens,
      maxFanoutTasks,
      commandsDbId: process.env.COMMANDS_DB_ID ?? null,
      commandsTargetTaskPropId: process.env.COMMANDS_TARGET_TASK_PROP_ID ?? null,
      commandsTriggerKeyPropId: process.env.COMMANDS_TRIGGER_KEY_PROP_ID ?? null,
      commandsTargetPagePropId: process.env.COMMANDS_TARGET_PAGE_PROP_ID ?? null,
      commandsCommandNamePropId: process.env.COMMANDS_COMMAND_NAME_PROP_ID ?? null,
      commandsDirectiveCommandPropId: process.env.COMMANDS_DIRECTIVE_COMMAND_PROP_ID ?? null,
      commandTriggerKey: process.env.COMMAND_TRIGGER_KEY ?? null,
      dispatchConfigDbId: process.env.DISPATCH_CONFIG_DB_ID ?? null,
      dispatchConfigEnabledPropId: process.env.DISPATCH_CONFIG_ENABLED_PROP_ID ?? null,
      dispatchConfigRulePropId: process.env.DISPATCH_CONFIG_RULE_PROP_ID ?? null,
    },
    events: {
      notionTokens: eventsTokens,
      eventsDbId: process.env.EVENTS_DB_ID ?? null,
      eventsConfigDbId: process.env.EVENTS_CONFIG_DB_ID ?? null,
    },
  };
}


