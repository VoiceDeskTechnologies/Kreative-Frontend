import { getPluginFamily, getPluginSettings, PLUGINS } from "./data";
import { defaultFx, type Fx, type TrackState } from "./engine";
import { applyTemplatePlan, compileTemplateTrack } from "./template-engine";
import { getTemplateParameterDefinition } from "./template-parameters";

export type TemplateCategory =
  "vocal" | "vocal-support" | "two-track-beat" | "full-mix" | "mastering";
export type TemplateRole =
  | "lead-vocal"
  | "vocal-double"
  | "harmony"
  | "adlib"
  | "beat"
  | "vocal-bus"
  | "reverb-bus"
  | "delay-bus"
  | "master";

export type TemplatePlugin = {
  id: string;
  pluginType: string;
  enabledByDefault: boolean;
  optional: boolean;
  parameters: Partial<Fx>;
  aiParameterLimits: Record<string, { min: number; max: number }>;
};

export type TemplateTrack = {
  role: TemplateRole;
  name: string;
  trackType: "audio" | "bus";
  volume?: number;
  pan?: number;
  plugins: TemplatePlugin[];
  outputBus: string;
  sends?: Array<{ targetRole: "reverb-bus" | "delay-bus"; levelDb: number }>;
  tempoSync?: "eighth" | "dotted-eighth";
};

export const TEMPLATE_MIX_DEFAULTS: Record<TemplateRole, { volume: number; pan: number }> = {
  "lead-vocal": { volume: 0, pan: 0 },
  "vocal-double": { volume: -4, pan: 0.24 },
  harmony: { volume: -7, pan: 0.34 },
  adlib: { volume: -9, pan: -0.4 },
  beat: { volume: -3, pan: 0 },
  "vocal-bus": { volume: 0, pan: 0 },
  "reverb-bus": { volume: -10, pan: 0 },
  "delay-bus": { volume: -12, pan: 0 },
  master: { volume: 0, pan: 0 },
};

export type MixTemplate = {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  genres: string[];
  sourceRequirements: string[];
  intendedResults: string[];
  tracks: TemplateTrack[];
  aiInstructions: string[];
  processingConstraints: Record<string, unknown>;
  version: number;
};

const pluginFamilies = new Set(
  Object.values(PLUGINS).flatMap((entries) => entries.map(([name]) => getPluginFamily(name))),
);

function plugin(
  id: string,
  pluginType: string,
  parameters: Partial<Fx> = {},
  optional = false,
): TemplatePlugin {
  const defaults = getPluginSettings(pluginType);
  if (!defaults) throw new Error(`Template references unavailable plugin: ${pluginType}`);
  const merged = { ...defaults, ...parameters };
  return {
    id,
    pluginType,
    enabledByDefault: !optional,
    optional,
    parameters: merged,
    aiParameterLimits: Object.fromEntries(
      Object.entries(merged)
        .filter(([, value]) => typeof value === "number")
        .map(([key, value]) => [
          key,
          (() => {
            const rule = getTemplateParameterDefinition(key);
            return rule
              ? { min: rule.min, max: rule.max }
              : { min: value as number, max: value as number };
          })(),
        ]),
    ),
  };
}

type PluginSpec = [string, Partial<Fx>?, boolean?];

function track(
  role: TemplateRole,
  name: string,
  plugins: PluginSpec[],
  outputBus = "master",
  sends?: TemplateTrack["sends"],
  tempoSync?: TemplateTrack["tempoSync"],
): TemplateTrack {
  return {
    role,
    name,
    trackType: role === "master" || role.endsWith("bus") ? "bus" : "audio",
    ...TEMPLATE_MIX_DEFAULTS[role],
    outputBus,
    ...(sends ? { sends } : {}),
    ...(tempoSync ? { tempoSync } : {}),
    plugins: plugins.map(([pluginType, parameters, optional], index) =>
      plugin(`${role}-${index + 1}`, pluginType, parameters, optional),
    ),
  };
}

