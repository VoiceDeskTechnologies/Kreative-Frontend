import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../dist/app.js";
import { loadConfig } from "../dist/config/env.js";

const config = loadConfig({
  NODE_ENV: "test",
  CORS_ALLOWED_ORIGINS: "http://localhost:5173",
});

test("health and readiness report service status without claiming integrations are active", async () => {
  const app = buildApp(config);
  try {
    const health = await app.inject({ method: "GET", url: "/health" });
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().status, "ok");

    const readiness = await app.inject({ method: "GET", url: "/ready" });
    assert.equal(readiness.statusCode, 200);
    assert.deepEqual(readiness.json().integrations, {
      supabase: { configured: false, implemented: false },
      ai: { configured: false, implemented: true },
      paypal: { configured: false, implemented: false },
    });
  } finally {
    await app.close();
  }
});

test("CORS denies origins that are not explicitly allowlisted", async () => {
  const app = buildApp(config);
  try {
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://untrusted.example" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["access-control-allow-origin"], undefined);
  } finally {
    await app.close();
  }
});

test("production refuses localhost CORS origins", () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "production",
        CORS_ALLOWED_ORIGINS: "http://localhost:5173",
      }),
    /exact deployed frontend origin/,
  );
});

test("production requires at least one explicit CORS origin", () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "production",
        CORS_ALLOWED_ORIGINS: "",
      }),
    /must include the exact deployed frontend origin/,
  );
});
