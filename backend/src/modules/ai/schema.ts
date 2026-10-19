import { z } from "zod";

const TrackId = z.string().min(1).max(80);
const ProjectTrack = z
  .object({
    id: TrackId,
    name: z.string().min(1).max(120),
    kind: z.enum(["audio", "bus"]).optional().default("audio"),
    role: z.string().min(1).max(80).optional().default("audio"),
    volume: z.number().finite().min(-60).max(6),
    pan: z.number().finite().min(-1).max(1),
    mute: z.boolean(),
    solo: z.boolean(),
    inserts: z.array(z.string().max(80).nullable()).max(10),
    stats: z
      .object({
        peakDb: z.number().finite().min(-100).max(24),
        truePeakDb: z.number().finite().min(-100).max(24),
        rmsDb: z.number().finite().min(-100).max(24),
        crest: z.number().finite().min(-100).max(120),
        clips: z.number().int().min(0).max(1_000_000),
        duration: z.number().finite().min(0).max(86400),
      })
      .strict(),
    fx: z
      .object({})
      .passthrough()
      .refine((value) => Object.keys(value).length <= 80, {
        message: "FX state contains too many parameters.",
      }),
  })
  .strict();
const Project = z
  .object({
    selectedTrackId: TrackId.nullable(),
    masterVolume: z.number().finite().min(-60).max(6),
    tracks: z.array(ProjectTrack).max(32),
  })
  .strict();
const Analysis = z
  .object({
    summary: z.string().min(1).max(4000),
    tracks: z
      .array(
        z
          .object({
            trackId: TrackId,
            role: z.string().min(1).max(80),
            observations: z.array(z.string().min(1).max(500)).max(12),
            recommendations: z.array(z.string().min(1).max(500)).max(12),
          })
          .strict(),
      )
      .max(32),
    master: z
      .object({
        observations: z.array(z.string().min(1).max(500)).max(12),
        recommendations: z.array(z.string().min(1).max(500)).max(12),
      })
      .strict(),
  })
  .strict();
const EqBand = z
  .object({
    id: z.string().min(1).max(80),
    type: z.enum([
      "bell",
      "lowShelf",
      "highShelf",
      "lowPass",
      "highPass",
      "notch",
    ]),
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

const FX_RANGES: Record<string, [number, number]> = {
  eqLow: [-12, 12],
  eqMid: [-12, 12],
  eqMidFreq: [100, 10000],
  eqMidQ: [0.2, 8],
  eqHighMid: [-12, 12],
  eqHighMidFreq: [1000, 12000],
  eqHighMidQ: [0.2, 8],
  eqHigh: [-12, 12],
  hpFreq: [20, 1000],
  lpFreq: [1000, 20000],
  compThreshold: [-50, 0],
  compRatio: [1, 4],
  compAttack: [0.001, 0.2],
  compRelease: [0.01, 1],
  compKnee: [0, 30],
  compMakeup: [-12, 18],
  compMix: [0, 1],
  smoothenTarget: [-30, -10],
  smoothenRange: [0, 18],
  smoothenFloor: [-72, -24],
  smoothenSpeed: [0.05, 1.5],
  smoothenMix: [0, 1],
  dynThreshold: [-80, -10],
  dynAttack: [0.001, 0.1],
  dynRelease: [0.005, 1],
  dynRange: [-80, 0],
  dynHysteresis: [0, 12],
  drive: [0, 1],
  satMix: [0, 1],
  satBias: [-0.5, 0.5],
  satOutput: [-18, 6],
  ampDrive: [0, 1],
  ampBias: [-0.5, 0.5],
  ampSag: [0, 1],
  ampPresence: [0, 1],
  ampOutput: [-18, 6],
  ampBass: [-12, 12],
  ampMid: [-12, 12],
  ampTreble: [-12, 12],
  width: [0, 2],
  modRate: [0.05, 8],
  modDepth: [0, 1],
  modMix: [0, 1],
  modFeedback: [0, 0.9],
  modPan: [-1, 1],
  modTone: [1000, 18000],
  delayTime: [0.02, 1.5],
  delayFeedback: [0, 0.9],
  delayMix: [0, 1],
  delayTone: [800, 18000],
  reverb: [0, 1],
  reverbSize: [0, 1],
  reverbPreDelay: [0, 0.15],
  reverbTone: [800, 18000],
  pitchKey: [0, 11],
  pitchSpeed: [0.005, 0.5],
  pitchHumanize: [0, 1],
  pitchFloor: [-72, -24],
  pitchMix: [0, 1],
  pitchReference: [430, 450],
  pitchTranspose: [-12, 12],
  pitchRangeLow: [36, 96],
  pitchRangeHigh: [36, 96],
};

const FX_BOOLEAN_KEYS = new Set([
  "hpOn",
  "lpOn",
  "compOn",
  "smoothenOn",
  "pitchOn",
  "cabOn",
  "phase",
]);
const FX_ENUMS: Record<string, readonly (string | number)[]> = {
  dynMode: [0, 1, 2],
  satMode: [0, 1, 2, 3, 4],
  ampModel: [0, 1, 2, 3, 4],
  modType: ["off", "chorus", "flanger", "phaser", "tremolo"],
  modWaveform: ["sine", "triangle", "square", "sawtooth"],
  delayType: ["off", "delay", "tape", "pingpong"],
  pitchScale: [0, 1, 2, 3, 4],
};
const FX_KEYS = new Set([
  ...Object.keys(FX_RANGES),
  ...FX_BOOLEAN_KEYS,
  ...Object.keys(FX_ENUMS),
  "eqBands",
]);

const FxValue = z.union([
  z.number().finite(),
  z.boolean(),
  z.string().max(24),
  z.array(EqBand).max(8),
]);
const FxPatch = z.record(z.string(), FxValue).superRefine((patch, context) => {
  if (Object.keys(patch).length === 0) {
    context.addIssue({
      code: "custom",
      message: "FX changes cannot be empty.",
    });
  }
  for (const [key, value] of Object.entries(patch)) {
    if (!FX_KEYS.has(key)) {
      context.addIssue({
        code: "custom",
        message: `Unsupported mixer parameter: ${key}`,
        path: [key],
      });
      continue;
    }
    const range = FX_RANGES[key];
    if (
      range &&
      (typeof value !== "number" || value < range[0] || value > range[1])
    ) {
      context.addIssue({
        code: "custom",
        message: `${key} is outside its supported range`,
        path: [key],
      });
    }
    if (FX_BOOLEAN_KEYS.has(key) && typeof value !== "boolean") {
      context.addIssue({
        code: "custom",
        message: `${key} must be a boolean`,
        path: [key],
      });
    }
    if (key in FX_ENUMS && !FX_ENUMS[key]!.includes(value as string | number)) {
      context.addIssue({
        code: "custom",
        message: `${key} is not a supported choice`,
        path: [key],
      });
    }
  }
});

export const MixAction = z
  .discriminatedUnion("type", [
    z
      .object({ type: z.literal("setFx"), trackId: TrackId, patch: FxPatch })
      .strict(),
    z
      .object({
        type: z.literal("setTrackMix"),
        trackId: TrackId,
        volume: z.number().finite().min(-60).max(6).optional(),
        pan: z.number().finite().min(-1).max(1).optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("setMaster"),
        volume: z.number().finite().min(-60).max(6),
      })
      .strict(),
    z
      .object({
        type: z.literal("insertPlugin"),
        trackId: TrackId,
        slot: z.number().int().min(0).max(9),
        plugin: z.string().min(1).max(80),
      })
      .strict(),
  ])
  .superRefine((action, context) => {
    if (
      action.type === "setTrackMix" &&
      action.volume === undefined &&
      action.pan === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Track mix actions must change volume or pan.",
      });
    }
  });