const vocalBase: PluginSpec[] = [
  ["High Pass / Low Pass", { hpOn: true, hpFreq: 65, lpOn: true, lpFreq: 18000 }],
  [
    "Parametric EQ",
    {
      eqBands: [
        {
          id: "cut",
          type: "bell",
          frequency: 300,
          gain: -1.5,
          q: 1.2,
          enabled: true,
          dynamic: false,
          thresholdDb: -24,
          rangeDb: 4,
          attack: 0.01,
          release: 0.16,
        },
      ],
    },
  ],
  [
    "Studio Compressor",
    {
      compOn: true,
      compThreshold: -10,
      compRatio: 2.2,
      compAttack: 0.015,
      compRelease: 0.12,
      compMix: 0.75,
    },
  ],
  [
    "KREATIVE De-Esser",
    {
      deEssOn: true,
      deEssFrequency: 6500,
      deEssThreshold: -28,
      deEssRange: 5,
      deEssAttack: 0.002,
      deEssRelease: 0.08,
      deEssMix: 1,
    },
  ],
];
const beatBase: PluginSpec[] = [
  [
    "Four-Band Console EQ",
    {
      hpOn: true,
      hpFreq: 28,
      lpOn: true,
      lpFreq: 19000,
      eqLow: 0,
      eqMid: -0.5,
      eqMidFreq: 320,
      eqHighMid: 0,
      eqHigh: 0,
    },
  ],
  [
    "Studio Compressor",
    {
      compOn: true,
      compThreshold: -8,
      compRatio: 1.5,
      compAttack: 0.035,
      compRelease: 0.18,
      compMix: 0.35,
    },
    true,
  ],
];
const masterBase: PluginSpec[] = [
  [
    "Fast Limiter",
    {
      compOn: true,
      compThreshold: -1.5,
      compRatio: 4,
      compAttack: 0.002,
      compRelease: 0.12,
      compMakeup: 0,
    },
  ],
];
const vocalBusBase: PluginSpec[] = [
  ["High Pass / Low Pass", { hpOn: true, hpFreq: 65, lpOn: true, lpFreq: 18000 }],
  [
    "Parametric EQ",
    {
      eqBands: [
        {
          id: "bus-mud",
          type: "bell",
          frequency: 280,
          gain: -0.8,
          q: 1,
          enabled: true,
          dynamic: true,
          thresholdDb: -18,
          rangeDb: 2,
          attack: 0.02,
          release: 0.2,
        },
      ],
    },
  ],
  [
    "Studio Compressor",
    {
      compOn: true,
      compThreshold: -10,
      compRatio: 1.8,
      compAttack: 0.025,
      compRelease: 0.16,
      compMix: 0.6,
    },
  ],
];
const vocalDoubleBase: PluginSpec[] = [
  ["High Pass / Low Pass", { hpOn: true, hpFreq: 95, lpOn: true, lpFreq: 16000 }],
  [
    "K-76",
    {
      compOn: true,
      compThreshold: -12,
      compRatio: 2.5,
      compAttack: 0.008,
      compRelease: 0.1,
      compMix: 0.7,
    },
  ],
  ["K1-Imager", { width: 1.08, imagerMono: 0.12 }],
];
const harmonyBase: PluginSpec[] = [
  ["High Pass / Low Pass", { hpOn: true, hpFreq: 115, lpOn: true, lpFreq: 16500 }],
  [
    "Studio Compressor",
    {
      compOn: true,
      compThreshold: -12,
      compRatio: 2,
      compAttack: 0.025,
      compRelease: 0.14,
      compMix: 0.65,
    },
  ],
  ["K1-Imager", { width: 1.12, imagerMono: 0.15 }],
];
const adlibBase: PluginSpec[] = [
  ["High Pass / Low Pass", { hpOn: true, hpFreq: 100, lpOn: true, lpFreq: 16000 }],
  [
    "K-76",
    {
      compOn: true,
      compThreshold: -12,
      compRatio: 3,
      compAttack: 0.005,
      compRelease: 0.09,
      compMix: 0.75,
    },
  ],
];
const reverbBusBase: PluginSpec[] = [
  ["Room Reverb", { reverb: 0.8, reverbSize: 0.5, reverbPreDelay: 0.03, reverbTone: 9000 }],
];
const delayBusBase: PluginSpec[] = [
  [
    "Analog Delay",
    { delayType: "delay", delayTime: 0.25, delayFeedback: 0.2, delayMix: 0.85, delayTone: 7500 },
  ],
];

