import type { AppConfig } from "../../config/env.js";
import {
  AI_PLUGINS,
  AiAnalysisSchema,
  type AiAnalysisInput,
  AiMixPlanSchema,
  type AiChatInput,
  type AiMixPlan,
} from "../../modules/ai/schema.js";

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly statusCode = 502,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AiProviderError";
  }
}

const systemPrompt = `You are KREATIVE Mix Assistant. Return only a JSON object with exactly this shape:
{"message":"short, clear explanation","actions":[...]}

Allowed action forms:
- {"type":"setFx","trackId":"existing id","patch":{"known Fx field":value}}
- {"type":"setTrackMix","trackId":"existing id","volume":-3,"pan":0.1} (either field may be omitted)
- {"type":"setMaster","volume":-1}
- {"type":"insertPlugin","trackId":"existing id","slot":0,"plugin":"exact catalog name"}

Only use these plugins: ${AI_PLUGINS.join(", ")}. Every action must use an existing track id from the supplied project. Every setFx patch must contain only supported mixer field names and values within their supported ranges. When an FX change needs a processor, include a matching insertPlugin action for the same track and use a currently empty insert slot. Never claim a processor was inserted or changed unless the corresponding action is present.
When changing Parametric EQ eqBands, each band must include id, type, frequency, gain, q, enabled, dynamic, thresholdDb, rangeDb, attack, and release.
Use the supplied track name, kind, and role as authoritative routing context. Lead vocals should remain the loudest vocal layer, centered unless the user requests otherwise; background vocals, harmonies, and ad-libs should normally be lower and wider than the lead, with distinct fader levels and alternating modest pan positions, and should not receive lead-level gain. For whole-project, vocal-mixing, template-like, or balance requests, explicitly include setTrackMix actions for the lead and identified supporting vocal layers so their volume faders and panning are not left identical. Prefer routing background layers to a background vocal bus when one exists. Keep compression conservative and avoid settings likely to exceed about 5 dB of gain reduction on vocal tracks. Only adjust settings that serve the user's request. For follow-up requests, preserve every unrelated track and setting. If a specific track is requested, do not change other tracks. For whole-project requests, make a coherent plan across the supplied tracks and include sensible mastering/headroom changes. The app has no dedicated master insert chain, so do not claim to apply master-bus processors. Insert plugins only when they are not already present; use distinct slots from 0 through 9 and do not add the same processor block twice to a track. Put inserts in a conventional displayed order, but do not claim slot placement changes the browser engine's fixed signal-processing order.

You receive project metadata and, when available, a cached acoustic analysis from the provider. Treat that analysis as the source of audio observations and do not invent details that are not present in it. If no cached analysis is supplied, limit conclusions to the measured statistics. If the user requests the distinctive style of a named artist, do not imitate that artist; translate the request into broad, non-identifying mix traits and say so briefly in the message. Prefer modest, reversible changes.`;

const analysisPrompt = `You are KREATIVE Audio Analyst. Analyze the supplied audio clips and return only JSON:
{"summary":"overall mix assessment","tracks":[{"trackId":"exact supplied id","role":"lead vocal, drums, beat, etc.","observations":["..."],"recommendations":["..."]}],"master":{"observations":["..."],"recommendations":["..."]}}
Identify likely track roles from names and sound, describe actionable issues such as masking, dynamics, harshness, noise, phase, stereo balance, and headroom, and recommend conservative processing using the platform's native plugins. If a clip is labeled reference-song, analyze it as a sonic reference: report measurable broad traits such as tonal balance, dynamics, loudness/headroom, stereo image, and density, then translate those traits into mix guidance. Do not copy the reference, identify or imitate an artist, or claim certainty where the audio is ambiguous.`;

