export type LogLevel = "info" | "warn" | "error";

export interface Logger {
  log(level: LogLevel, event: string, fields?: Record<string, unknown>): void;
  withDomain(domain: string): Logger;
}

export interface RequestContext {
  app: string;
  requestId: string;
  startedAtMs: number;
  domain: string;
  log(level: LogLevel, event: string, fields?: Record<string, unknown>): void;
  withDomain(domain: string): RequestContext;
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
  if (Array.isArray(value)) {
    return `"${value.map((v) => String(v)).join(",").replace(/"/g, '\\"')}"`;
  }
  return `"${JSON.stringify(value).replace(/"/g, '\\"')}"`;
}

function formatFields(fields?: Record<string, unknown>): string {
  if (!fields) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    const formatted = formatValue(value);
    if (formatted === null) continue;
    parts.push(`${key}=${formatted}`);
  }
  return parts.length ? ` ${parts.join(" ")}` : "";
}

function formatSpineLine(args: {
  level: LogLevel;
  app: string;
  domain: string;
  action: string;
  requestId?: string;
  fields?: Record<string, unknown>;
}): string {
  const domain = args.domain || "request";
  const rid = args.requestId ? args.requestId.slice(0, 8) : undefined;
  const ridPart = rid ? ` rid=${rid}` : "";
  const fieldsPart = formatFields(args.fields);
  return `${args.level.toUpperCase()}: [${args.app}:${domain}] ${args.action}${ridPart}${fieldsPart}`;
}

export function createSpineLogger(args: { app: string; domain: string; requestId?: string }): Logger {
  const { app, domain, requestId } = args;
  return {
    log(level: LogLevel, event: string, fields?: Record<string, unknown>) {
      // eslint-disable-next-line no-console
      console.log(
        formatSpineLine({
          level,
          app,
          domain,
          action: event,
          requestId,
          fields,
        }),
      );
    },
    withDomain(nextDomain: string) {
      return createSpineLogger({
        app,
        domain: mergeDomain(domain, nextDomain),
        requestId,
      });
    },
  };
}

function buildRequestContext(args: {
  app: string;
  requestId: string;
  startedAtMs: number;
  domain: string;
}): RequestContext {
  const logger = createSpineLogger({
    app: args.app,
    domain: args.domain,
    requestId: args.requestId,
  });

  return {
    app: args.app,
    requestId: args.requestId,
    startedAtMs: args.startedAtMs,
    domain: args.domain,
    log(level: LogLevel, event: string, fields?: Record<string, unknown>) {
      logger.log(level, event, fields);
    },
    withDomain(nextDomain: string) {
      return buildRequestContext({
        app: args.app,
        requestId: args.requestId,
        startedAtMs: args.startedAtMs,
        domain: mergeDomain(args.domain, nextDomain),
      });
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
  });
}


