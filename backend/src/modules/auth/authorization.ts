import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../../config/env.js";

export type AuthUser = { id: string; email?: string; email_confirmed_at?: string | null };

export function isAdminUser(user: AuthUser | null, config: AppConfig) {
  const email = user?.email?.trim().toLowerCase();
  return Boolean(user?.email_confirmed_at && email && config.ADMIN_EMAILS.has(email));
}

export async function getAuthenticatedUser(
  request: FastifyRequest,
  config: AppConfig,
  fetcher: typeof fetch = fetch,
): Promise<AuthUser | null> {
  if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) return null;
  const token = request.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const response = await fetcher(`${config.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: config.SUPABASE_ANON_KEY,
      authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) return null;
  const user = (await response.json()) as AuthUser;
  return user.id ? user : null;
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
  fetcher?: typeof fetch,
) {
  const user = await getAuthenticatedUser(request, config, fetcher);
  if (!isAdminUser(user, config)) {
    await reply.code(403).send({ error: "Administrator access is required.", code: "FORBIDDEN" });
    return null;
  }
  return user;
}
