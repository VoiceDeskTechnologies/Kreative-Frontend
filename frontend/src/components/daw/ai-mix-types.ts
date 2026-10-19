import { z } from "zod";
import { analyzeBuffer, defaultFx, type Fx, type TrackState } from "./engine";
import { validateTemplateParameter } from "./template-parameters";

const EqBandSchema = z
  .object({
    id: z.string().min(1).max(80),
    type: z.enum(["bell", "lowShelf", "highShelf", "lowPass", "highPass", "notch"]),
    frequency: z.number().finite().min(20).max(20000),
    gain: z.number().finite().min(-24).max(24),
    q: z.number().finite().min(0.1).max(18),
    enabled: z.boolean(),
    dynamic: z.boolean(),
    thresholdDb: z.number().finite().min(-60).max(0),
    rangeDb: z.number().finite().min(0).max(18),
    attack: z.number().finite().min(0.001).max(0.2),
    release: z.number().finite().min(0.01).max(1),
  })
  .strict();

const knownFx = defaultFx();
const FxPatchSchema = z
  .record(
    z.string(),
    z.union([z.number().finite(), z.boolean(), z.string().max(24), z.array(EqBandSchema).max(8)]),
  )
  .superRefine((patch, context) => {
    for (const [key, value] of Object.entries(patch)) {
      if (!Object.hasOwn(knownFx, key)) {
        context.addIssue({
          code: "custom",
          message: `Unknown mixer parameter: ${key}`,
          path: [key],
        });
        continue;
      }
      const existing = knownFx[key as keyof Fx];
      const valid = Array.isArray(existing)
        ? Array.isArray(value)
        : typeof existing === typeof value;
      if (!valid) {
        context.addIssue({ code: "custom", message: `Invalid value type for ${key}`, path: [key] });
      }
      if (typeof value === "number") {
        const error = validateTemplateParameter(key, value);
        if (error) context.addIssue({ code: "custom", message: error, path: [key] });
      }
    }
  });

export const AiMixActionSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("setFx"), trackId: z.string().min(1).max(80), patch: FxPatchSchema })
    .strict(),
  z
    .object({
      type: z.literal("setTrackMix"),
      trackId: z.string().min(1).max(80),
      volume: z.number().finite().min(-60).max(6).optional(),
      pan: z.number().finite().min(-1).max(1).optional(),
    })
    .strict(),
  z.object({ type: z.literal("setMaster"), volume: z.number().finite().min(-60).max(6) }).strict(),
  z
    .object({
      type: z.literal("insertPlugin"),
      trackId: z.string().min(1).max(80),
      slot: z.number().int().min(0).max(9),
      plugin: z.string().min(1).max(80),
    })
    .strict(),
]);

export const AiMixPlanSchema = z
  .object({
    message: z.string().min(1).max(2000),
    actions: z.array(AiMixActionSchema).max(48),
  })
  .strict();

export type AiMixAction = z.infer<typeof AiMixActionSchema>;
export type AiConversationMessage = { role: "user" | "assistant"; content: string };
export type AiAnalysis = {
  summary: string;
  tracks: Array<{
    trackId: string;
    role: string;
    observations: string[];
    recommendations: string[];
  }>;
  master: {
    observations: string[];
    recommendations: string[];
  };
};

export function parseAiAnalysis(value: unknown): AiAnalysis {
  if (!value || typeof value !== "object")
    throw new Error("The audio analysis response was invalid.");
  const candidate = value as Partial<AiAnalysis>;
  if (
    typeof candidate.summary !== "string" ||
    !Array.isArray(candidate.tracks) ||
    !candidate.master ||
    typeof candidate.master !== "object"
  ) {
    throw new Error("The audio analysis response was invalid.");
  }
  return candidate as AiAnalysis;
}

export function encodeTrackAudio(buffer: AudioBuffer, maxSeconds = 90) {
  const sampleRate = 16000;
  const sourceLength = Math.max(
    1,
    Math.min(buffer.length, Math.floor(buffer.sampleRate * maxSeconds)),
  );
  const outputLength = Math.max(1, Math.floor((sourceLength / buffer.sampleRate) * sampleRate));
  const bytes = new ArrayBuffer(44 + outputLength * 2);
  const view = new DataView(bytes);
  const writeString = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1)
      view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + outputLength * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, outputLength * 2, true);
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = Math.min(
      sourceLength - 1,
      Math.floor((index / outputLength) * sourceLength),
    );
    const sample = Math.max(-1, Math.min(1, (left[sourceIndex]! + right[sourceIndex]!) * 0.5));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  const bytesView = new Uint8Array(bytes);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytesView.length; index += chunkSize) {
    binary += String.fromCharCode(...bytesView.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export type AiProjectSnapshot = {
  selectedTrackId: string | null;
  masterVolume: number;
  tracks: Array<{
    id: string;
    name: string;
    kind: "audio" | "bus";
    role: string;
    volume: number;
    pan: number;
    mute: boolean;
    solo: boolean;
    inserts: (string | null)[];
    stats: {
      peakDb: number;
      truePeakDb: number;
      rmsDb: number;
      crest: number;
      clips: number;
      duration: number;
    };
    fx: Fx;
  }>;
};

export function parseAiMixPlan(value: unknown) {
  const result = AiMixPlanSchema.safeParse(value);
  if (!result.success) throw new Error("The assistant returned an invalid mix plan.");
  return result.data as {
    message: string;
    actions: AiMixAction[];
  };
}

export function snapshotProject(
  tracks: TrackState[],
  selectedTrackId: string | null,
  masterVolume: number,
): AiProjectSnapshot {
  return {
    selectedTrackId,
    masterVolume,
    tracks: tracks.map((track) => {
      const stats = analyzeBuffer(track.buffer);
      return {
        id: track.id,
        name: track.name,
        kind: track.kind ?? "audio",
        role: inferTrackRole(track.name, track.kind),
        volume: track.volume,
        pan: track.pan,
        mute: track.mute,
        solo: track.solo,
        inserts: [...track.inserts],
        stats: {
          peakDb: stats.peakDb,
          truePeakDb: stats.truePeakDb,
          rmsDb: stats.rmsDb,
          crest: stats.crest,
          clips: stats.clips,
          duration: stats.duration,
        },
        fx: track.fx,
      };
    }),
  };
}

function inferTrackRole(name: string, kind?: "audio" | "bus") {
  if (kind === "bus") return "bus";
  const normalized = name.toLowerCase();
  if (/\b(adlib|ad-lib)\b/.test(normalized)) return "adlib";
  if (/\b(harmony|harmonies|background|bgv|backing)\b/.test(normalized)) return "background-vocal";
  if (/\b(beat|instrumental|music)\b/.test(normalized)) return "beat";
  if (/\b(master|mix)\b/.test(normalized)) return "master";
  if (/\b(vocal|vox|voice|lead|rap|singer)\b/.test(normalized)) return "lead-vocal";
  return "audio";
}
