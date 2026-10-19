import { getPluginFamily, getPluginSettings } from "./data";
import type { Fx, PitchScale } from "./engine";

export type UserPluginPreset = {
  id: string;
  name: string;
  settings: Partial<Fx>;
};

export type FactoryPluginPreset = {
  id: string;
  name: string;
  description: string;
  category: "Vocals" | "Drums" | "Instruments" | "Mix & Bus";
  settings: Partial<Fx>;
};

const PRESET_CONTEXTS = [
  {
    category: "Vocals",
    name: "Vocal Corrector · Clean @ 80 Hz",
    description:
      "A vocal-cleanup start: remove sub-rumble, reduce boxiness, then add modest presence.",
    role: "vocalClean",
  },
  {
    category: "Vocals",
    name: "Vocal · Dynamic De-Box",
    description:
      "A low-mid cut that deepens only when boxy energy builds, with the low end rolled off.",
    role: "vocalDeBox",
  },
  {
    category: "Vocals",
    name: "Vocal · Presence & Air",
    description: "A gentle presence lift and air shelf, with restrained low-mid cleanup.",
    role: "vocalAir",
  },
  {
    category: "Drums",
    name: "Kick · Sub & Punch",
    description:
      "Keep useful low punch, remove subsonic buildup, and dynamically control boxiness.",
    role: "kick",
  },
  {
    category: "Drums",
    name: "Snare · Body & Crack",
    description: "Preserve body, ease the cardboard range, and add a controlled crack.",
    role: "snare",
  },
  {
    category: "Drums",
    name: "Overheads · Cymbal Tame",
    description: "Clean excess low end and dynamically soften harsh cymbal energy.",
    role: "overheads",
  },
  {
    category: "Instruments",
    name: "Bass · Fundamental & Definition",
    description: "Protect the fundamental, clear low-mid congestion, and add note definition.",
    role: "bass",
  },
  {
    category: "Instruments",
    name: "Electric Guitar · Midrange Clarity",
    description: "Remove low rumble and reduce resonant low mids while keeping the guitar forward.",
    role: "guitar",
  },
  {
    category: "Instruments",
    name: "Keys · Warmth & Space",
    description: "Keep the keyboard warm while reducing crowded low mids and opening the top.",
    role: "keys",
  },
  {
    category: "Instruments",
    name: "Acoustic · Body & Air",
    description: "Reduce handling rumble and boom without stripping the instrument's natural body.",
    role: "acoustic",
  },
  {
    category: "Mix & Bus",
    name: "Bus · Gentle Glue",
    description:
      "Light parallel control designed to retain transients and leave mastering headroom.",
    role: "bus",
  },
  {
    category: "Mix & Bus",
    name: "Source · Neutral Polish",
    description:
      "A conservative, mostly transparent starting point for an already balanced source.",
    role: "neutral",
  },
] as const;

type PresetRole = (typeof PRESET_CONTEXTS)[number]["role"];

const PRESET_ROLES_BY_FAMILY: Record<string, readonly PresetRole[]> = {
  compressor: [
    "vocalClean",
    "vocalDeBox",
    "vocalAir",
    "kick",
    "snare",
    "overheads",
    "bass",
    "guitar",
    "keys",
    "bus",
  ],
  gate: ["vocalClean", "vocalDeBox", "vocalAir", "kick", "snare", "overheads", "bass", "guitar", "keys", "acoustic"],
  parametricEq: PRESET_CONTEXTS.map((preset) => preset.role),
  consoleEq: PRESET_CONTEXTS.map((preset) => preset.role),
  amp: ["vocalClean", "vocalAir", "kick", "snare", "bass", "guitar", "keys", "acoustic", "bus", "neutral"],
  modulation: ["vocalAir", "overheads", "bass", "guitar", "keys", "acoustic", "bus", "neutral", "vocalClean", "snare"],
  reverb: ["vocalAir", "snare", "overheads", "guitar", "keys", "acoustic", "bus", "neutral", "vocalClean", "bass"],
  delay: ["vocalAir", "snare", "overheads", "guitar", "keys", "acoustic", "bus", "neutral", "vocalClean", "bass"],
  saturation: ["vocalClean", "vocalAir", "kick", "snare", "bass", "guitar", "keys", "acoustic", "bus", "neutral"],
  utility: ["vocalClean", "vocalAir", "kick", "snare", "overheads", "bass", "guitar", "keys", "bus", "neutral"],
  imager: ["vocalAir", "overheads", "guitar", "keys", "acoustic", "bus", "neutral", "vocalClean", "bass", "snare"],
  smoothen: ["vocalClean", "vocalDeBox", "vocalAir", "overheads", "guitar", "keys", "acoustic", "bus", "neutral", "bass"],
  pitchCorrection: ["vocalClean", "vocalDeBox", "vocalAir", "guitar", "keys", "acoustic", "bus", "neutral", "bass", "snare"],
  deEsser: ["vocalClean", "vocalDeBox", "vocalAir", "overheads", "guitar", "keys", "acoustic", "bus", "neutral", "bass"],
};

