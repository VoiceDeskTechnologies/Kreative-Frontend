import type { Fx } from "./engine";

export const COLORS = [
  { bg: "bg-t1", fill: "fill-t1" },
  { bg: "bg-t2", fill: "fill-t2" },
  { bg: "bg-t3", fill: "fill-t3" },
  { bg: "bg-t4", fill: "fill-t4" },
  { bg: "bg-t5", fill: "fill-t5" },
  { bg: "bg-t6", fill: "fill-t6" },
  { bg: "bg-t7", fill: "fill-t7" },
  { bg: "bg-t8", fill: "fill-t8" },
];

// "focus" = control already lives in the track's effects panel
export type PluginAction = Partial<Fx> | "focus" | "phase";
export const PLUGINS: Record<string, [string, PluginAction][]> = {
  Dynamics: [
    [
      "K-2A",
      {
        compOn: true,
        compThreshold: -20,
        compRatio: 3,
        compAttack: 0.035,
        compRelease: 0.22,
        compKnee: 12,
        compMakeup: 1,
        compMix: 1,
      },
    ],
    [
      "K-76",
      {
        compOn: true,
        compThreshold: -18,
        compRatio: 4,
        compAttack: 0.006,
        compRelease: 0.09,
        compKnee: 2,
        compMakeup: 1,
        compMix: 1,
      },
    ],
    [
      "Studio Compressor",
      {
        compOn: true,
        compThreshold: -18,
        compRatio: 3.5,
        compAttack: 0.018,
        compRelease: 0.16,
        compKnee: 8,
        compMakeup: 1,
        compMix: 0.85,
      },
    ],
    [
      "Fast Limiter",
      {
        compOn: true,
        compThreshold: -6,
        compRatio: 12,
        compAttack: 0.003,
        compRelease: 0.08,
        compKnee: 1,
        compMakeup: 2,
        compMix: 1,
      },
    ],
    [
      "Gate",
      {
        dynMode: 1,
        dynThreshold: -42,
        dynAttack: 0.004,
        dynRelease: 0.16,
        dynRange: -72,
        dynHysteresis: 5,
      },
    ],
    [
      "Expander",
      {
        dynMode: 2,
        dynThreshold: -48,
        dynAttack: 0.012,
        dynRelease: 0.24,
        dynRange: -30,
        dynHysteresis: 2,
      },
    ],
  ],
  EQ: [
    ["Parametric EQ", "focus"],
    ["Four-Band Console EQ", "focus"],
    ["High Pass / Low Pass", { hpOn: true, hpFreq: 80, lpOn: true, lpFreq: 16000 }],
  ],
  Amplifiers: [
    ["12AX7 Class A", { ampModel: 1, ampDrive: 0.24, ampBias: 0.06, ampSag: 0.18, cabOn: true }],
    ["Tweed Combo", { ampModel: 2, ampDrive: 0.48, ampBias: 0.12, ampSag: 0.62, cabOn: true }],
    [
      "British Stack",
      { ampModel: 3, ampDrive: 0.58, ampBias: -0.04, ampSag: 0.3, ampPresence: 0.64, cabOn: true },
    ],
    [
      "Modern High Gain",
      { ampModel: 4, ampDrive: 0.72, ampBias: 0.02, ampSag: 0.12, ampPresence: 0.35, cabOn: true },
    ],
  ],
  Modulation: [
    [
      "Studio Chorus",
      {
        modType: "chorus",
        modWaveform: "sine",
        modRate: 0.42,
        modDepth: 0.38,
        modMix: 0.28,
        modFeedback: 0.12,
        modPan: 0,
        modTone: 10000,
      },
    ],
    [
      "Jet Flanger",
      {
        modType: "flanger",
        modWaveform: "sawtooth",
        modRate: 0.32,
        modDepth: 0.72,
        modMix: 0.38,
        modFeedback: 0.68,
        modPan: 0.2,
        modTone: 7500,
      },
    ],
    [
      "Four-Stage Phaser",
      {
        modType: "phaser",
        modWaveform: "triangle",
        modRate: 0.22,
        modDepth: 0.58,
        modMix: 0.42,
        modFeedback: 0.1,
        modPan: -0.15,
        modTone: 11500,
      },
    ],
    [
      "Optical Tremolo",
      {
        modType: "tremolo",
        modWaveform: "sine",
        modRate: 4.8,
        modDepth: 0.36,
        modMix: 0.5,
        modFeedback: 0,
        modPan: 0,
        modTone: 16000,
      },
    ],
  ],
  "Reverb & Delay": [
    ["Room Reverb", { reverb: 0.24, reverbSize: 0.32, reverbPreDelay: 0.018, reverbTone: 10000 }],
    [
      "Analog Delay",
      { delayType: "delay", delayTime: 0.28, delayFeedback: 0.34, delayMix: 0.2, delayTone: 12000 },
    ],
    [
      "Tape Echo",
      { delayType: "tape", delayTime: 0.42, delayFeedback: 0.46, delayMix: 0.26, delayTone: 8000 },
    ],
    [
      "Ping Pong Delay",
      {
        delayType: "pingpong",
        delayTime: 0.375,
        delayFeedback: 0.52,
        delayMix: 0.3,
        delayTone: 14000,
      },
    ],
  ],
  Saturation: [
    ["Soft Clip", { satMode: 1, drive: 0.18, satMix: 0.6, satBias: 0, satOutput: -1 }],
    ["Tape Machine", { satMode: 2, drive: 0.26, satMix: 0.72, satBias: 0.04, satOutput: -1.5 }],
    ["Tube Stage", { satMode: 3, drive: 0.22, satMix: 0.65, satBias: 0.08, satOutput: -1 }],
    ["Harmonic Warmth", { satMode: 4, drive: 0.16, satMix: 0.48, satBias: -0.03, satOutput: -0.5 }],
  ],
  Utility: [["Stereo & Phase Utility", "focus"]],
  Imaging: [
    [
      "K1-Imager",
      {
        width: 1.35,
        imagerBalance: 0,
        imagerRotation: 0,
        imagerMono: 0,
      },
    ],
  ],
  "Vocal Processing": [
    [
      "KREATIVE De-Esser",
      {
        deEssOn: true,
        deEssFrequency: 6500,
        deEssThreshold: -28,
        deEssRange: 6,
        deEssAttack: 0.002,
        deEssRelease: 0.08,
        deEssMix: 1,
      },
    ],
    [
      "Smoothen",
      {
        smoothenOn: true,
        smoothenTarget: -18,
        smoothenRange: 9,
        smoothenFloor: -54,
        smoothenSpeed: 0.25,
        smoothenMix: 1,
      },
    ],
  ],
  "Pitch Correction": [
    [
      "KREATIVE Pitch",
      {
        pitchOn: true,
        pitchKey: 0,
        pitchScale: 1,
        pitchSpeed: 0.08,
        pitchHumanize: 0.25,
        pitchFloor: -54,
        pitchMix: 1,
        pitchReference: 440,
        pitchTranspose: 0,
        pitchRangeLow: 40,
        pitchRangeHigh: 88,
      },
    ],
  ],
};

