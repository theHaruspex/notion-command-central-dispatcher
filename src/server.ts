import express from "express";

/**
 * Pure HTTP transport layer.
 *
 * - No webhook auth/normalization logic
 * - No routing/business logic
 * - No app.listen()
 *
 * Routes are wired in `src/index.ts`.
 */
export function createApp() {
  const app = express();

  app.use(express.json());

  return app;
}

