import { loadConfig } from "./config";
import { createApp } from "./server";
import { handleWebhook } from "./webhook";

const config = loadConfig();

const app = createApp({ handleWebhook });

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${config.port}`);
});