type Spec = [string, string, TemplateCategory, string[], PluginSpec[], string];
const specs: Spec[] = [
  [
    "clean-lead-vocal",
    "Clean Lead Vocal",
    "vocal",
    ["pop", "general"],
    vocalBase,
    "Controlled, clear, forward vocal with transparent gain riding.",
  ],
  [
    "modern-dancehall-lead",
    "Modern Dancehall Lead",
    "vocal",
    ["dancehall"],
    [...vocalBase, ["Tape Machine", { satMode: 1, drive: 0.12, satMix: 0.35 }]],
    "Articulate vocal with firm low-mid control and rhythmic presence.",
  ],
  [
    "roots-reggae-lead",
    "Roots Reggae Lead",
    "vocal",
    ["reggae"],
    vocalBase,
    "Warm, natural lead vocal with restrained ambience.",
  ],
  [
    "trap-vocal",
    "Trap Vocal",
    "vocal",
    ["trap"],
    [
      ["High Pass / Low Pass", { hpOn: true, hpFreq: 75, lpOn: true, lpFreq: 17500 }],
      [
        "K-76",
        { compOn: true, compThreshold: -12, compRatio: 3, compAttack: 0.006, compRelease: 0.09 },
      ],
      ["KREATIVE Pitch", { pitchOn: true, pitchSpeed: 0.08, pitchMix: 0.8 }, true],
    ],
    "Tight, controlled vocal with optional modern tuning and tempo-aware space.",
  ],
  [
    "melodic-rap-vocal",
    "Melodic Rap Vocal",
    "vocal",
    ["hip-hop", "rnb"],
    [
      ["High Pass / Low Pass", { hpOn: true, hpFreq: 70 }],
      ["Studio Compressor", { compOn: true, compThreshold: -12, compRatio: 2.5, compAttack: 0.02 }],
      ["KREATIVE Pitch", { pitchOn: true, pitchSpeed: 0.12, pitchHumanize: 0.4 }, true],
    ],
    "Smooth sung-rap level and pitch consistency without flattening expression.",
  ],
  [
    "aggressive-rap-vocal",
    "Aggressive Rap Vocal",
    "vocal",
    ["hip-hop"],
    [
      ["High Pass / Low Pass", { hpOn: true, hpFreq: 75 }],
      [
        "K-76",
        { compOn: true, compThreshold: -18, compRatio: 4, compAttack: 0.003, compRelease: 0.08 },
      ],
      ["Soft Clip", { satMode: 1, drive: 0.2, satMix: 0.35 }],
    ],
    "Forward, intelligible peak control with controlled attitude.",
  ],
  [
    "rnb-lead-vocal",
    "R&B Lead Vocal",
    "vocal",
    ["rnb"],
    vocalBase,
    "Smooth intimate tone with low-key ambience.",
  ],
  [
    "afrobeat-lead-vocal",
    "Afrobeat Lead Vocal",
    "vocal",
    ["afrobeat"],
    [
      ["High Pass / Low Pass", { hpOn: true, hpFreq: 70, lpOn: true, lpFreq: 18000 }],
      [
        "Studio Compressor",
        { compOn: true, compThreshold: -11, compRatio: 2.2, compAttack: 0.012 },
      ],
      [
        "Parametric EQ",
        {
          eqBands: [
            {
              id: "presence",
              type: "bell",
              frequency: 4200,
              gain: 1.2,
              q: 1.2,
              enabled: true,
              dynamic: false,
              thresholdDb: -24,
              rangeDb: 4,
              attack: 0.01,
              release: 0.16,
            },
          ],
        },
      ],
    ],
    "Rhythmic vocal clarity for dense percussion.",
  ],
  [
    "pop-radio-vocal",
    "Pop Radio Vocal",
    "vocal",
    ["pop"],
    [
      ["High Pass / Low Pass", { hpOn: true, hpFreq: 70 }],
      [
        "Studio Compressor",
        {
          compOn: true,
          compThreshold: -11,
          compRatio: 2.5,
          compAttack: 0.01,
          compRelease: 0.12,
          compMix: 0.75,
        },
      ],
      ["Smoothen", { smoothenOn: false, smoothenTarget: -16, smoothenRange: 5 }, true],
      ["K1-Imager", { width: 1.08 }],
    ],
    "Consistent polished vocal with conservative width.",
  ],
  [
    "acoustic-natural-vocal",
    "Acoustic and Natural Vocal",
    "vocal",
    ["acoustic"],
    [
      ["High Pass / Low Pass", { hpOn: true, hpFreq: 65 }],
      [
        "Studio Compressor",
        { compOn: true, compThreshold: -16, compRatio: 2, compAttack: 0.03, compMix: 0.55 },
      ],
    ],
    "Transparent dynamics and minimal coloration.",
  ],
  [
    "dark-muddy-vocal-repair",
    "Dark or Muddy Vocal Repair",
    "vocal",
    ["general"],
    [
      ["High Pass / Low Pass", { hpOn: true, hpFreq: 75 }],
      [
        "Parametric EQ",
        {
          eqBands: [
            {
              id: "mud",
              type: "bell",
              frequency: 280,
              gain: -1.5,
              q: 1.1,
              enabled: true,
              dynamic: true,
              thresholdDb: -24,
              rangeDb: 2,
              attack: 0.02,
              release: 0.18,
            },
          ],
        },
      ],
      ["Studio Compressor", { compOn: true, compThreshold: -11, compRatio: 2, compMix: 0.65 }],
    ],
    "Cautious low-mid repair; analysis should confirm buildup before applying the cut.",
  ],
  [
    "bright-harsh-vocal-repair",
    "Bright or Harsh Vocal Repair",
    "vocal",
    ["general"],
    [
      ["High Pass / Low Pass", { hpOn: true, hpFreq: 80, lpOn: true, lpFreq: 16000 }],
      [
        "Parametric EQ",
        {
          eqBands: [
            {
              id: "harsh",
              type: "bell",
              frequency: 4200,
              gain: -2.5,
              q: 2,
              enabled: true,
              dynamic: true,
              thresholdDb: -20,
              rangeDb: 3,
              attack: 0.005,
              release: 0.12,
            },
          ],
        },
      ],
      ["Studio Compressor", { compOn: true, compThreshold: -11, compRatio: 2, compMix: 0.65 }],
    ],
    "Targeted harshness control without removing normal vocal presence.",
  ],
  [
    "vocal-double",
    "Vocal Double",
    "vocal-support",
    ["general"],
    [
      ["High Pass / Low Pass", { hpOn: true, hpFreq: 95 }],
      [
        "K-76",
        { compOn: true, compThreshold: -12, compRatio: 2.5, compAttack: 0.008, compMix: 0.7 },
      ],
      ["K1-Imager", { width: 1.08, imagerMono: 0.12 }],
    ],
    "Controlled support layer with cautious width.",
  ],
  [
    "vocal-harmony-stack",
    "Vocal Harmony Stack",
    "vocal-support",
    ["pop", "rnb"],
    [
      ["High Pass / Low Pass", { hpOn: true, hpFreq: 115 }],
      ["Studio Compressor", { compOn: true, compThreshold: -12, compRatio: 2, compMix: 0.65 }],
    ],
    "Blended harmonies that leave room for the lead.",
  ],
  [
    "vocal-adlibs",
    "Vocal Ad-Libs",
    "vocal-support",
    ["general"],
    [
      ["High Pass / Low Pass", { hpOn: true, hpFreq: 100 }],
      [
        "K-76",
        { compOn: true, compThreshold: -12, compRatio: 3, compAttack: 0.005, compRelease: 0.09 },
      ],
    ],
    "Energetic peripheral vocal space.",
  ],
  [
    "vocal-bus-glue",
    "Vocal Bus Glue",
    "vocal-support",
    ["general"],
    [
      [
        "Studio Compressor",
        { compOn: true, compThreshold: -10, compRatio: 1.8, compAttack: 0.03, compMix: 0.55 },
      ],
      ["Four-Band Console EQ", { eqMid: -0.5, eqMidFreq: 350, eqHigh: 0.5 }],
    ],
    "Gentle shared processing for a vocal group.",
  ],
  [
    "intimate-breath-vocal",
    "Intimate and Breath Vocal",
    "vocal-support",
    ["rnb", "acoustic"],
    [
      ["High Pass / Low Pass", { hpOn: true, hpFreq: 70 }],
      [
        "Smoothen",
        { smoothenOn: false, smoothenTarget: -21, smoothenRange: 5, smoothenMix: 0.5 },
        true,
      ],
    ],
    "Detailed close vocal with restrained brightness and ambience.",
  ],
  [
    "distorted-recording-rescue",
    "Distorted or Low-Quality Recording Rescue",
    "vocal-support",
    ["general"],
    [
      ["High Pass / Low Pass", { hpOn: true, hpFreq: 80, lpOn: true, lpFreq: 14000 }],
      ["Expander", { dynMode: 2, dynThreshold: -48, dynRange: -18 }],
      ["Soft Clip", { satMode: 0, drive: 0.05, satMix: 0.2 }],
    ],
    "Conservative cleanup; clipping and noise cannot be fully repaired by this chain.",
  ],
  [
    "clean-two-track-beat",
    "Clean Two-Track Beat",
    "two-track-beat",
    ["general"],
    beatBase,
    "Minimal correction while preserving the stereo beat balance.",
  ],
  [
    "dancehall-two-track-beat",
    "Dancehall Two-Track Beat",
    "two-track-beat",
    ["dancehall"],
    [
      [
        "Four-Band Console EQ",
        { hpOn: true, hpFreq: 30, eqLow: 1, eqMid: -1, eqMidFreq: 260, eqHighMid: 0.7 },
      ],
      ["Studio Compressor", { compOn: true, compThreshold: -8, compRatio: 1.5, compMix: 0.4 }],
    ],
    "Low-end weight with room for a vocal.",
  ],
  [
    "reggae-two-track-beat",
    "Reggae Two-Track Beat",
    "two-track-beat",
    ["reggae"],
    [
      [
        "Four-Band Console EQ",
        {
          hpOn: true,
          hpFreq: 32,
          lpOn: true,
          lpFreq: 17000,
          eqLow: 0.7,
          eqMid: -0.5,
          eqHigh: -0.7,
        },
      ],
      ["Tape Machine", { satMode: 1, drive: 0.08, satMix: 0.3 }],
    ],
    "Warm, balanced instrumental foundation.",
  ],
  [
    "trap-two-track-beat",
    "Trap Two-Track Beat",
    "two-track-beat",
    ["trap"],
    [
      [
        "Four-Band Console EQ",
        { hpOn: true, hpFreq: 25, eqLow: 0.5, eqMid: -1.5, eqMidFreq: 250, eqHighMid: 0.8 },
      ],
      ["Fast Limiter", { compOn: true, compThreshold: -2, compRatio: 2.5, compMix: 0.4 }],
    ],
    "Sub control and impact with protected headroom.",
  ],
  [
    "afrobeat-two-track-beat",
    "Afrobeat Two-Track Beat",
    "two-track-beat",
    ["afrobeat"],
    [
      ["Four-Band Console EQ", { hpOn: true, hpFreq: 28, eqMid: -1, eqMidFreq: 300, eqHighMid: 1 }],
      [
        "Studio Compressor",
        { compOn: true, compThreshold: -8, compRatio: 1.5, compAttack: 0.035, compMix: 0.4 },
      ],
    ],
    "Percussion clarity without flattening groove.",
  ],
  [
    "muddy-beat-repair",
    "Muddy Beat Repair",
    "two-track-beat",
    ["general"],
    [
      ["High Pass / Low Pass", { hpOn: true, hpFreq: 28 }],
      [
        "Parametric EQ",
        {
          eqBands: [
            {
              id: "mud",
              type: "bell",
              frequency: 260,
              gain: -2.5,
              q: 1,
              enabled: true,
              dynamic: true,
              thresholdDb: -20,
              rangeDb: 3,
              attack: 0.02,
              release: 0.2,
            },
          ],
        },
      ],
      ["Studio Compressor", { compOn: true, compThreshold: -8, compRatio: 1.5, compMix: 0.4 }],
    ],
    "Low-mid repair only when analysis supports it.",
  ],
  [
    "thin-beat-enhancement",
    "Thin Beat Enhancement",
    "two-track-beat",
    ["general"],
    [
      ["Four-Band Console EQ", { eqLow: 0.5, eqHigh: 0.3 }],
      ["Harmonic Warmth", { satMode: 2, drive: 0.06, satMix: 0.15 }],
      ["Studio Compressor", { compOn: true, compThreshold: -8, compRatio: 1.5, compMix: 0.4 }],
    ],
    "Cautious weight and density enhancement.",
  ],
  [
    "punchy-beat",
    "Punchy Beat",
    "two-track-beat",
    ["general"],
    [
      ["High Pass / Low Pass", { hpOn: true, hpFreq: 28 }],
      [
        "K-76",
        {
          compOn: true,
          compThreshold: -10,
          compRatio: 2,
          compAttack: 0.025,
          compRelease: 0.08,
          compMix: 0.55,
        },
      ],
      ["Soft Clip", { satMode: 1, drive: 0.08, satMix: 0.2 }],
    ],
    "Transient impact without unnecessary clipping.",
  ],
];

