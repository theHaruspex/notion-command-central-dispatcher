export type LogLevel = "info" | "warn" | "error";

export interface Logger {
  log(level: LogLevel, event: string, fields?: Record<string, unknown>): void;
  withDomain(domain: string): Logger;
  set(fields: Record<string, unknown>): void;
}

export interface RequestContext {
  app: string;
  requestId: string;
  startedAtMs: number;
  domain: string;
  base: Record<string, unknown>;
  log(level: LogLevel, event: string, fields?: Record<string, unknown>): void;
  withDomain(domain: string): RequestContext;
  set(fields: Record<string, unknown>): void;
}

function mergeDomain(base: string, next: string): string {
  if (!base) return next;
  if (!next) return base;
  return `${base}:${next}`;
}

function formatValue(value: unknown): string | null {
  if (value === undefined) return null;
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") {
    const needsQuotes = /\s/.test(value) || /["=]/.test(value);
    if (!needsQuotes) return value;
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  if (value instanceof Error) {
    const msg = value.message || String(value);
    return `"${msg.replace(/"/g, '\\"')}"`;
  }
  const json = JSON.stringify(value);
  return json ?? '"[unserializable]"';
}

function formatSpineLines(args: {
  level: LogLevel;
  app: string;
  domain: string;
  action: string;
  requestId?: string;
  base?: Record<string, unknown>;
  fields?: Record<string, unknown>;
}): string {
  const domain = args.domain || "request";
  const rid = args.requestId ? args.requestId.slice(0, 8) : undefined;
  const mergedFields = { ...(args.base ?? {}), ...(args.fields ?? {}) };
  const originPageRaw = mergedFields.origin_page;
  const originPage =
    typeof originPageRaw === "string" && originPageRaw.trim() ? originPageRaw : "<unknown>";
  const originPageValue = `"${originPage.replace(/"/g, '\\"')}"`;
  const headerParts = [
    `${args.level.toUpperCase()}: [${args.app}:${domain}] ${args.action}`,
    rid ? `rid=${rid}` : null,
    `origin_page=${originPageValue}`,
  ].filter(Boolean);
  const lines: string[] = [headerParts.join(" ")];

  for (const [key, value] of Object.entries(mergedFields)) {
    if (key === "origin_page") continue;
    const formatted = formatValue(value);
    if (formatted === null) continue;
    lines.push(`  ${key}=${formatted}`);
  }

  return lines.join("\n");
}

export function createSpineLogger(args: { app: string; domain: string; requestId?: string }): Logger {
  const { app, domain, requestId } = args;
  let base: Record<string, unknown> = {};
  return {
    log(level: LogLevel, event: string, fields?: Record<string, unknown>) {
      // eslint-disable-next-line no-console
      console.log(formatSpineLines({ level, app, domain, action: event, requestId, base, fields }));
    },
    withDomain(nextDomain: string) {
      return createSpineLogger({
        app,
        domain: mergeDomain(domain, nextDomain),
        requestId,
      });
    },
    set(fields: Record<string, unknown>) {
      base = { ...base, ...fields };
    },
  };
}

function buildRequestContext(args: {
  app: string;
  requestId: string;
  startedAtMs: number;
  domain: string;
  base: Record<string, unknown>;
}): RequestContext {
  const base = args.base;
  const logger = createSpineLogger({
    app: args.app,
    domain: args.domain,
    requestId: args.requestId,
  });
  logger.set(base);

  return {
    app: args.app,
    requestId: args.requestId,
    startedAtMs: args.startedAtMs,
    domain: args.domain,
    base,
    log(level: LogLevel, event: string, fields?: Record<string, unknown>) {
      logger.log(level, event, fields);
    },
    withDomain(nextDomain: string) {
      return buildRequestContext({
        app: args.app,
        requestId: args.requestId,
        startedAtMs: args.startedAtMs,
        domain: mergeDomain(args.domain, nextDomain),
        base,
      });
    },
    set(fields: Record<string, unknown>) {
      Object.assign(base, fields);
      logger.set(fields);
    },
  };
}

export function createRequestContext(args: { app: string; requestId: string }): RequestContext {
  const startedAtMs = Date.now();
  return buildRequestContext({
    app: args.app,
    requestId: args.requestId,
    startedAtMs,
    domain: "",
    base: {},
  });
}