function parsePlan(content: string): AiMixPlan {
  const text = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new AiProviderError(
        "The AI provider returned a response that was not valid JSON.",
        502,
        { cause: error },
      );
    }
    try {
      value = JSON.parse(text.slice(start, end + 1));
    } catch (fallbackError) {
      throw new AiProviderError(
        "The AI provider returned a response that was not valid JSON.",
        502,
        { cause: fallbackError },
      );
    }
  }
  const parsed = AiMixPlanSchema.safeParse(value);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "plan"}: ${issue.message}`)
      .join("; ");
    throw new AiProviderError(
      `The AI provider returned an invalid mix plan. ${details} No changes were applied.`,
    );
  }
  return parsed.data;
}

async function readProviderJson(response: Response, provider: string) {
  if (!response.ok) {
    const statusCode = response.status === 429 ? 429 : 502;
    throw new AiProviderError(
      `${provider} could not complete the request (HTTP ${response.status}). No mix changes were applied.`,
      statusCode,
    );
  }
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    throw new AiProviderError(
      `${provider} returned an unreadable response.`,
      502,
      { cause: error },
    );
  }
}

async function callOpenAi(
  config: AppConfig,
  input: AiChatInput,
  fetcher: typeof fetch,
) {
  const projectContext = `Current project metadata:\n${JSON.stringify(input.project)}${
    input.analysis ? `\nCached acoustic analysis:\n${JSON.stringify(input.analysis)}` : ""
  }`;
  const conversation = input.conversation.map((message, index) => ({
    role: message.role,
    content:
      index === input.conversation.length - 1
        ? `${message.content}\n\n${projectContext}`
        : message.content,
  }));
  let response: Response;
  try {
    response = await fetcher("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        max_completion_tokens: 2000,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: systemPrompt }, ...conversation],
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new AiProviderError(
      "Could not reach the configured AI provider. No mix changes were applied.",
      502,
      {
        cause: error,
      },
    );
  }
  const body = await readProviderJson(response, "OpenAI");
  const choices = body.choices;
  if (!Array.isArray(choices))
    throw new AiProviderError("OpenAI returned no assistant response.");
  const first = choices[0] as { message?: { content?: unknown } } | undefined;
  if (typeof first?.message?.content !== "string") {
    throw new AiProviderError("OpenAI returned no structured mix plan.");
  }
  return parsePlan(first.message.content);
}

async function callGemini(
  config: AppConfig,
  input: AiChatInput,
  fetcher: typeof fetch,
) {
  const model = config.GEMINI_MODEL || "gemini-3.8-flash";
  const contents = [
    ...input.conversation.map((message, index) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [
        {
          text:
            index === input.conversation.length - 1
              ? `${message.content}\n\nCurrent project metadata:\n${JSON.stringify(input.project)}${
                  input.analysis
                    ? `\nCached acoustic analysis:\n${JSON.stringify(input.analysis)}`
                    : ""
                }`
              : message.content,
        },
      ],
    })),
  ];
  let response: Response;
  try {
    response = await fetcher(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": config.GEMINI_API_KEY!,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
            maxOutputTokens: 2048,
          },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch (error) {
    throw new AiProviderError(
      "Could not reach the configured AI provider. No mix changes were applied.",
      502,
      {
        cause: error,
      },
    );
  }
  const body = await readProviderJson(response, "Gemini");
  const candidates = body.candidates;
  if (!Array.isArray(candidates))
    throw new AiProviderError("Gemini returned no assistant response.");
  const first = candidates[0] as
    { content?: { parts?: Array<{ text?: unknown }> } } | undefined;
  const content = first?.content?.parts?.find(
    (part) => typeof part.text === "string",
  )?.text;
  if (typeof content !== "string")
    throw new AiProviderError("Gemini returned no structured mix plan.");
  return parsePlan(content);
}

export function generateAiMixPlan(
  config: AppConfig,
  input: AiChatInput,
  fetcher: typeof fetch = fetch,
) {
  if (config.AI_PROVIDER === "openai")
    return callOpenAi(config, input, fetcher);
  if (config.AI_PROVIDER === "gemini")
    return callGemini(config, input, fetcher);
  throw new AiProviderError("AI is not configured on this server.", 503);
}

export function generateAiAudioAnalysis(
  config: AppConfig,
  input: AiAnalysisInput,
  fetcher: typeof fetch = fetch,
) {
  if (config.AI_PROVIDER === "openai")
    return callOpenAiAnalysis(config, input, fetcher);
  if (config.AI_PROVIDER === "gemini")
    return callGeminiAnalysis(config, input, fetcher);
  throw new AiProviderError("AI is not configured on this server.", 503);
}

async function parseAnalysisResponse(response: Response, provider: string) {
  const body = await readProviderJson(response, provider);
  let content: unknown;
  if (provider === "OpenAI") {
    const choices = body.choices;
    const first = Array.isArray(choices) ? choices[0] : undefined;
    content = (first as { message?: { content?: unknown } } | undefined)?.message?.content;
  } else {
    const candidates = body.candidates;
    const first = Array.isArray(candidates) ? candidates[0] : undefined;
    content = (first as { content?: { parts?: Array<{ text?: unknown }> } } | undefined)?.content?.parts
      ?.find((part) => typeof part.text === "string")?.text;
  }
  if (typeof content !== "string") {
    throw new AiProviderError(`${provider} returned no structured audio analysis.`);
  }
  const text = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new AiProviderError(`${provider} returned invalid audio analysis JSON.`, 502, {
        cause: error,
      });
    }
    try {
      value = JSON.parse(text.slice(start, end + 1));
    } catch (fallbackError) {
      throw new AiProviderError(`${provider} returned invalid audio analysis JSON.`, 502, {
        cause: fallbackError,
      });
    }
  }
  const parsed = AiAnalysisSchema.safeParse(value);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "analysis"}: ${issue.message}`)
      .join("; ");
    throw new AiProviderError(
      `The AI provider returned an invalid audio analysis. ${details}`,
    );
  }
  return parsed.data;
}

