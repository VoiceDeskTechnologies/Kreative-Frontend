import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env.js";

export function registerHealthRoutes(
  app: FastifyInstance,
  config: AppConfig,
): void {
  app.get("/health", async () => ({
    status: "ok",
    service: "kreative-api",
    version: config.APP_VERSION,
  }));

  app.get("/ready", async () => ({
    status: "ready",
    service: "kreative-api",
    integrations: {
      supabase: {
        configured: Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY),
        implemented: false,
      },
      ai: {
        configured: config.AI_PROVIDER !== "none",
        implemented: true,
      },
      paypal: {
        configured: config.PAYPAL_ENABLED,
        implemented: false,
      },
    },
  }));

  app.get("/version", async () => ({
    name: "kreative-api",
    version: config.APP_VERSION,
    environment: config.NODE_ENV,
  }));

  app.get("/docs", async () => ({
    openapi: "3.1.0",
    info: {
      title: "KREATIVE API",
      version: config.APP_VERSION,
      description:
        "Health routes and consent-gated provider audio analysis plus validated browser-DSP mix planning are implemented. Audio processing stays in the browser.",
    },
    paths: {
      "/health": { get: { summary: "Liveness check" } },
      "/ready": {
        get: { summary: "Readiness and optional integration configuration" },
      },
      "/version": { get: { summary: "API version" } },
      "/ai/status": {
        get: { summary: "AI provider availability and data-handling flags" },
      },
      "/ai/chat": {
        post: {
          summary:
            "Request a validated mix plan from the configured AI provider",
        },
      },
      "/ai/analyze": {
        post: {
          summary: "Analyze consented audio once for cached mix-planning context",
        },
      },
    },
  }));
}