const fullMixSpecs: Spec[] = [
  [
    "dancehall-full-mix",
    "Dancehall Full Mix",
    "full-mix",
    ["dancehall"],
    vocalBase,
    "Forward vocal, controlled beat, and restrained master glue.",
  ],
  [
    "reggae-full-mix",
    "Reggae Full Mix",
    "full-mix",
    ["reggae"],
    vocalBase,
    "Natural vocal and balanced instrumental ambience.",
  ],
  [
    "trap-full-mix",
    "Trap Full Mix",
    "full-mix",
    ["trap"],
    [
      ["High Pass / Low Pass", { hpOn: true, hpFreq: 75 }],
      ["K-76", { compOn: true, compThreshold: -12, compRatio: 3, compMix: 0.8 }],
    ],
    "Controlled vocal effects and low-frequency headroom.",
  ],
  [
    "afrobeat-full-mix",
    "Afrobeat Full Mix",
    "full-mix",
    ["afrobeat"],
    [...vocalBase, ["Tape Machine", { satMode: 1, drive: 0.04, satMix: 0.15 }]],
    "Clear vocal and rhythmic stereo balance.",
  ],
  [
    "modern-pop-full-mix",
    "Modern Pop Full Mix",
    "full-mix",
    ["pop"],
    [
      ["High Pass / Low Pass", { hpOn: true, hpFreq: 70 }],
      ["Studio Compressor", { compOn: true, compThreshold: -11, compRatio: 2.5, compMix: 0.75 }],
    ],
    "Polished vocal, restrained effects, and conservative control.",
  ],
  [
    "minimal-processing-full-mix",
    "Minimal Processing Full Mix",
    "full-mix",
    ["general"],
    [["High Pass / Low Pass", { hpOn: true, hpFreq: 35 }]],
    "Transparent starting point using only essential filtering.",
  ],
];