async function callOpenAiAnalysis(
  config: AppConfig,
  input: AiAnalysisInput,
  fetcher: typeof fetch,
) {
  const audioTracks = input.reference
    ? [
        ...input.tracks,
        {
          trackId: "reference-song",
          name: input.reference.name,
          mimeType: input.reference.mimeType,
          audioBase64: input.reference.audioBase64,
        },
      ]
    : input.tracks;
  const content = [
    { type: "text", text: `${analysisPrompt}\nTrack metadata:\n${JSON.stringify(input.project)}` },
    ...audioTracks.map((track) => ({
      type: "input_audio",
      input_audio: { data: track.audioBase64, format: "wav" },
    })),
  ];
  let response: Response;
  try {
    response = await fetcher("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.OPENAI_AUDIO_MODEL || config.OPENAI_MODEL || "gpt-4o-audio-preview",
        temperature: 0.1,
        max_completion_tokens: 3000,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: analysisPrompt }, { role: "user", content }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw new AiProviderError("Could not reach the configured audio-analysis provider.", 502, { cause: error });
  }
  return parseAnalysisResponse(response, "OpenAI");
}

async function callGeminiAnalysis(
  config: AppConfig,
  input: AiAnalysisInput,
  fetcher: typeof fetch,
) {
  const audioTracks = input.reference
    ? [
        ...input.tracks,
        {
          trackId: "reference-song",
          name: input.reference.name,
          mimeType: input.reference.mimeType,
          audioBase64: input.reference.audioBase64,
        },
      ]
    : input.tracks;
  const parts = [
    { text: `${analysisPrompt}\nTrack metadata:\n${JSON.stringify(input.project)}` },
    ...audioTracks.flatMap((track) => [
      { text: `The next audio clip is track ${track.trackId} (${track.name}).` },
      { inlineData: { mimeType: track.mimeType, data: track.audioBase64 } },
    ]),
  ];
  let response: Response;
  try {
    response = await fetcher(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.GEMINI_AUDIO_MODEL || config.GEMINI_MODEL || "gemini-3.8-flash")}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": config.GEMINI_API_KEY! },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: analysisPrompt }] },
          contents: [{ role: "user", parts }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 3000 },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch (error) {
    throw new AiProviderError("Could not reach the configured audio-analysis provider.", 502, { cause: error });
  }
  return parseAnalysisResponse(response, "Gemini");
}