export function getPluginEntry(name: string) {
  for (const [category, plugins] of Object.entries(PLUGINS)) {
    const entry = plugins.find(([plugin]) => plugin === name);
    if (entry) return { category, name: entry[0], action: entry[1] };
  }
  return undefined;
}

export function getPluginFamily(name: string) {
  if (["K-2A", "K-76", "Studio Compressor", "Fast Limiter"].includes(name)) return "compressor";
  if (name === "Gate" || name === "Expander") return "gate";
  if (name === "Parametric EQ") return "parametricEq";
  if (name === "Four-Band Console EQ" || name === "High Pass / Low Pass") return "consoleEq";
  if (["12AX7 Class A", "Tweed Combo", "British Stack", "Modern High Gain"].includes(name))
    return "amp";
  if (["Studio Chorus", "Jet Flanger", "Four-Stage Phaser", "Optical Tremolo"].includes(name))
    return "modulation";
  if (name === "Room Reverb") return "reverb";
  if (["Analog Delay", "Tape Echo", "Ping Pong Delay"].includes(name)) return "delay";
  if (["Soft Clip", "Tape Machine", "Tube Stage", "Harmonic Warmth"].includes(name))
    return "saturation";
  if (name === "Stereo & Phase Utility") return "utility";
  if (name === "K1-Imager") return "imager";
  if (name === "Smoothen") return "smoothen";
  if (name === "KREATIVE Pitch") return "pitchCorrection";
  if (name === "KREATIVE De-Esser") return "deEsser";
  return undefined;
}