const masteringSpecs: Spec[] = [
  [
    "clean-streaming-master",
    "Clean Streaming Master",
    "mastering",
    ["general"],
    masterBase,
    "Transparent peaks and delivery-ready headroom.",
  ],
  [
    "punchy-modern-master",
    "Punchy Modern Master",
    "mastering",
    ["pop", "hip-hop"],
    [
      ["Four-Band Console EQ", { eqLow: 0.4, eqHighMid: 0.3 }],
      [
        "Fast Limiter",
        { compOn: true, compThreshold: -1.5, compRatio: 2.5, compAttack: 0.003, compRelease: 0.1 },
      ],
    ],
    "Energetic control while preserving useful transients.",
  ],
  [
    "warm-smooth-master",
    "Warm and Smooth Master",
    "mastering",
    ["general"],
    [
      ["Tape Machine", { satMode: 1, drive: 0.04, satMix: 0.1 }],
      ["Four-Band Console EQ", { eqHigh: -0.2, eqMid: -0.2 }],
      ["Fast Limiter", { compOn: true, compThreshold: -1.5, compRatio: 3, compRelease: 0.12 }],
    ],
    "Gentle warmth and restrained dynamics.",
  ],
  [
    "loudness-conscious-master",
    "Loudness-Conscious Master",
    "mastering",
    ["general"],
    [["Fast Limiter", { compOn: true, compThreshold: -1.5, compRatio: 3.5, compMakeup: 0 }]],
    "Measured loudness work with warnings when dynamics collapse.",
  ],
  [
    "reggae-dancehall-master",
    "Reggae and Dancehall Master",
    "mastering",
    ["reggae", "dancehall"],
    [
      ["Four-Band Console EQ", { eqLow: 0.3, eqMid: -0.3, eqMidFreq: 280, eqHigh: -0.2 }],
      ["Tape Machine", { satMode: 1, drive: 0.03, satMix: 0.1 }],
      ["Fast Limiter", { compOn: true, compThreshold: -1.5, compRatio: 3, compRelease: 0.12 }],
    ],
    "Controlled bass and vocal presence with genre-aware dynamics.",
  ],
  [
    "transparent-master",
    "Transparent Master",
    "mastering",
    ["general"],
    [["Fast Limiter", { compOn: true, compThreshold: -1.5, compRatio: 2.5, compMix: 0.4 }]],
    "Minimal final-stage control for an already balanced mix.",
  ],
];

