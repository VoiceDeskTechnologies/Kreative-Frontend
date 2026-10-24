import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env.js";
import { getAuthenticatedUser, isAdminUser } from "../modules/auth/authorization.js";
import {
  AiAnalysisRequest,
  AiChatRequest,
  AI_PLUGINS,
} from "../modules/ai/schema.js";
import {
  AiProviderError,
  generateAiAudioAnalysis,
  generateAiMixPlan,
} from "../providers/ai/chat.js";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;

type RateWindow = { count: number; expiresAt: number };

const PLUGIN_FAMILY: Record<string, string> = {
  "K-2A": "compressor",
  "K-76": "compressor",
  "Studio Compressor": "compressor",
  "Fast Limiter": "compressor",
  Gate: "gate",
  Expander: "gate",
  "Parametric EQ": "parametricEq",
  "Four-Band Console EQ": "consoleEq",
  "High Pass / Low Pass": "consoleEq",
  "12AX7 Class A": "amp",
  "Tweed Combo": "amp",
  "British Stack": "amp",
  "Modern High Gain": "amp",
  "Studio Chorus": "modulation",
  "Jet Flanger": "modulation",
  "Four-Stage Phaser": "modulation",
  "Optical Tremolo": "modulation",
  "Room Reverb": "reverb",
  "Analog Delay": "delay",
  "Tape Echo": "delay",
  "Ping Pong Delay": "delay",
  "Soft Clip": "saturation",
  "Tape Machine": "saturation",
  "Tube Stage": "saturation",
  "Harmonic Warmth": "saturation",
  "Stereo & Phase Utility": "utility",
  "K1-Imager": "imager",
  Smoothen: "smoothen",
  "KREATIVE Pitch": "pitchCorrection",
};
export function registerAiRoutes(
  app: FastifyInstance,
  config: AppConfig,
  fetcher: typeof fetch = fetch,
) {
  const rateWindows = new Map<string, RateWindow>();

  app.get("/ai/status", async () => ({
    available: config.AI_PROVIDER !== "none",
    provider: config.AI_PROVIDER === "none" ? null : config.AI_PROVIDER,
    sendsAudio: config.AI_PROVIDER !== "none",
    requiresConsent: true,
  }));

  app.post("/ai/analyze", async (request, reply) => {
    const parsed = AiAnalysisRequest.safeParse(request.body);
    if (!parsed.success) {
      request.log.warn({ issues: parsed.error.issues }, "Invalid audio analysis request");
      return reply.code(400).send({
        error: "Invalid audio analysis request.",
        code: "INVALID_REQUEST",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }
    if (config.AI_PROVIDER === "none") {
      return reply.code(503).send({
        error: "AI audio analysis is not configured on this server.",
        code: "AI_NOT_CONFIGURED",
      });
    }
    const now = Date.now();
    for (const [client, window] of rateWindows) {
      if (window.expiresAt <= now) rateWindows.delete(client);
    }
    const client = request.ip;
    const isAdmin = isAdminUser(
      await getAuthenticatedUser(request, config, fetcher),
      config,
    );
    const current = rateWindows.get(client);
    if (
      !isAdmin &&
      current &&
      current.expiresAt > now &&
      current.count >= MAX_REQUESTS_PER_WINDOW
    ) {
      return reply.code(429).send({
        error: "AI audio analysis is temporarily rate limited. Please try again in a minute.",
        code: "RATE_LIMITED",
      });
    }
    if (!isAdmin) {
      rateWindows.set(
        client,
        current && current.expiresAt > now
          ? { ...current, count: current.count + 1 }
          : { count: 1, expiresAt: now + WINDOW_MS },
      );
    }
    try {
      return await generateAiAudioAnalysis(config, parsed.data, fetcher);
    } catch (error) {
      if (error instanceof AiProviderError) {
        request.log.warn(
          { err: error, provider: config.AI_PROVIDER, statusCode: error.statusCode },
          "AI audio analysis request failed",
        );
        return reply.code(error.statusCode).send({
          error: "Audio analysis failed. Please try again.",
          code: error.statusCode === 429 ? "PROVIDER_RATE_LIMITED" : "AI_REQUEST_FAILED",
        });
      }
      throw error;
    }
  });

  app.post("/ai/chat", async (request, reply) => {
    const parsed = AiChatRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid AI chat request.",
        code: "INVALID_REQUEST",
      });
    }
    const input = parsed.data;
    const trackIds = new Set(input.project.tracks.map((track) => track.id));
    if (
      input.project.selectedTrackId !== null &&
      !trackIds.has(input.project.selectedTrackId)
    ) {
      return reply.code(400).send({
        error: "The selected track is not part of the supplied project.",
        code: "INVALID_PROJECT",
      });
    }

    if (config.AI_PROVIDER === "none") {
      return reply.code(503).send({
        error: "AI is not configured on this server.",
        code: "AI_NOT_CONFIGURED",
      });
    }

    const now = Date.now();
    const isAdmin = isAdminUser(
      await getAuthenticatedUser(request, config, fetcher),
      config,
    );
    for (const [client, window] of rateWindows) {
      if (window.expiresAt <= now) rateWindows.delete(client);
    }
    const client = request.ip;
    const current = rateWindows.get(client);
    if (
      !isAdmin &&
      current &&
      current.expiresAt > now &&
      current.count >= MAX_REQUESTS_PER_WINDOW
    ) {
      return reply.code(429).send({
        error:
          "AI chat is temporarily rate limited. Please try again in a minute.",
        code: "RATE_LIMITED",
      });
    }
    if (!isAdmin) {
      rateWindows.set(
        client,
        current && current.expiresAt > now
          ? { ...current, count: current.count + 1 }
          : { count: 1, expiresAt: now + WINDOW_MS },
      );
    }

    try {
      const plan = await generateAiMixPlan(config, input, fetcher);
      const slotsByTrack = new Map(
        input.project.tracks.map((track) => [track.id, [...track.inserts]]),
      );
      for (const action of plan.actions) {
        if (action.type !== "setMaster" && !trackIds.has(action.trackId)) {
          throw new AiProviderError(
            "The AI proposed a change for an unknown track. No changes were applied.",
          );
        }
        if (
          action.type === "insertPlugin" &&
          !AI_PLUGINS.some((plugin) => plugin === action.plugin)
        ) {
          throw new AiProviderError(
            "The AI proposed an unsupported plugin. No changes were applied.",
          );
        }
        if (action.type === "insertPlugin") {
          const family = PLUGIN_FAMILY[action.plugin];
          const slots = slotsByTrack.get(action.trackId);
          if (!slots || !family) {
            throw new AiProviderError(
              "The AI proposed an invalid insert target. No changes were applied.",
            );
          }
          const duplicate = slots.findIndex(
            (plugin, slot) =>
              slot !== action.slot &&
              plugin &&
              PLUGIN_FAMILY[plugin] === family,
          );
          if (duplicate >= 0) {
            throw new AiProviderError(
              `The AI attempted to duplicate a processor block on ${action.trackId}. No changes were applied.`,
            );
          }
          slots[action.slot] = action.plugin;
        }
      }
      return { message: plan.message, actions: plan.actions };
    } catch (error) {
      if (error instanceof AiProviderError) {
        request.log.warn(
          { err: error, provider: config.AI_PROVIDER, statusCode: error.statusCode },
          "AI chat request failed",
        );
        return reply.code(error.statusCode).send({
          error: "Couldn't complete that request. Please try again.",
          code:
            error.statusCode === 429
              ? "PROVIDER_RATE_LIMITED"
              : "AI_REQUEST_FAILED",
        });
      }
      throw error;
    }
  });
}
