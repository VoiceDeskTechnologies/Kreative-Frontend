import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env.js";
import { getAuthenticatedUser, isAdminUser } from "../modules/auth/authorization.js";
import { getTier, PRICING } from "../modules/billing/pricing.js";

function supabaseHeaders(config: AppConfig) {
  return {
    apikey: config.SUPABASE_SERVICE_ROLE_KEY!,
    authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY!}`,
    "content-type": "application/json",
  };
}

function storageConfigured(config: AppConfig) {
  return Boolean(config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY);
}

export function registerBillingRoutes(app: FastifyInstance, config: AppConfig, fetcher: typeof fetch = fetch) {
  app.get("/billing/pricing", async () => PRICING);

  app.get("/billing/account", async (request, reply) => {
    const user = await getAuthenticatedUser(request, config, fetcher);
    if (!user) return reply.code(401).send({ error: "Authentication is required.", code: "UNAUTHORIZED" });
    if (isAdminUser(user, config)) {
      return {
        plan: "K-PRO",
        sessionsRemaining: Number.MAX_SAFE_INTEGER,
        sessionsLimit: Number.MAX_SAFE_INTEGER,
        sessionsUsed: 0,
        unlimited: true,
        isAdmin: true,
      };
    }
    if (!storageConfigured(config)) {
      return reply.code(503).send({ error: "Billing storage is not configured.", code: "BILLING_NOT_CONFIGURED" });
    }
    try {
      const response = await fetcher(
        `${config.SUPABASE_URL}/rest/v1/entitlements?user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=expires_at.desc&limit=1`,
        { headers: supabaseHeaders(config) },
      );
      if (!response.ok) throw new Error(`Entitlements request failed (${response.status}).`);
      const entitlements = (await response.json()) as Array<{
        tier: "K-GO" | "K-PRO";
        mix_renders_used: number;
        starts_at: string;
        expires_at: string;
        cancel_at_period_end?: boolean;
      }>;
      const entitlement = entitlements[0];
      if (!entitlement) return { plan: null, sessionsRemaining: 0, sessionsLimit: 0 };
      const plan = entitlement.tier === "K-PRO" ? PRICING.K_PRO : PRICING.K_GO;
      return {
        plan: entitlement.tier,
        sessionsRemaining: Math.max(0, plan.renders - entitlement.mix_renders_used),
        sessionsLimit: plan.renders,
        sessionsUsed: entitlement.mix_renders_used,
        startsAt: entitlement.starts_at,
        expiresAt: entitlement.expires_at,
        cancelAtPeriodEnd: Boolean(entitlement.cancel_at_period_end),
      };
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "Unable to load billing status.", code: "BILLING_STATUS_FAILED" });
    }
  });

  app.post("/billing/consume", async (request, reply) => {
    const user = await getAuthenticatedUser(request, config, fetcher);
    if (!user) return reply.code(401).send({ error: "Authentication is required.", code: "UNAUTHORIZED" });
    if (isAdminUser(user, config)) {
      return {
        plan: "K-PRO",
        sessionsRemaining: Number.MAX_SAFE_INTEGER,
        sessionsLimit: Number.MAX_SAFE_INTEGER,
        unlimited: true,
        isAdmin: true,
      };
    }
    if (!storageConfigured(config)) {
      return reply.code(503).send({ error: "Billing storage is not configured.", code: "BILLING_NOT_CONFIGURED" });
    }
    try {
      const response = await fetcher(`${config.SUPABASE_URL}/rest/v1/rpc/consume_mix_render`, {
        method: "POST",
        headers: supabaseHeaders(config),
        body: JSON.stringify({ target_user_id: user.id }),
      });
      const errorBody = response.ok ? null : (await response.clone().json().catch(() => ({}))) as { message?: string };
      if (response.status === 409 || errorBody?.message === "SESSION_LIMIT_REACHED") {
        return reply.code(409).send({ error: "You have no mix and master sessions remaining this month.", code: "SESSION_LIMIT_REACHED" });
      }
      if (errorBody?.message === "NO_ACTIVE_PLAN") {
        return reply.code(409).send({ error: "You have no active plan with sessions remaining.", code: "NO_ACTIVE_PLAN" });
      }
      if (!response.ok) throw new Error(`Session consumption failed (${response.status}).`);
      const result = (await response.json()) as Array<{ tier: "K-GO" | "K-PRO"; sessions_remaining: number }>;
      const current = result[0];
      if (!current) return reply.code(409).send({ error: "You have no active plan with sessions remaining.", code: "NO_ACTIVE_PLAN" });
      return { plan: current.tier, sessionsRemaining: current.sessions_remaining };
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "Unable to reserve a mix and master session.", code: "SESSION_CONSUMPTION_FAILED" });
    }
  });

  app.post("/billing/cancel", async (request, reply) => {
    const user = await getAuthenticatedUser(request, config, fetcher);
    if (!user) return reply.code(401).send({ error: "Authentication is required.", code: "UNAUTHORIZED" });
    if (!storageConfigured(config)) {
      return reply.code(503).send({ error: "Billing storage is not configured.", code: "BILLING_NOT_CONFIGURED" });
    }
    try {
      const response = await fetcher(
        `${config.SUPABASE_URL}/rest/v1/entitlements?user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
        {
          method: "PATCH",
          headers: { ...supabaseHeaders(config), Prefer: "return=minimal" },
          body: JSON.stringify({ cancel_at_period_end: true, updated_at: new Date().toISOString() }),
        },
      );
      if (!response.ok) throw new Error(`Cancellation request failed (${response.status}).`);
      return { cancelAtPeriodEnd: true };
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "Unable to schedule plan cancellation.", code: "BILLING_CANCEL_FAILED" });
    }
  });

  app.post("/billing/paypal/orders", async (request, reply) => {
    const user = await getAuthenticatedUser(request, config, fetcher);
    if (!user) return reply.code(401).send({ error: "Authentication is required.", code: "UNAUTHORIZED" });
    const body = request.body as { tier?: string } | undefined;
    const tier = body?.tier ? getTier(body.tier) : undefined;
    if (!tier) return reply.code(400).send({ error: "Choose a valid pricing tier.", code: "INVALID_TIER" });
    if (!config.PAYPAL_ENABLED || !config.PAYPAL_CLIENT_ID || !config.PAYPAL_CLIENT_SECRET) {
      return reply.code(503).send({ error: "PayPal checkout is not configured on this server.", code: "PAYPAL_NOT_CONFIGURED" });
    }
    const tokenResponse = await fetcher(`${paypalBase(config)}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${config.PAYPAL_CLIENT_ID}:${config.PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!tokenResponse.ok) return reply.code(502).send({ error: "PayPal authorization failed.", code: "PAYPAL_AUTH_FAILED" });
    const token = (await tokenResponse.json() as { access_token: string }).access_token;
    const orderResponse = await fetcher(`${paypalBase(config)}/v2/checkout/orders`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ amount: { currency_code: PRICING.currency, value: tier.price }, custom_id: tier.id }],
      }),
    });
    if (!orderResponse.ok) return reply.code(502).send({ error: "PayPal could not create the order.", code: "PAYPAL_ORDER_FAILED" });
    const order = await orderResponse.json() as { id?: string };
    if (!order.id) return reply.code(502).send({ error: "PayPal returned an invalid order.", code: "PAYPAL_ORDER_INVALID" });
    return { orderId: order.id, tier: tier.id, amount: tier.price, currency: PRICING.currency };
  });
}

function paypalBase(config: AppConfig) {
  return config.PAYPAL_ENVIRONMENT === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}