const PLUGIN_DEFAULTS: Record<string, Partial<Fx>> = {
  compressor: {
    compOn: false,
    compThreshold: -18,
    compRatio: 4,
    compAttack: 0.01,
    compRelease: 0.18,
    compKnee: 6,
    compMakeup: 0,
    compMix: 1,
  },
  gate: {
    dynMode: 0,
    dynThreshold: -45,
    dynAttack: 0.01,
    dynRelease: 0.12,
    dynRange: -60,
    dynHysteresis: 4,
  },
  parametricEq: {
    eqBands: [
      {
        id: "param-low",
        type: "lowShelf",
        frequency: 100,
        gain: 0,
        q: 0.707,
        enabled: true,
        dynamic: false,
        thresholdDb: -24,
        rangeDb: 6,
        attack: 0.01,
        release: 0.16,
      },
      {
        id: "param-mid",
        type: "bell",
        frequency: 1200,
        gain: 0,
        q: 1,
        enabled: true,
        dynamic: false,
        thresholdDb: -24,
        rangeDb: 6,
        attack: 0.01,
        release: 0.16,
      },
      {
        id: "param-high",
        type: "highShelf",
        frequency: 8000,
        gain: 0,
        q: 0.707,
        enabled: true,
        dynamic: false,
        thresholdDb: -24,
        rangeDb: 6,
        attack: 0.01,
        release: 0.16,
      },
    ],
  },
  consoleEq: {
    eqLow: 0,
    eqMid: 0,
    eqMidFreq: 1200,
    eqMidQ: 0.9,
    eqHighMid: 0,
    eqHighMidFreq: 3200,
    eqHighMidQ: 0.9,
    eqHigh: 0,
    eqBands: [],
    hpOn: false,
    hpFreq: 80,
    lpOn: false,
    lpFreq: 12000,
  },
  amp: {
    ampModel: 0,
    ampDrive: 0.35,
    ampBias: 0,
    ampSag: 0.25,
    ampPresence: 0.45,
    ampOutput: 0,
    ampBass: 0,
    ampMid: 0,
    ampTreble: 0,
    cabOn: true,
  },
  modulation: {
    modType: "off",
    modWaveform: "sine",
    modRate: 0.8,
    modDepth: 0.5,
    modMix: 0.5,
    modFeedback: 0.12,
    modPan: 0,
    modTone: 12000,
  },
  reverb: { reverb: 0, reverbSize: 0.5, reverbPreDelay: 0.025, reverbTone: 12000 },
  delay: {
    delayType: "off",
    delayTime: 0.35,
    delayFeedback: 0.35,
    delayMix: 0.25,
    delayTone: 12000,
  },
  saturation: { satMode: 0, drive: 0.3, satMix: 1, satBias: 0, satOutput: 0 },
  utility: { width: 1, phase: false },
  imager: {
    width: 1.35,
    imagerBalance: 0,
    imagerRotation: 0,
    imagerMono: 0,
  },
  smoothen: {
    smoothenOn: false,
    smoothenTarget: -18,
    smoothenRange: 9,
    smoothenFloor: -54,
    smoothenSpeed: 0.25,
    smoothenMix: 1,
  },
  pitchCorrection: {
    pitchOn: false,
    pitchKey: 0,
    pitchScale: 1,
    pitchSpeed: 0.08,
    pitchHumanize: 0.25,
    pitchFloor: -54,
    pitchMix: 1,
    pitchReference: 440,
    pitchTranspose: 0,
    pitchRangeLow: 40,
    pitchRangeHigh: 88,
  },
  deEsser: {
    deEssOn: false,
    deEssFrequency: 6500,
    deEssThreshold: -28,
    deEssRange: 6,
    deEssAttack: 0.002,
    deEssRelease: 0.08,
    deEssMix: 1,
  },
};