const fullMixSends: Record<
  string,
  Array<{ targetRole: "reverb-bus" | "delay-bus"; levelDb: number }>
> = {
  "dancehall-full-mix": [
    { targetRole: "reverb-bus", levelDb: -17 },
    { targetRole: "delay-bus", levelDb: -20 },
  ],
  "reggae-full-mix": [
    { targetRole: "reverb-bus", levelDb: -14 },
    { targetRole: "delay-bus", levelDb: -21 },
  ],
  "trap-full-mix": [
    { targetRole: "reverb-bus", levelDb: -22 },
    { targetRole: "delay-bus", levelDb: -16 },
  ],
  "afrobeat-full-mix": [
    { targetRole: "reverb-bus", levelDb: -18 },
    { targetRole: "delay-bus", levelDb: -18 },
  ],
  "modern-pop-full-mix": [
    { targetRole: "reverb-bus", levelDb: -18 },
    { targetRole: "delay-bus", levelDb: -22 },
  ],
  "minimal-processing-full-mix": [],
};

const delayBusByTemplate: Record<string, PluginSpec[]> = {
  "dancehall-full-mix": [
    [
      "Analog Delay",
      { delayType: "delay", delayTime: 0.28, delayFeedback: 0.18, delayMix: 0.85, delayTone: 7000 },
    ],
  ],
  "reggae-full-mix": [
    [
      "Tape Echo",
      { delayType: "tape", delayTime: 0.38, delayFeedback: 0.2, delayMix: 0.8, delayTone: 5000 },
    ],
  ],
  "trap-full-mix": [
    [
      "Ping Pong Delay",
      {
        delayType: "pingpong",
        delayTime: 0.28,
        delayFeedback: 0.2,
        delayMix: 0.85,
        delayTone: 7500,
      },
    ],
  ],
  "afrobeat-full-mix": [
    [
      "Ping Pong Delay",
      {
        delayType: "pingpong",
        delayTime: 0.25,
        delayFeedback: 0.18,
        delayMix: 0.8,
        delayTone: 7500,
      },
    ],
  ],
  "modern-pop-full-mix": [
    [
      "Analog Delay",
      { delayType: "delay", delayTime: 0.25, delayFeedback: 0.16, delayMix: 0.8, delayTone: 8000 },
    ],
  ],
};

