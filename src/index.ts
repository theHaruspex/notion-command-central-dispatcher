import express from "express";
import { createDispatchEventsRouter } from "./http/createDispatchEventsRouter";
import { loadConfig } from "./lib/config";
import { createSpineLogger } from "./lib/logging";

const app = express();
app.use(express.json());
app.use(createDispatchEventsRouter());

const config = loadConfig();

app.listen(config.port, () => {
  const log = createSpineLogger({ app: "system", domain: "boot" });
  log.log("info", "server_listening", { url: `http://localhost:${config.port}` });
});
