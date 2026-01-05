import express from "express";

/**
 * server/ — pure HTTP transport layer
 *
 * - Express app creation + JSON middleware only
 * - No routes
 * - No listening
 * - No config usage
 * - No webhook/routing/dispatch concerns
 */
export function createApp() {
  const app = express();
  app.use(express.json());
  return app;
}