export function getPluginSettings(name: string): Partial<Fx> | undefined {
  const entry = getPluginEntry(name);
  const family = getPluginFamily(name);
  if (!entry || !family) return undefined;
  const settings = { ...PLUGIN_DEFAULTS[family] };
  if (typeof entry.action === "object") Object.assign(settings, entry.action);
  if (entry.action === "phase") settings.phase = true;
  return settings;
}

export const PRESETS = [
  {
    category: "Amplifiers",
    name: "American Glass",
    description: "Open Class A edge, restrained low end, clean transient detail.",
    fx: {
      ampModel: 1,
      ampDrive: 0.2,
      ampBias: 0.03,
      ampSag: 0.12,
      ampPresence: 0.58,
      ampBass: 1,
      ampMid: -1,
      ampTreble: 1.5,
      ampOutput: -1,
      cabOn: true,
    },
  },
  {
    category: "Amplifiers",
    name: "Tweed Breakup",
    description: "Soft asymmetric clipping with audible supply sag and warm mids.",
    fx: {
      ampModel: 2,
      ampDrive: 0.46,
      ampBias: 0.14,
      ampSag: 0.66,
      ampPresence: 0.32,
      ampBass: 1.5,
      ampMid: 2,
      ampTreble: -1.5,
      ampOutput: -3,
      cabOn: true,
    },
  },
  {
    category: "Amplifiers",
    name: "British Stack",
    description: "Dense harmonics, forward upper mids, tight cabinet response.",
    fx: {
      ampModel: 3,
      ampDrive: 0.55,
      ampBias: -0.04,
      ampSag: 0.28,
      ampPresence: 0.68,
      ampBass: -1,
      ampMid: 2.5,
      ampTreble: 1,
      ampOutput: -4,
      cabOn: true,
    },
  },
  {
    category: "Amplifiers",
    name: "Modern Tight",
    description: "Firm low end, fast response, controlled high-gain saturation.",
    fx: {
      ampModel: 4,
      ampDrive: 0.68,
      ampBias: 0.02,
      ampSag: 0.1,
      ampPresence: 0.4,
      ampBass: -2,
      ampMid: -1,
      ampTreble: 1.5,
      ampOutput: -5,
      cabOn: true,
    },
  },
  {
    category: "Amplifiers",
    name: "Tube Vocal Warmth",
    description: "Gentle tube color, centered mids and a little more air.",
    fx: {
      ampModel: 1,
      ampDrive: 0.12,
      ampBias: 0.08,
      ampSag: 0.22,
      ampPresence: 0.52,
      ampBass: -1,
      ampMid: 1.5,
      ampTreble: 0.8,
      ampOutput: 0,
      cabOn: false,
    },
  },
  {
    category: "Dynamics",
    name: "Vocal Leveler",
    description: "Smooth control with a soft knee and measured makeup gain.",
    fx: {
      compOn: true,
      compThreshold: -22,
      compRatio: 2.6,
      compAttack: 0.012,
      compRelease: 0.22,
      compKnee: 12,
      compMakeup: 2,
      compMix: 0.88,
    },
  },
  {
    category: "Dynamics",
    name: "Punch Bus",
    description: "Slower attack, firm ratio and parallel blend to preserve transients.",
    fx: {
      compOn: true,
      compThreshold: -16,
      compRatio: 5,
      compAttack: 0.035,
      compRelease: 0.11,
      compKnee: 3,
      compMakeup: 1,
      compMix: 0.62,
    },
  },
  {
    category: "Saturation",
    name: "Tape Glue",
    description: "Rounded peaks with a subtle tape-style harmonic profile.",
    fx: {
      satMode: 2,
      drive: 0.22,
      eqLow: 0.5,
      eqMid: -0.5,
      eqHigh: -1,
      compOn: true,
      compThreshold: -24,
      compRatio: 2,
      compAttack: 0.02,
      compRelease: 0.2,
      compKnee: 10,
      compMix: 0.72,
    },
  },
] satisfies { category: string; name: string; description: string; fx: Partial<Fx> }[];
