import type { Fx } from "./engine";

export type TemplateParameterDefinition = {
  unit: "dB" | "Hz" | "seconds" | "ratio" | "normalized" | "degrees" | "semitones" | "enum";
  min: number;
  max: number;
  step: number;
  maxChangePerIteration: number;
  aiAdjustable: boolean;
  safeForAutomaticAdjustment: boolean;
  requiresAnalysis: boolean;
};

const definition = (
  unit: TemplateParameterDefinition["unit"],
  min: number,
  max: number,
  step: number,
  maxChangePerIteration: number,
  requiresAnalysis = true,
): TemplateParameterDefinition => ({
  unit,
  min,
  max,
  step,
  maxChangePerIteration,
  aiAdjustable: true,
  safeForAutomaticAdjustment: true,
  requiresAnalysis,
});

export const TEMPLATE_PARAMETER_DEFINITIONS: Partial<
  Record<keyof Fx, TemplateParameterDefinition>
> = {
  eqLow: definition("dB", -12, 12, 0.1, 2),
  eqMid: definition("dB", -12, 12, 0.1, 2),
  eqMidFreq: definition("Hz", 80, 8000, 1, 800),
  eqMidQ: definition("normalized", 0.1, 8, 0.05, 1),
  eqHighMid: definition("dB", -12, 12, 0.1, 2),
  eqHighMidFreq: definition("Hz", 800, 16000, 1, 1200),
  eqHighMidQ: definition("normalized", 0.1, 8, 0.05, 1),
  eqHigh: definition("dB", -12, 12, 0.1, 2),
  hpFreq: definition("Hz", 20, 1000, 1, 160),
  lpFreq: definition("Hz", 2000, 22000, 10, 3000),
  compThreshold: definition("dB", -60, 0, 0.5, 6),
  compRatio: definition("ratio", 1, 20, 0.1, 2),
  compAttack: definition("seconds", 0.001, 0.2, 0.001, 0.02),
  compRelease: definition("seconds", 0.01, 1, 0.005, 0.1),
  compKnee: definition("dB", 0, 40, 0.5, 6),
  compMakeup: definition("dB", -12, 12, 0.1, 2),
  compMix: definition("normalized", 0, 1, 0.01, 0.2, false),
  smoothenTarget: definition("dB", -60, 0, 0.5, 6),
  smoothenRange: definition("dB", 0, 18, 0.5, 3),
  smoothenFloor: definition("dB", -80, -20, 0.5, 6),
  smoothenSpeed: definition("seconds", 0.02, 2, 0.01, 0.2),
  smoothenMix: definition("normalized", 0, 1, 0.01, 0.2, false),
  pitchKey: { ...definition("enum", 0, 11, 1, 1, false), safeForAutomaticAdjustment: false },
  pitchSpeed: definition("seconds", 0.005, 1, 0.005, 0.1),
  pitchHumanize: definition("normalized", 0, 1, 0.01, 0.2),
  pitchFloor: definition("dB", -80, -20, 0.5, 6),
  pitchMix: definition("normalized", 0, 1, 0.01, 0.2, false),
  pitchReference: definition("Hz", 400, 480, 0.1, 5, false),
  pitchTranspose: definition("semitones", -12, 12, 1, 2),
  pitchRangeLow: definition("enum", 20, 80, 1, 8, false),
  pitchRangeHigh: definition("enum", 60, 120, 1, 8, false),
  deEssFrequency: definition("Hz", 3500, 12000, 50, 1500),
  deEssThreshold: definition("dB", -60, -6, 0.5, 8),
  deEssRange: definition("dB", 0, 18, 0.5, 4),
  deEssAttack: definition("seconds", 0.001, 0.02, 0.001, 0.004),
  deEssRelease: definition("seconds", 0.01, 0.3, 0.005, 0.06),
  deEssMix: definition("normalized", 0, 1, 0.01, 0.2, false),
  dynThreshold: definition("dB", -80, 0, 0.5, 8),
  dynAttack: definition("seconds", 0.001, 0.2, 0.001, 0.02),
  dynRelease: definition("seconds", 0.01, 1, 0.005, 0.1),
  dynRange: definition("dB", -80, 0, 0.5, 8),
  dynHysteresis: definition("dB", 0, 24, 0.5, 4),
  drive: definition("normalized", 0, 1, 0.01, 0.15),
  satMix: definition("normalized", 0, 1, 0.01, 0.2, false),
  satBias: definition("normalized", -1, 1, 0.01, 0.2),
  satOutput: definition("dB", -12, 12, 0.1, 2),
  ampDrive: definition("normalized", 0, 1, 0.01, 0.15),
  ampBias: definition("normalized", -1, 1, 0.01, 0.2),
  ampSag: definition("normalized", 0, 1, 0.01, 0.15),
  ampPresence: definition("normalized", 0, 1, 0.01, 0.15),
  ampOutput: definition("dB", -18, 12, 0.1, 2),
  ampBass: definition("dB", -12, 12, 0.1, 2),
  ampMid: definition("dB", -12, 12, 0.1, 2),
  ampTreble: definition("dB", -12, 12, 0.1, 2),
  width: definition("normalized", 0, 1.5, 0.01, 0.15),
  imagerBalance: definition("normalized", -1, 1, 0.01, 0.2),
  imagerRotation: definition("degrees", -180, 180, 1, 30),
  imagerMono: definition("normalized", 0, 1, 0.01, 0.2),
  modRate: definition("Hz", 0.01, 20, 0.01, 2),
  modDepth: definition("normalized", 0, 1, 0.01, 0.2),
  modMix: definition("normalized", 0, 1, 0.01, 0.2, false),
  modFeedback: definition("normalized", 0, 0.95, 0.01, 0.15),
  modPan: definition("normalized", -1, 1, 0.01, 0.2),
  modTone: definition("Hz", 500, 20000, 10, 3000),
  delayTime: definition("seconds", 0.001, 2, 0.001, 0.2),
  delayFeedback: definition("normalized", 0, 0.9, 0.01, 0.15),
  delayMix: definition("normalized", 0, 1, 0.01, 0.2, false),
  delayTone: definition("Hz", 500, 20000, 10, 3000),
  reverb: definition("normalized", 0, 1, 0.01, 0.2, false),
  reverbSize: definition("normalized", 0, 1, 0.01, 0.2),
  reverbPreDelay: definition("seconds", 0, 0.25, 0.001, 0.04),
  reverbTone: definition("Hz", 500, 20000, 10, 3000),
};

export function getTemplateParameterDefinition(key: string) {
  return TEMPLATE_PARAMETER_DEFINITIONS[key as keyof Fx];
}

export function validateTemplateParameter(key: string, value: unknown) {
  const rule = getTemplateParameterDefinition(key);
  if (!rule) return `No parameter definition exists for ${key}.`;
  if (typeof value !== "number" || !Number.isFinite(value)) return `${key} must be a finite number.`;
  if (value < rule.min || value > rule.max) {
    return `${key} must be between ${rule.min} and ${rule.max} ${rule.unit}.`;
  }
  return null;
}
