import express from "express";
import { createDispatchEventsRouter } from "./http/createDispatchEventsRouter";
import { loadConfig } from "./lib/config";

const app = express();
app.use(express.json());
app.use(createDispatchEventsRouter());

const config = loadConfig();

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${config.port}`);
});