const ROLE_LABELS: Record<PresetRole, string> = {
  vocalClean: "Vocal Clean",
  vocalDeBox: "Vocal De-Box",
  vocalAir: "Vocal Presence",
  kick: "Kick Punch",
  snare: "Snare Crack",
  overheads: "Overhead Control",
  bass: "Bass Definition",
  guitar: "Guitar Clarity",
  keys: "Keys Warmth",
  acoustic: "Acoustic Body",
  bus: "Bus Glue",
  neutral: "Neutral Polish",
};

const FAMILY_LABELS: Record<string, string> = {
  compressor: "Dynamics",
  gate: "Gate",
  parametricEq: "Sculpt",
  consoleEq: "Console Tone",
  amp: "Amp Tone",
  modulation: "Motion",
  reverb: "Space",
  delay: "Echo",
  saturation: "Color",
  utility: "Utility",
  imager: "Width",
  smoothen: "Vocal Ride",
  pitchCorrection: "Pitch",
  deEsser: "Sibilance",
};

function getPluginPresetCopy(pluginName: string, family: string, role: PresetRole, description: string) {
  const familyLabel = FAMILY_LABELS[family] ?? "Processing";
  return {
    name: `${pluginName} · ${familyLabel} · ${ROLE_LABELS[role]}`,
    description: `${description} Tuned specifically for the ${pluginName} processor.`,
  };
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function eqBand(
  id: string,
  type: "bell" | "lowShelf" | "highShelf" | "lowPass" | "highPass" | "notch",
  frequency: number,
  gain = 0,
  q = 1,
  dynamic = false,
  thresholdDb = -25,
  rangeDb = 3,
) {
  return {
    id,
    type,
    frequency,
    gain,
    q,
    enabled: true,
    dynamic,
    thresholdDb,
    rangeDb,
    attack: 0.012,
    release: 0.18,
  };
}

function vocalAndInstrumentBands(role: (typeof PRESET_CONTEXTS)[number]["role"]) {
  const lowCut = (frequency: number) => eqBand("preset-hpf", "highPass", frequency, 0, 0.707);
  const bell = (
    id: string,
    frequency: number,
    gain: number,
    q = 1,
    dynamic = false,
    thresholdDb = -25,
    rangeDb = 3,
  ) => eqBand(id, "bell", frequency, gain, q, dynamic, thresholdDb, rangeDb);
  const shelf = (id: string, frequency: number, gain: number) =>
    eqBand(id, "highShelf", frequency, gain, 0.707);
  switch (role) {
    case "vocalClean":
      return [
        lowCut(80),
        bell("preset-box", 280, -2.5, 1),
        bell("preset-presence", 3200, 1.2, 0.9),
        shelf("preset-air", 11000, 0.7),
      ];
    case "vocalDeBox":
      return [
        lowCut(80),
        bell("preset-box", 320, -1, 1.15, true, -28, 4),
        bell("preset-nasal", 900, -1, 1.1),
        shelf("preset-air", 10000, 0.4),
      ];
    case "vocalAir":
      return [
        lowCut(80),
        bell("preset-box", 250, -1.3, 1),
        bell("preset-presence", 3600, 1.5, 0.85),
        shelf("preset-air", 12000, 1),
      ];
    case "kick":
      return [
        lowCut(28),
        eqBand("preset-low", "lowShelf", 70, 1.8, 0.707),
        bell("preset-box", 260, -1, 1, true, -23, 3),
        bell("preset-click", 3200, 0.8, 1.1),
      ];
    case "snare":
      return [
        lowCut(90),
        bell("preset-body", 180, 1.2, 0.9),
        bell("preset-cardboard", 620, -1.8, 1.1),
        bell("preset-crack", 4200, 1.2, 0.9),
        shelf("preset-air", 9500, 0.4),
      ];
    case "overheads":
      return [
        lowCut(240),
        bell("preset-harsh", 6800, -0.5, 1.4, true, -27, 4),
        shelf("preset-air", 12000, 0.7),
      ];
    case "bass":
      return [
        lowCut(35),
        eqBand("preset-fundamental", "lowShelf", 80, 1.2, 0.707),
        bell("preset-mud", 250, -2, 1, true, -25, 3),
        bell("preset-note", 900, 0.8, 0.9),
      ];
    case "guitar":
      return [
        lowCut(90),
        bell("preset-boom", 240, -1.8, 1.1, true, -27, 3),
        bell("preset-bite", 2200, 1, 0.9),
        shelf("preset-air", 9000, 0.3),
      ];
    case "keys":
      return [
        lowCut(70),
        bell("preset-low-mid", 360, -1.4, 1),
        bell("preset-clarity", 2800, 0.8, 0.9),
        shelf("preset-air", 10500, 0.5),
      ];
    case "acoustic":
      return [
        lowCut(80),
        bell("preset-boom", 220, -1.8, 1, true, -26, 3),
        bell("preset-presence", 3000, 0.9, 0.9),
        shelf("preset-air", 11000, 0.7),
      ];
    case "bus":
      return [
        lowCut(25),
        bell("preset-low-mid", 260, -0.5, 0.8, true, -22, 1.5),
        shelf("preset-air", 12000, 0.35),
      ];
    default:
      return [lowCut(25), bell("preset-contour", 4000, 0.35, 0.8)];
  }
}

function makeFactorySettings(pluginName: string, index: number): Partial<Fx> {
  const family = getPluginFamily(pluginName);
  const base = getPluginSettings(pluginName) ?? {};
  const preset = PRESET_CONTEXTS[index]!;
  const role = preset.role;
  const variant = index - 5.5;
  if (family === "compressor") {
    const compression = (
      {
        vocalClean: [-22, 2.2, 0.018, 0.16, 11, 1],
        vocalDeBox: [-23, 2, 0.012, 0.19, 10, 0.5],
        vocalAir: [-20, 2.4, 0.025, 0.14, 8, 1],
        kick: [-18, 4, 0.028, 0.09, 3, 1],
        snare: [-17, 3.5, 0.022, 0.12, 4, 1],
        overheads: [-24, 2, 0.035, 0.22, 12, 0],
        bass: [-20, 3, 0.03, 0.16, 5, 1],
        guitar: [-22, 2.5, 0.025, 0.18, 7, 0.5],
        keys: [-23, 2, 0.035, 0.2, 10, 0],
        acoustic: [-23, 2.3, 0.025, 0.2, 9, 0.5],
        bus: [-18, 2, 0.03, 0.14, 8, 0.5],
        neutral: [-24, 1.8, 0.04, 0.2, 12, 0],
      } as const
    )[role];
    if (pluginName === "K-2A") {
      return {
        ...base,
        compOn: true,
        compThreshold: clamp(compression[0] + 2, -35, -3),
        compRatio: 3,
        compAttack: clamp(compression[2] * 1.8, 0.012, 0.08),
        compRelease: clamp(compression[3] * 1.35, 0.08, 0.6),
        compKnee: 14,
        compMakeup: compression[5],
        compMix: 1,
      };
    }
    if (pluginName === "K-76") {
      return {
        ...base,
        compOn: true,
        compThreshold: compression[0],
        compRatio: [4, 8, 12, 20][index % 4]!,
        compAttack: clamp(compression[2] * 0.45, 0.001, 0.04),
        compRelease: clamp(compression[3] * 0.7, 0.03, 0.3),
        compKnee: 2,
        compMakeup: compression[5] + 0.5,
        compMix: 1,
      };
    }
    if (pluginName === "Fast Limiter") {
      return {
        ...base,
        compOn: true,
        compThreshold: clamp(compression[0] - 5, -35, -3),
        compRatio: 12,
        compAttack: 0.003,
        compRelease: clamp(compression[3] * 0.65 + index * 0.001, 0.04, 0.2),
        compKnee: 1,
        compMakeup: 0,
        compMix: 1,
      };
    }
    return {
      ...base,
      compOn: true,
      compThreshold: compression[0],
      compRatio: compression[1],
      compAttack: compression[2],
      compRelease: compression[3],
      compKnee: compression[4],
      compMakeup: compression[5],
      compMix: 0.85,
    };
  }
  if (family === "gate") {
    const threshold =
      role === "kick"
        ? -38
        : role === "snare"
          ? -42
          : role === "overheads"
            ? -48
            : role.startsWith("vocal")
              ? -52
              : -46;
    return {
      ...base,
      dynMode: pluginName === "Gate" ? 1 : 2,
      dynThreshold: threshold,
      dynAttack: role === "snare" || role === "kick" ? 0.003 : 0.009,
      dynRelease: role === "snare" ? 0.11 : role === "kick" ? 0.16 : 0.22,
      dynRange: pluginName === "Gate" ? -54 : -24,
      dynHysteresis: 1.5 + index * 0.35,
    };
  }
  if (family === "parametricEq") {
    return { ...base, eqBands: vocalAndInstrumentBands(role) };
  }
  if (family === "consoleEq") {
    const hpFreq = {
      vocalClean: 80,
      vocalDeBox: 80,
      vocalAir: 80,
      kick: 28,
      snare: 90,
      overheads: 240,
      bass: 35,
      guitar: 90,
      keys: 70,
      acoustic: 80,
      bus: 25,
      neutral: 25,
    }[role]!;
    const contour = (
      {
        vocalClean: [-2, 280, 1.2, 3200, 0.5, 0.7],
        vocalDeBox: [-2.8, 320, 0.2, 3200, 0.3, 0.4],
        vocalAir: [-1.2, 250, 1.4, 3600, 0.6, 1],
        kick: [1.6, 70, -1.5, 260, 0.8, -0.3],
        snare: [1.1, 180, -1.7, 620, 1.2, 0.5],
        overheads: [-0.5, 400, -1.2, 6800, 0.2, 0.7],
        bass: [1.1, 80, -2, 250, 0.7, 0],
        guitar: [0, 240, -1.5, 2200, 1, 0.2],
        keys: [-0.5, 360, -1.2, 2800, 0.8, 0.5],
        acoustic: [-0.5, 220, -1.7, 3000, 0.8, 0.7],
        bus: [-0.4, 260, -0.5, 5000, 0.3, 0.35],
        neutral: [0, 250, 0, 3200, 0, 0],
      } as const
    )[role];
    return {
      ...base,
      eqLow: contour[0],
      eqMid: contour[2],
      eqMidFreq: contour[1],
      eqMidQ: 1,
      eqHighMid: contour[4],
      eqHighMidFreq: contour[3],
      eqHighMidQ: role === "overheads" ? 1.5 : 0.9,
      eqHigh: contour[5],
      hpOn: true,
      hpFreq,
      lpOn: false,
      lpFreq: 18000,
    };
  }
  if (family === "amp") {
    const driveOffset = role.startsWith("vocal")
      ? -0.12
      : role === "kick" || role === "overheads"
        ? -0.08
        : 0;
    return {
      ...base,
      ampDrive: clamp((base.ampDrive ?? 0.35) + driveOffset + variant * 0.045, 0.04, 0.9),
      ampBias: clamp((base.ampBias ?? 0) + variant * 0.012, -0.3, 0.3),
      ampSag: clamp((base.ampSag ?? 0.25) + variant * 0.04, 0.05, 0.9),
      ampPresence: clamp((base.ampPresence ?? 0.45) - variant * 0.035, 0.1, 0.9),
      ampBass: clamp((role === "bass" ? -1 : 0) - variant * 0.3, -5, 5),
      ampMid: clamp((role === "guitar" ? 1.2 : 0) + variant * 0.4, -5, 5),
      ampTreble: clamp((role.startsWith("vocal") ? -1 : 0) - variant * 0.25, -5, 5),
      ampOutput: clamp(-Math.max(0, variant) * 0.4, -6, 0),
      cabOn: index % 5 !== 4,
    };
  }
  if (family === "modulation") {
    const rate = role.startsWith("vocal")
      ? 0.25 + (index % 4) * 0.12
      : role === "overheads" || role === "keys"
        ? 0.35 + (index % 4) * 0.18
        : role === "kick" || role === "snare"
          ? 1.8 + (index % 4) * 0.5
          : 0.3 + (index % 5) * 0.38;
    return {
      ...base,
      modRate: clamp(rate + variant * 0.015, 0.08, 5),
      modDepth: clamp((role.startsWith("vocal") ? 0.18 : 0.26) + (index % 5) * 0.1, 0.1, 0.8),
      modMix: clamp((role.startsWith("vocal") ? 0.16 : 0.2) + (index % 6) * 0.075, 0.12, 0.68),
      modFeedback: clamp(0.03 + (index % 6) * 0.09, 0, 0.62),
      modPan: clamp(variant * 0.12, -0.6, 0.6),
      modTone: clamp(15000 - index * 850, 3000, 16000),
    };
  }
  if (family === "reverb") {
    const amount =
      role === "kick"
        ? 0.08
        : role === "snare" || role === "overheads"
          ? 0.16
          : role.startsWith("vocal")
            ? 0.2
            : role === "bus"
              ? 0.1
              : 0.17;
    return {
      ...base,
      reverb: clamp(amount + (index % 5) * 0.045, 0.05, 0.48),
      reverbSize: clamp(0.18 + (index % 6) * 0.12, 0.08, 0.9),
      reverbPreDelay: clamp(
        (role.startsWith("vocal") ? 0.03 : 0.012) + (index % 5) * 0.009,
        0.005,
        0.09,
      ),
      reverbTone: clamp(
        role === "overheads" ? 8500 - index * 350 : 14000 - index * 750,
        3000,
        16000,
      ),
    };
  }
  if (family === "delay") {
    const time = role.startsWith("vocal")
      ? 0.24
      : role === "kick" || role === "snare"
        ? 0.12
        : role === "bus"
          ? 0.3
          : 0.34;
    return {
      ...base,
      delayTime: clamp(time + (index % 5) * 0.075, 0.06, 0.75),
      delayFeedback: clamp(0.18 + (index % 6) * 0.075, 0.08, 0.63),
      delayMix: clamp((role.startsWith("vocal") ? 0.14 : 0.11) + (index % 6) * 0.05, 0.08, 0.42),
      delayTone: clamp(13500 - index * 850, 1800, 16000),
    };
  }
  if (family === "saturation") {
    const baseDrive =
      role === "kick" || role === "snare"
        ? 0.16
        : role.startsWith("vocal")
          ? 0.1
          : role === "bus"
            ? 0.12
            : 0.14;
    return {
      ...base,
      drive: clamp(baseDrive + (index % 7) * 0.065, 0.04, 0.62),
      satMix: clamp((role.startsWith("vocal") ? 0.36 : 0.42) + (index % 6) * 0.085, 0.2, 0.86),
      satBias: clamp(variant * 0.018, -0.16, 0.16),
      satOutput: clamp(-Math.max(0, index - 2) * 0.3, -4, 0),
    };
  }
  if (family === "imager") {
    const width =
      role === "bus"
        ? 1.12
        : role === "overheads" || role === "keys"
          ? 1.48
          : role.startsWith("vocal")
            ? 1.18
            : 1.28;
    return {
      ...base,
      width: clamp(width + variant * 0.035, 0.72, 1.85),
      imagerBalance: clamp(variant * 0.018, -0.18, 0.18),
      imagerRotation: clamp(variant * 3, -18, 18),
      imagerMono: role === "bus" ? 0.08 : role === "kick" || role === "bass" ? 0.2 : 0,
    };
  }
  if (family === "smoothen") {
    return {
      ...base,
      smoothenTarget: clamp(-20 + variant * 0.6, -26, -12),
      smoothenRange: clamp(4 + (index % 6) * 1.8, 3, 15),
      smoothenFloor: clamp(-60 + (index % 5) * 4, -68, -38),
      smoothenSpeed: clamp(0.12 + (index % 6) * 0.14, 0.08, 1),
      smoothenMix: clamp(0.62 + (index % 5) * 0.075, 0.55, 1),
    };
  }
  if (family === "pitchCorrection") {
    const scales: PitchScale[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    return {
      ...base,
      pitchKey: 0,
      pitchScale: scales[index] ?? 1,
      pitchSpeed: clamp(0.035 + index * 0.026, 0.015, 0.42),
      pitchHumanize: clamp(0.12 + (index % 6) * 0.14, 0.08, 0.85),
      pitchFloor: clamp(-62 + (index % 5) * 5, -68, -36),
      pitchMix: clamp(0.62 + (index % 5) * 0.075, 0.55, 1),
      pitchReference: 440 + (index % 5) * 2,
      pitchTranspose: (index % 5) - 2,
      pitchRangeLow: 40 + (index % 4) * 3,
      pitchRangeHigh: 88 - (index % 4) * 2,
    };
  }
  if (family === "deEsser") {
    return {
      ...base,
      deEssOn: true,
      deEssFrequency: 4800 + (index % 5) * 750,
      deEssThreshold: -34 + (index % 6) * 2,
      deEssRange: 3 + (index % 5) * 1.5,
      deEssAttack: 0.001 + (index % 4) * 0.001,
      deEssRelease: 0.045 + (index % 5) * 0.018,
      deEssMix: 0.8 + (index % 3) * 0.1,
    };
  }
  if (family === "utility") {
    return {
      ...base,
      width: clamp(0.55 + index * 0.1, 0.4, 1.8),
      phase: index % 7 === 6,
    };
  }
  return base;
}

export function getFactoryPluginPresets(pluginName: string): FactoryPluginPreset[] {
  const family = getPluginFamily(pluginName);
  if (!family) return [];
  const allowedRoles = new Set(PRESET_ROLES_BY_FAMILY[family] ?? []);
  const contexts = PRESET_CONTEXTS.filter((preset) => allowedRoles.has(preset.role));
  const presets = contexts.map((preset) => {
    const index = PRESET_CONTEXTS.indexOf(preset);
    const copy = getPluginPresetCopy(pluginName, family, preset.role, preset.description);
    return {
    id: `${pluginName}:${index}`,
    name: copy.name,
    category: preset.category,
    description: copy.description,
    settings: makeFactorySettings(pluginName, index),
    };
  });
  if (pluginName === "K-2A") {
    presets.unshift({
      id: `${pluginName}:vocal-leveler`,
      name: "K-2A · Opto Vocal Leveler",
      category: "Vocals",
      description: "Slow, musical optical leveling for a steady lead vocal without flattening phrasing.",
      settings: {
        ...makeFactorySettings(pluginName, 0),
        compThreshold: -18,
        compAttack: 0.05,
        compRelease: 0.32,
        compMakeup: 1.5,
      },
    });
  }
  if (pluginName === "K-76") {
    presets.unshift({
      id: `${pluginName}:all-buttons`,
      name: "K-76 · All-Buttons Drum Crush",
      category: "Drums",
      description: "Aggressive fast FET compression for parallel drum energy, sustain, and attitude.",
      settings: {
        ...makeFactorySettings(pluginName, 4),
        compThreshold: -24,
        compRatio: 20,
        compAttack: 0.001,
        compRelease: 0.055,
        compMakeup: 2,
      },
    });
  }
  if (pluginName === "K1-Imager") {
    presets.unshift({
      id: `${pluginName}:mix-bus-width`,
      name: "K1-Imager · Wide but Safe",
      category: "Mix & Bus",
      description: "Restrained stereo expansion with mono reinforcement for reliable translation.",
      settings: {
        ...makeFactorySettings(pluginName, 10),
        width: 1.16,
        imagerBalance: 0,
        imagerRotation: 0,
        imagerMono: 0.08,
      },
    });
  }
  return presets;
}

export function getUserPluginPresets(pluginName: string): UserPluginPreset[] {
  const key = `kreative.plugin-presets.v1:${pluginName}`;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Saved preset storage has an invalid format.");
    return parsed.filter(
      (preset): preset is UserPluginPreset =>
        typeof preset === "object" &&
        preset !== null &&
        "id" in preset &&
        typeof preset.id === "string" &&
        "name" in preset &&
        typeof preset.name === "string" &&
        "settings" in preset &&
        typeof preset.settings === "object" &&
        preset.settings !== null,
    );
  } catch (error) {
    console.error("Couldn't read saved plugin presets.", error);
    return [];
  }
}

export function saveUserPluginPreset(pluginName: string, preset: UserPluginPreset) {
  const key = `kreative.plugin-presets.v1:${pluginName}`;
  const existing = getUserPluginPresets(pluginName).filter((item) => item.id !== preset.id);
  try {
    window.localStorage.setItem(key, JSON.stringify([...existing, preset]));
    return [...existing, preset];
  } catch (error) {
    console.error("Couldn't save plugin preset.", error);
    throw new Error("Couldn't save this preset in browser storage.");
  }
}

export function removeUserPluginPreset(pluginName: string, presetId: string) {
  const key = `kreative.plugin-presets.v1:${pluginName}`;
  const remaining = getUserPluginPresets(pluginName).filter((preset) => preset.id !== presetId);
  try {
    window.localStorage.setItem(key, JSON.stringify(remaining));
    return remaining;
  } catch (error) {
    console.error("Couldn't remove saved plugin preset.", error);
    throw new Error("Couldn't remove this preset from browser storage.");
  }
}
