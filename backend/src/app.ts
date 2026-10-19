import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import Fastify from "fastify";
import type { AppConfig } from "./config/env.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerAiRoutes } from "./routes/ai.js";
import { registerAccountRoutes } from "./routes/account.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerProjectRoutes } from "./routes/projects.js";

export function buildApp(
  config: AppConfig,
  dependencies: { fetcher?: typeof fetch } = {},
) {
  const app = Fastify({
    bodyLimit: 32 * 1024 * 1024,
    logger: {
      level: config.NODE_ENV === "production" ? "info" : "debug",
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
    genReqId: () => randomUUID(),
  });

  app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (
        origin === undefined ||
        config.CORS_ALLOWED_ORIGINS.includes(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  });

  registerHealthRoutes(app, config);
  registerAiRoutes(app, config, dependencies.fetcher);
  registerAccountRoutes(app, config, dependencies.fetcher);
  registerBillingRoutes(app, config, dependencies.fetcher);
  registerProjectRoutes(app, config, dependencies.fetcher);
  return app;
}