function createTemplate([id, name, category, genres, plugins, description]: Spec): MixTemplate {
  const role =
    category === "mastering"
      ? "master"
      : id === "vocal-bus-glue"
        ? "vocal-bus"
        : category === "two-track-beat"
          ? "beat"
          : "lead-vocal";
  const templateTracks = [
    track(role, name, plugins, category === "full-mix" ? "vocal-bus" : "master"),
    ...(category === "full-mix"
      ? [
          track("vocal-double", "Vocal Double", vocalDoubleBase, "vocal-bus"),
          track("harmony", "Harmony", harmonyBase, "vocal-bus"),
          track("adlib", "Ad-Libs", adlibBase, "vocal-bus"),
          track("vocal-bus", "Vocal Bus", vocalBusBase, "master", fullMixSends[id] ?? []),
          track("reverb-bus", "Vocal Reverb", reverbBusBase, "master"),
          track(
            "delay-bus",
            "Vocal Delay",
            delayBusByTemplate[id] ?? delayBusBase,
            "master",
            undefined,
            id === "reggae-full-mix" ? "dotted-eighth" : "eighth",
          ),
          track("beat", "Beat", beatBase, "master"),
          track("master", "Master", masterBase, "master"),
        ]
      : []),
  ];
  return {
    id,
    name,
    category,
    description,
    genres,
    sourceRequirements:
      category === "mastering"
        ? ["A completed stereo mix"]
        : category === "full-mix"
          ? ["A vocal and a stereo two-track beat"]
          : role === "beat"
            ? ["A stereo instrumental file"]
            : role === "vocal-bus"
              ? ["A bus containing vocal tracks"]
              : ["A vocal recording"],
    intendedResults: [description],
    tracks: templateTracks,
    aiInstructions: [
      "Use only registered processors and parameters.",
      "Re-analyze before corrective EQ or loudness changes.",
      "Keep adjustments reversible and preserve headroom.",
      "Use the template as a starting point: do not stack compression without measured gain reduction.",
      "Prefer broad, low-gain EQ moves; use narrow cuts only when analysis confirms a resonance.",
      "Keep stereo widening out of the center low end and preserve mono compatibility.",
    ],
    processingConstraints: {
      maxIterations: 3,
      preserveHeadroomDb: 1,
      requiresConfirmationForReplace: true,
      maxCorrectiveEqCutDb: 3,
      maxCorrectiveEqQ: 2.5,
      maxStereoWidth: 1.15,
      targetGainReductionDb:
        category === "mastering" ? { min: 0, max: 2 } : role.endsWith("bus") ? { min: 0, max: 3 } : { min: 1, max: 5 },
      masteringCeilingDb: -1,
    },
    version: 2,
  };
}

