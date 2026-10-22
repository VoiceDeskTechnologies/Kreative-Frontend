import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../dist/app.js";
import { loadConfig } from "../dist/config/env.js";

test("pricing is server-owned and exposes the two one-time tiers", async () => {
  const app = buildApp(loadConfig({ NODE_ENV: "test" }));
  try {
    const response = await app.inject({ method: "GET", url: "/billing/pricing" });
    assert.equal(response.statusCode, 200);
    const pricing = response.json();
    assert.equal(pricing.K_GO.id, "K-GO");
    assert.equal(pricing.K_GO.price, "39.95");
    assert.equal(pricing.K_GO.renders, 3);
    assert.ok(Array.isArray(pricing.K_GO.features));
    assert.equal(pricing.K_PRO.id, "K-PRO");
    assert.equal(pricing.K_PRO.price, "59.95");
    assert.equal(pricing.K_PRO.renders, 6);
    assert.ok(Array.isArray(pricing.K_PRO.features));
  } finally {
    await app.close();
  }
});

test("admin status fails closed without a verified Supabase identity", async () => {
  const app = buildApp(loadConfig({ NODE_ENV: "test", ADMIN_EMAILS: "Admin@example.com" }));
  try {
    const response = await app.inject({ method: "GET", url: "/account/admin-status" });
    assert.deepEqual(response.json(), { isAdmin: false });
  } finally {
    await app.close();
  }
});

test("PayPal order creation requires authentication and configured checkout", async () => {
  const app = buildApp(loadConfig({ NODE_ENV: "test" }));
  try {
    const response = await app.inject({
      method: "POST",
      url: "/billing/paypal/orders",
      payload: { tier: "K_PRO" },
    });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().code, "UNAUTHORIZED");
  } finally {
    await app.close();
  }
});
