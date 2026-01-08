export type LogLevel = "info" | "warn" | "error";

export interface RequestContext {
  app: string;
  requestId: string;
  startedAtMs: number;
  log(level: LogLevel, event: string, fields?: Record<string, unknown>): void;
}

export function createRequestContext(args: { app: string; requestId: string }): RequestContext {
  const startedAtMs = Date.now();

  return {
    app: args.app,
    requestId: args.requestId,
    startedAtMs,
    log(level: LogLevel, event: string, fields?: Record<string, unknown>) {
      const payload = {
        ts: new Date().toISOString(),
        level,
        app: args.app,
        request_id: args.requestId,
        event,
        ...(fields ?? {}),
      };
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(payload));
    },
  };
}


