import "dotenv/config";
import { buildApp } from "./app.js";
import { loadConfig } from "./config/env.js";

const config = loadConfig();
const app = buildApp(config);

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error({ err: error }, "Backend failed to start");
  await app.close();
  process.exitCode = 1;
}
