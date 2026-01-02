/**
 * Routing module (top-level).
 *
 * This module represents the "decision layer" entrypoint for webhook events.
 * For now it re-exports the current routing implementation from `src/dispatch/index.ts`.
 *
 * Follow-up refactor (optional): split "routing" (pure decisions) from "dispatch" (side effects).
 */
export { routeWebhookEvent } from "../dispatch";
export type { RouteWebhookArgs, RouteWebhookResult } from "../dispatch";


