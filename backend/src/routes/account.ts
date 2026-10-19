import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "../config/env.js";
import { getAuthenticatedUser, requireAdmin } from "../modules/auth/authorization.js";

type AdminRequest = FastifyRequest & { params: Record<string, string>; query: Record<string, string | undefined> };

function adminHeaders(config: AppConfig) {
  return {
    apikey: config.SUPABASE_SERVICE_ROLE_KEY!,
    authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY!}`,
    "content-type": "application/json",
  };
}

function configured(config: AppConfig, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) {
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
    reply.code(503).send({ error: "Admin data storage is not configured.", code: "SUPABASE_NOT_CONFIGURED" });
    return false;
  }
  return true;
}

async function supabaseTable(
  config: AppConfig,
  fetcher: typeof fetch,
  table: string,
  query = "",
  init: RequestInit = {},
) {
  const response = await fetcher(`${config.SUPABASE_URL}/rest/v1/${table}${query}`, {
    ...init,
    headers: { ...adminHeaders(config), ...init.headers },
  });
  if (!response.ok) throw new Error(`Supabase ${table} request failed (${response.status}).`);
  return response;
}

async function requireConfiguredAdmin(
  request: FastifyRequest,
  reply: Parameters<typeof requireAdmin>[1],
  config: AppConfig,
  fetcher: typeof fetch,
) {
  const admin = await requireAdmin(request, reply, config, fetcher);
  if (!admin || !configured(config, reply)) return null;
  return admin;
}

async function requireUser(
  request: FastifyRequest,
  reply: Parameters<typeof requireAdmin>[1],
  config: AppConfig,
  fetcher: typeof fetch,
) {
  const user = await getAuthenticatedUser(request, config, fetcher);
  if (!user) {
    await reply.code(401).send({ error: "Sign in is required.", code: "UNAUTHORIZED" });
    return null;
  }
  if (!configured(config, reply)) return null;
  return user;
}

async function sendSupportEmail(
  config: AppConfig,
  fetcher: typeof fetch,
  to: string,
  subject: string,
  text: string,
) {
  if (!config.RESEND_API_KEY || !config.SUPPORT_EMAIL_FROM) {
    throw new Error("Support email delivery is not configured.");
  }
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${config.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: config.SUPPORT_EMAIL_FROM, to: [to], subject, text }),
  });
  if (!response.ok) throw new Error(`Support email delivery failed (${response.status}).`);
}

export function registerAccountRoutes(app: FastifyInstance, config: AppConfig, fetcher: typeof fetch = fetch) {
  app.get("/account/admin-status", async (request) => {
    const user = await getAuthenticatedUser(request, config, fetcher);
    const email = user?.email?.trim().toLowerCase();
    return { isAdmin: Boolean(user?.email_confirmed_at && email && config.ADMIN_EMAILS.has(email)) };
  });

  app.get("/admin/overview", async (request, reply) => {
    if (!(await requireConfiguredAdmin(request, reply, config, fetcher))) return;
    try {
      const response = await supabaseTable(config, fetcher, "admin_overview");
      const rows = (await response.json()) as Array<Record<string, unknown>>;
      return rows[0] ?? {};
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "Unable to load admin data.", code: "ADMIN_DATA_FAILED" });
    }
  });

  app.get("/admin/users", async (request, reply) => {
    if (!(await requireConfiguredAdmin(request, reply, config, fetcher))) return;
    const query = (request as AdminRequest).query;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    try {
      const response = await fetcher(
        `${config.SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${limit}`,
        { headers: adminHeaders(config) },
      );
      if (!response.ok) throw new Error(`Supabase users request failed (${response.status}).`);
      const body = (await response.json()) as { users?: Array<Record<string, unknown>> };
      const search = query.search?.trim().toLowerCase();
      const users = (body.users ?? []).filter((user) => {
        if (!search) return true;
        return String(user.email ?? "").toLowerCase().includes(search) ||
          String(user.id ?? "").toLowerCase().includes(search) ||
          String((user.user_metadata as { display_name?: string } | undefined)?.display_name ?? "")
            .toLowerCase().includes(search);
      });
      return { users, page, limit, hasMore: (body.users ?? []).length === limit };
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "Unable to load users.", code: "ADMIN_USERS_FAILED" });
    }
  });

  app.get("/admin/users/:id", async (request, reply) => {
    const admin = await requireConfiguredAdmin(request, reply, config, fetcher);
    if (!admin) return;
    const userId = (request as AdminRequest).params.id;
    if (!userId) return reply.code(400).send({ error: "A user id is required.", code: "INVALID_REQUEST" });
    try {
      const [userResponse, entitlements, payments] = await Promise.all([
        fetcher(`${config.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { headers: adminHeaders(config) }),
        supabaseTable(config, fetcher, "entitlements", `?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`),
        supabaseTable(config, fetcher, "payments", `?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`),
      ]);
      if (!userResponse.ok) return reply.code(404).send({ error: "User not found.", code: "USER_NOT_FOUND" });
      return {
        user: await userResponse.json(),
        entitlements: await entitlements.json(),
        payments: await payments.json(),
      };
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "Unable to load user details.", code: "ADMIN_USER_FAILED" });
    }
  });

  app.post("/admin/users/:id/ban", async (request, reply) => {
    const admin = await requireConfiguredAdmin(request, reply, config, fetcher);
    if (!admin) return;
    const userId = (request as AdminRequest).params.id;
    if (!userId) return reply.code(400).send({ error: "A user id is required.", code: "INVALID_REQUEST" });
    const body = (request.body ?? {}) as { banned?: boolean; reason?: string };
    if (typeof body.banned !== "boolean") return reply.code(400).send({ error: "banned must be a boolean.", code: "INVALID_REQUEST" });
    try {
      const response = await fetcher(`${config.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: "PUT",
        headers: adminHeaders(config),
        body: JSON.stringify({ ban_duration: body.banned ? "876000h" : "none" }),
      });
      if (!response.ok) return reply.code(502).send({ error: "Unable to update user ban status.", code: "ADMIN_USER_UPDATE_FAILED" });
      await supabaseTable(config, fetcher, "admin_audit_log", "", {
        method: "POST",
        headers: { ...adminHeaders(config), Prefer: "return=minimal" },
        body: JSON.stringify({ admin_user_id: admin.id, affected_user_id: userId, action: body.banned ? "ban_user" : "unban_user", reason: body.reason ?? null }),
      });
      return { ok: true, banned: body.banned };
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "Unable to update user ban status.", code: "ADMIN_USER_UPDATE_FAILED" });
    }
  });

  app.post("/admin/users/:id/entitlement", async (request, reply) => {
    const admin = await requireConfiguredAdmin(request, reply, config, fetcher);
    if (!admin) return;
    const userId = (request as AdminRequest).params.id;
    if (!userId) return reply.code(400).send({ error: "A user id is required.", code: "INVALID_REQUEST" });
    const body = (request.body ?? {}) as { tier?: string; days?: number; status?: string };
    if (!["K-GO", "K-PRO"].includes(body.tier ?? "") || !Number.isInteger(body.days) || (body.days ?? 0) < 1 || (body.days ?? 0) > 3650) {
      return reply.code(400).send({ error: "tier must be K-GO or K-PRO and days must be between 1 and 3650.", code: "INVALID_REQUEST" });
    }
    try {
      const now = new Date();
      await supabaseTable(config, fetcher, "entitlements", `?user_id=eq.${encodeURIComponent(userId)}&status=eq.active`, {
        method: "PATCH",
        headers: { ...adminHeaders(config), Prefer: "return=minimal" },
        body: JSON.stringify({ status: "revoked", updated_at: now.toISOString() }),
      });

      app.get("/support/unread-count", async (request, reply) => {
        const user = await requireUser(request, reply, config, fetcher);
        if (!user) return;
        try {
          const response = await supabaseTable(config, fetcher, "support_messages",
            `?select=id,support_tickets!inner(user_id)&support_tickets.user_id=eq.${encodeURIComponent(user.id)}&sender_role=eq.admin&read_at=is.null`);
          const messages = (await response.json()) as unknown[];
          return { count: messages.length };
        } catch (error) {
          request.log.error(error);
          return reply.code(502).send({ error: "Unable to load support notifications.", code: "SUPPORT_FAILED" });
        }
      });

      app.get("/support/tickets", async (request, reply) => {
        const user = await requireUser(request, reply, config, fetcher);
        if (!user) return;
        try {
          const response = await supabaseTable(config, fetcher, "support_tickets",
            `?user_id=eq.${encodeURIComponent(user.id)}&select=*&order=updated_at.desc`);
          return { tickets: await response.json() };
        } catch (error) {
          request.log.error(error);
          return reply.code(502).send({ error: "Unable to load support tickets.", code: "SUPPORT_FAILED" });
        }
      });

      app.post("/support/tickets", async (request, reply) => {
        const user = await requireUser(request, reply, config, fetcher);
        if (!user) return;
        const body = (request.body ?? {}) as { subject?: string; description?: string; category?: string; priority?: string };
        if (!body.subject?.trim() || !body.description?.trim() || body.subject.length > 160 || body.description.length > 8000 ||
          !["general", "billing", "technical", "account", "feedback"].includes(body.category ?? "") ||
          !["low", "normal", "high", "urgent"].includes(body.priority ?? "")) {
          return reply.code(400).send({ error: "Subject, message, category, and priority are required.", code: "INVALID_REQUEST" });
        }
        try {
          const ticketResponse = await supabaseTable(config, fetcher, "support_tickets", "", {
            method: "POST",
            headers: { ...adminHeaders(config), Prefer: "return=representation" },
            body: JSON.stringify({ user_id: user.id, subject: body.subject.trim(), description: body.description.trim(), category: body.category, priority: body.priority }),
          });
          const ticket = ((await ticketResponse.json()) as Array<{ id: string }>)[0];
          if (!ticket) return reply.code(502).send({ error: "The ticket could not be created.", code: "SUPPORT_FAILED" });
          await supabaseTable(config, fetcher, "support_messages", "", {
            method: "POST",
            headers: { ...adminHeaders(config), Prefer: "return=minimal" },
            body: JSON.stringify({ ticket_id: ticket.id, sender_id: user.id, sender_role: "user", body: body.description.trim() }),
          });
          return reply.code(201).send({ ticket });
        } catch (error) {
          request.log.error(error);
          return reply.code(502).send({ error: "Unable to create support ticket.", code: "SUPPORT_FAILED" });
        }
      });

      app.get("/support/tickets/:id", async (request, reply) => {
        const user = await requireUser(request, reply, config, fetcher);
        if (!user) return;
        const ticketId = (request as AdminRequest).params.id;
        if (!ticketId) return reply.code(400).send({ error: "A ticket id is required.", code: "INVALID_REQUEST" });
        try {
          const ticketResponse = await supabaseTable(config, fetcher, "support_tickets",
            `?id=eq.${encodeURIComponent(ticketId)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
          const tickets = (await ticketResponse.json()) as unknown[];
          if (!tickets.length) return reply.code(404).send({ error: "Ticket not found.", code: "TICKET_NOT_FOUND" });
          const messagesResponse = await supabaseTable(config, fetcher, "support_messages",
            `?ticket_id=eq.${encodeURIComponent(ticketId)}&order=created_at.asc`);
          await supabaseTable(config, fetcher, "support_messages",
            `?ticket_id=eq.${encodeURIComponent(ticketId)}&sender_role=eq.admin&read_at=is.null`, {
              method: "PATCH",
              headers: { ...adminHeaders(config), Prefer: "return=minimal" },
              body: JSON.stringify({ read_at: new Date().toISOString() }),
            });

            app.post("/support/tickets/:id/reply", async (request, reply) => {
              const user = await requireUser(request, reply, config, fetcher);
              if (!user) return;
              const ticketId = (request as AdminRequest).params.id;
              const body = (request.body ?? {}) as { message?: string };
              if (!ticketId || !body.message?.trim() || body.message.length > 8000) {
                return reply.code(400).send({ error: "A reply message is required.", code: "INVALID_REQUEST" });
              }
              try {
                const ticketResponse = await supabaseTable(config, fetcher, "support_tickets",
                  `?id=eq.${encodeURIComponent(ticketId)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
                if (!((await ticketResponse.json()) as unknown[]).length) {
                  return reply.code(404).send({ error: "Ticket not found.", code: "TICKET_NOT_FOUND" });
                }
                const response = await supabaseTable(config, fetcher, "support_messages", "", {
                  method: "POST",
                  headers: { ...adminHeaders(config), Prefer: "return=representation" },
                  body: JSON.stringify({ ticket_id: ticketId, sender_id: user.id, sender_role: "user", body: body.message.trim() }),
                });
                await supabaseTable(config, fetcher, "support_tickets", `?id=eq.${encodeURIComponent(ticketId)}`, {
                  method: "PATCH",
                  headers: { ...adminHeaders(config), Prefer: "return=minimal" },
                  body: JSON.stringify({ status: "open", updated_at: new Date().toISOString() }),
                });
                return { message: ((await response.json()) as unknown[])[0] };
              } catch (error) {
                request.log.error(error);
                return reply.code(502).send({ error: "Unable to send support reply.", code: "SUPPORT_REPLY_FAILED" });
              }
            });
          return { ticket: tickets[0], messages: await messagesResponse.json() };
        } catch (error) {
          request.log.error(error);
          return reply.code(502).send({ error: "Unable to load ticket.", code: "SUPPORT_FAILED" });
        }
      });
      const response = await supabaseTable(config, fetcher, "entitlements", "", {
        method: "POST",
        headers: { ...adminHeaders(config), Prefer: "return=representation" },
        body: JSON.stringify({ user_id: userId, tier: body.tier, status: body.status === "revoked" ? "revoked" : "active", starts_at: now.toISOString(), expires_at: new Date(now.getTime() + body.days! * 86400000).toISOString() }),
      });
      await supabaseTable(config, fetcher, "admin_audit_log", "", {
        method: "POST",
        headers: { ...adminHeaders(config), Prefer: "return=minimal" },
        body: JSON.stringify({ admin_user_id: admin.id, affected_user_id: userId, action: "change_entitlement", reason: `${body.tier} for ${body.days} days` }),
      });
      return { entitlement: await response.json() };
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "Unable to change entitlement.", code: "ADMIN_ENTITLEMENT_FAILED" });
    }
  });

  app.get("/admin/payments", async (request, reply) => {
    if (!(await requireConfiguredAdmin(request, reply, config, fetcher))) return;
    const query = (request as AdminRequest).query;
    const status = query.status && ["created", "completed", "cancelled", "failed", "pending"].includes(query.status) ? `&status=eq.${query.status}` : "";
    try {
      const response = await supabaseTable(config, fetcher, "payments", `?select=*&order=created_at.desc&limit=100${status}`);
      return { payments: await response.json() };
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "Unable to load payments.", code: "ADMIN_PAYMENTS_FAILED" });
    }
  });

  for (const [path, table] of [["/admin/projects", "projects"], ["/admin/settings", "admin_settings"], ["/admin/pricing", "pricing_plans"]] as const) {
    app.get(path, async (request, reply) => {
      if (!(await requireConfiguredAdmin(request, reply, config, fetcher))) return;
      try {
        const response = await supabaseTable(config, fetcher, table, "?select=*&order=updated_at.desc");
        return { items: await response.json() };
      } catch (error) {
        request.log.error(error);
        return reply.code(502).send({ error: `Unable to load ${table}.`, code: "ADMIN_DATA_FAILED" });
      }

      app.get("/admin/support", async (request, reply) => {
        if (!(await requireConfiguredAdmin(request, reply, config, fetcher))) return;
        const query = (request as AdminRequest).query;
        const status = query.status && ["open", "pending", "resolved", "closed"].includes(query.status) ? `&status=eq.${query.status}` : "";
        const priority = query.priority && ["low", "normal", "high", "urgent"].includes(query.priority) ? `&priority=eq.${query.priority}` : "";
        try {
          const response = await supabaseTable(config, fetcher, "support_tickets",
            `?select=*&order=updated_at.desc&limit=100${status}${priority}`);
          return { tickets: await response.json() };
        } catch (error) {
          request.log.error(error);
          return reply.code(502).send({ error: "Unable to load support queue.", code: "SUPPORT_FAILED" });
        }
      });

      app.get("/admin/support/:id", async (request, reply) => {
        if (!(await requireConfiguredAdmin(request, reply, config, fetcher))) return;
        const ticketId = (request as AdminRequest).params.id;
        if (!ticketId) return reply.code(400).send({ error: "A ticket id is required.", code: "INVALID_REQUEST" });
        try {
          const [ticketResponse, messagesResponse] = await Promise.all([
            supabaseTable(config, fetcher, "support_tickets", `?id=eq.${encodeURIComponent(ticketId)}&limit=1`),
            supabaseTable(config, fetcher, "support_messages", `?ticket_id=eq.${encodeURIComponent(ticketId)}&order=created_at.asc`),
          ]);
          const tickets = (await ticketResponse.json()) as unknown[];
          if (!tickets.length) return reply.code(404).send({ error: "Ticket not found.", code: "TICKET_NOT_FOUND" });
          return { ticket: tickets[0], messages: await messagesResponse.json() };
        } catch (error) {
          request.log.error(error);
          return reply.code(502).send({ error: "Unable to load support conversation.", code: "SUPPORT_FAILED" });
        }
      });

      app.post("/admin/support/:id/reply", async (request, reply) => {
        const admin = await requireConfiguredAdmin(request, reply, config, fetcher);
        if (!admin) return;
        const ticketId = (request as AdminRequest).params.id;
        if (!ticketId) return reply.code(400).send({ error: "A ticket id is required.", code: "INVALID_REQUEST" });
        const body = (request.body ?? {}) as { message?: string; status?: string };
        if (!body.message?.trim() || body.message.length > 8000) return reply.code(400).send({ error: "A reply message is required.", code: "INVALID_REQUEST" });
        try {
          const ticketResponse = await supabaseTable(config, fetcher, "support_tickets", `?id=eq.${encodeURIComponent(ticketId)}&limit=1`);
          const tickets = (await ticketResponse.json()) as Array<{ subject: string; user_id: string }>;
          if (!tickets.length) return reply.code(404).send({ error: "Ticket not found.", code: "TICKET_NOT_FOUND" });
          const userResponse = await fetcher(`${config.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(tickets[0]!.user_id)}`, { headers: adminHeaders(config) });
          const user = (await userResponse.json()) as { email?: string };
          if (!user.email) return reply.code(422).send({ error: "The ticket user has no email address.", code: "EMAIL_UNAVAILABLE" });
          await sendSupportEmail(config, fetcher, user.email, `Re: ${tickets[0]!.subject}`, body.message.trim());
          const messageResponse = await supabaseTable(config, fetcher, "support_messages", "", {
            method: "POST",
            headers: { ...adminHeaders(config), Prefer: "return=representation" },
            body: JSON.stringify({ ticket_id: ticketId, sender_id: admin.id, sender_role: "admin", body: body.message.trim(), email_delivered: true }),
          });
          await supabaseTable(config, fetcher, "support_tickets", `?id=eq.${encodeURIComponent(ticketId)}`, {
            method: "PATCH",
            headers: { ...adminHeaders(config), Prefer: "return=minimal" },
            body: JSON.stringify({ status: body.status ?? "pending", updated_at: new Date().toISOString() }),
          });
          return { message: ((await messageResponse.json()) as unknown[])[0], emailDelivered: true };
        } catch (error) {
          request.log.error(error);
          return reply.code(502).send({ error: error instanceof Error ? error.message : "Unable to send support reply.", code: "SUPPORT_REPLY_FAILED" });
        }
      });
    });
  }

  app.patch("/admin/settings/:key", async (request, reply) => updateAdminRecord(request, reply, config, fetcher, "admin_settings", "key"));
  app.patch("/admin/pricing/:id", async (request, reply) => updateAdminRecord(request, reply, config, fetcher, "pricing_plans", "id"));
  app.patch("/admin/support/:id", async (request, reply) => updateAdminRecord(request, reply, config, fetcher, "support_tickets", "id"));
}

async function updateAdminRecord(
  request: FastifyRequest,
  reply: Parameters<typeof requireAdmin>[1],
  config: AppConfig,
  fetcher: typeof fetch,
  table: string,
  key: string,
) {
  const admin = await requireConfiguredAdmin(request, reply, config, fetcher);
  if (!admin) return;
  const typed = request as AdminRequest;
  const value = typed.params.id ?? typed.params.key;
  if (!value) return reply.code(400).send({ error: "A record id is required.", code: "INVALID_REQUEST" });
  if (!request.body || typeof request.body !== "object") return reply.code(400).send({ error: "A valid update body is required.", code: "INVALID_REQUEST" });
  try {
    const response = await supabaseTable(config, fetcher, table, `?${key}=eq.${encodeURIComponent(value)}`, {
      method: "PATCH",
      headers: { ...adminHeaders(config), Prefer: "return=representation" },
      body: JSON.stringify(request.body),
    });
    return { items: await response.json(), updatedBy: admin.id };
  } catch (error) {
    request.log.error(error);
    return reply.code(502).send({ error: `Unable to update ${table}.`, code: "ADMIN_UPDATE_FAILED" });
  }
}