export const MIX_TEMPLATES = [...specs, ...fullMixSpecs, ...masteringSpecs].map(createTemplate);

export function validateTemplate(template: MixTemplate): string[] {
  const errors: string[] = [];
  if (!template.id || template.version < 1 || !template.tracks.length)
    errors.push("Template metadata is incomplete.");
  const roles = new Set<TemplateRole>();
  for (const templateTrack of template.tracks) {
    if (roles.has(templateTrack.role))
      errors.push(`${template.id}: duplicate track role ${templateTrack.role}.`);
    roles.add(templateTrack.role);
    if (templateTrack.plugins.length > 10)
      errors.push(`${template.id}: ${templateTrack.name} exceeds ten insert slots.`);
    if (
      templateTrack.outputBus !== "master" &&
      !template.tracks.some((candidate) => candidate.role === templateTrack.outputBus)
    ) {
      errors.push(`${template.id}: ${templateTrack.name} routes to a missing bus role.`);
    }
    for (const send of templateTrack.sends ?? []) {
      if (!template.tracks.some((candidate) => candidate.role === send.targetRole))
        errors.push(`${template.id}: ${templateTrack.name} sends to a missing bus role.`);
      if (!Number.isFinite(send.levelDb) || send.levelDb < -60 || send.levelDb > 6)
        errors.push(`${template.id}: ${templateTrack.name} has an invalid send level.`);
    }
    const families = new Set<string>();
    for (const templatePlugin of templateTrack.plugins) {
      const family = getPluginFamily(templatePlugin.pluginType);
      if (!family || !pluginFamilies.has(family))
        errors.push(`${template.id}: unknown plugin ${templatePlugin.pluginType}.`);
      if (family && families.has(family))
        errors.push(`${template.id}: duplicate processor family ${family}.`);
      if (family) families.add(family);
      for (const [key, value] of Object.entries(templatePlugin.parameters)) {
        if (!Object.hasOwn(defaultFx(), key))
          errors.push(`${template.id}: unknown parameter ${key}.`);
        if (typeof value === "number" && !Number.isFinite(value))
          errors.push(`${template.id}: invalid value for ${key}.`);
      }
    }
  }
  if (template.category === "full-mix") {
    for (const role of [
      "lead-vocal",
      "vocal-bus",
      "reverb-bus",
      "delay-bus",
      "beat",
      "master",
    ] as const) {
      if (!roles.has(role)) errors.push(`${template.id}: missing required ${role} track.`);
    }
    if (!template.tracks.some((track) => track.role === "delay-bus" && track.tempoSync))
      errors.push(`${template.id}: the delay bus needs a tempo-synced division.`);
  }
  return errors;
}

export function validateTemplateLibrary(templates = MIX_TEMPLATES) {
  const ids = new Set<string>();
  const errors = templates.flatMap((template) => {
    const ownErrors = validateTemplate(template);
    if (ids.has(template.id)) ownErrors.push(`Duplicate template id ${template.id}.`);
    ids.add(template.id);
    return ownErrors;
  });
  if (errors.length) throw new Error(errors.join(" "));
  return true;
}

export function applyTemplateToTrack(
  trackState: TrackState,
  template: MixTemplate,
  role?: TemplateRole,
): TrackState {
  return applyTemplatePlan(trackState, compileTemplateTrack(template, role));
}

validateTemplateLibrary();