export const AiChatRequest = z
  .object({
    conversation: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().min(1).max(2500),
          })
          .strict(),
      )
      .min(1)
      .max(16),
    project: Project,
    analysis: Analysis.optional(),
  })
  .strict()
  .refine((request) => request.conversation.at(-1)?.role === "user", {
    message: "The latest conversation entry must be a user message.",
  });

export const AiAnalysisRequest = z
  .object({
    project: Project,
    tracks: z
      .array(
        z
          .object({
            trackId: TrackId,
            name: z.string().min(1).max(120),
            mimeType: z.literal("audio/wav").default("audio/wav"),
            audioBase64: z.string().min(1).max(12_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(32),
    reference: z
      .object({
        name: z.string().min(1).max(120),
        mimeType: z.literal("audio/wav").default("audio/wav"),
        audioBase64: z.string().min(1).max(12_000_000),
      })
      .strict()
      .optional(),
  })
  .strict();

export const AiAnalysisSchema = Analysis;

export const AiMixPlanSchema = z
  .object({
    message: z.string().min(1).max(2000),
    actions: z.array(MixAction).max(48),
  })
  .strict();

export const AI_PLUGINS = [
  "K-2A",
  "K-76",
  "Studio Compressor",
  "Fast Limiter",
  "Gate",
  "Expander",
  "Parametric EQ",
  "Four-Band Console EQ",
  "High Pass / Low Pass",
  "12AX7 Class A",
  "Tweed Combo",
  "British Stack",
  "Modern High Gain",
  "Studio Chorus",
  "Jet Flanger",
  "Four-Stage Phaser",
  "Optical Tremolo",
  "Room Reverb",
  "Analog Delay",
  "Tape Echo",
  "Ping Pong Delay",
  "Soft Clip",
  "Tape Machine",
  "Tube Stage",
  "Harmonic Warmth",
  "Stereo & Phase Utility",
  "K1-Imager",
  "Smoothen",
  "KREATIVE Pitch",
] as const;

export type AiChatInput = z.infer<typeof AiChatRequest>;
export type AiAnalysisInput = z.infer<typeof AiAnalysisRequest>;
export type AiAnalysis = z.infer<typeof AiAnalysisSchema>;
export type AiMixPlan = z.infer<typeof AiMixPlanSchema>;
