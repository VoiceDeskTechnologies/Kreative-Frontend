import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "../config/env.js";
import { getAuthenticatedUser } from "../modules/auth/authorization.js";

type ProjectRequest = FastifyRequest & { params: Record<string, string> };

function headers(config: AppConfig) {
  return {
    apikey: config.SUPABASE_SERVICE_ROLE_KEY!,
    authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY!}`,
    "content-type": "application/json",
  };
}

function configured(config: AppConfig) {
  return Boolean(config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY);
}

async function table(config: AppConfig, fetcher: typeof fetch, path: string, init: RequestInit = {}) {
  const response = await fetcher(`${config.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(config), ...init.headers },
  });
  if (!response.ok) throw new Error(`Project storage request failed (${response.status}).`);
  return response;
}

export function registerProjectRoutes(app: FastifyInstance, config: AppConfig, fetcher: typeof fetch = fetch) {
  app.post("/projects", async (request, reply) => {
    const user = await getAuthenticatedUser(request, config, fetcher);
    if (!user) return reply.code(401).send({ error: "Authentication is required.", code: "UNAUTHORIZED" });
    if (!configured(config)) return reply.code(503).send({ error: "Project storage is not configured.", code: "PROJECTS_NOT_CONFIGURED" });
    const body = (request.body ?? {}) as { name?: string; sessionData?: unknown };
    if (!body.name?.trim() || !body.sessionData) return reply.code(400).send({ error: "A project name and session data are required.", code: "INVALID_PROJECT" });
    try {
      const response = await table(config, fetcher, "projects", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          owner_id: user.id,
          name: body.name.trim(),
          session_data: body.sessionData,
          share_token: randomUUID(),
          is_shared: false,
        }),
      });
      const rows = (await response.json()) as Array<Record<string, unknown>>;
      return reply.code(201).send({ project: rows[0] });
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "Unable to save project.", code: "PROJECT_SAVE_FAILED" });
    }
  });

  app.put("/projects/:id", async (request, reply) => {
    const user = await getAuthenticatedUser(request, config, fetcher);
    if (!user) return reply.code(401).send({ error: "Authentication is required.", code: "UNAUTHORIZED" });
    if (!configured(config)) return reply.code(503).send({ error: "Project storage is not configured.", code: "PROJECTS_NOT_CONFIGURED" });
    const projectId = (request as ProjectRequest).params.id;
    if (!projectId) return reply.code(400).send({ error: "A project id is required.", code: "INVALID_PROJECT" });
    const body = (request.body ?? {}) as { name?: string; sessionData?: unknown };
    try {
      const response = await table(
        config,
        fetcher,
        `projects?id=eq.${encodeURIComponent(projectId)}&owner_id=eq.${encodeURIComponent(user.id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ name: body.name?.trim(), session_data: body.sessionData, updated_at: new Date().toISOString() }),
        },
      );
      const rows = (await response.json()) as Array<Record<string, unknown>>;
      if (!rows[0]) return reply.code(404).send({ error: "Project not found.", code: "PROJECT_NOT_FOUND" });
      return { project: rows[0] };
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "Unable to update project.", code: "PROJECT_UPDATE_FAILED" });
    }
  });

  app.post("/projects/:id/share", async (request, reply) => {
    const user = await getAuthenticatedUser(request, config, fetcher);
    if (!user) return reply.code(401).send({ error: "Authentication is required.", code: "UNAUTHORIZED" });
    if (!configured(config)) return reply.code(503).send({ error: "Project storage is not configured.", code: "PROJECTS_NOT_CONFIGURED" });
    const projectId = (request as ProjectRequest).params.id;
    if (!projectId) return reply.code(400).send({ error: "A project id is required.", code: "INVALID_PROJECT" });
    try {
      const response = await table(
        config,
        fetcher,
        `projects?id=eq.${encodeURIComponent(projectId)}&owner_id=eq.${encodeURIComponent(user.id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ is_shared: true, updated_at: new Date().toISOString() }),
        },
      );
      const rows = (await response.json()) as Array<{ share_token?: string }>;
      if (!rows[0]?.share_token) return reply.code(404).send({ error: "Project not found.", code: "PROJECT_NOT_FOUND" });
      return { shareToken: rows[0].share_token };
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "Unable to create project share link.", code: "PROJECT_SHARE_FAILED" });
    }
  });

  app.get("/shared/projects/:token", async (request, reply) => {
    if (!configured(config)) return reply.code(503).send({ error: "Project storage is not configured.", code: "PROJECTS_NOT_CONFIGURED" });
    const token = (request as ProjectRequest).params.token;
    if (!token) return reply.code(400).send({ error: "A share token is required.", code: "INVALID_PROJECT" });
    try {
      const response = await table(config, fetcher, `projects?share_token=eq.${encodeURIComponent(token)}&is_shared=eq.true&limit=1`);
      const rows = (await response.json()) as Array<Record<string, unknown>>;
      if (!rows[0]) return reply.code(404).send({ error: "Shared project not found.", code: "PROJECT_NOT_FOUND" });
      return { project: rows[0] };
    } catch (error) {
      request.log.error(error);
      return reply.code(502).send({ error: "Unable to load shared project.", code: "PROJECT_SHARE_LOAD_FAILED" });
    }
  });
}
