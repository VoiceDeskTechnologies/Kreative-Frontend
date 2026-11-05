import { analyzeAudioBuffer, type SessionTrackMeasurements } from "./audio-analysis";
import type { AiMixAction } from "./ai-mix-types";
import type { TrackState } from "./engine";

export type SoundMatchComparison = {
  reference: SessionTrackMeasurements;
  mix: SessionTrackMeasurements;
  score: number;
  differences: Array<{ label: string; detail: string; direction: "up" | "down" | "close" }>;
  strategy: string[];
};

const db = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)} dB`;
const percent = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;

function averageMeasurements(values: SessionTrackMeasurements[]): SessionTrackMeasurements {
  const first = values[0]!;
  const numericKeys: Array<keyof SessionTrackMeasurements> = [
    "peakDb", "truePeakDb", "rmsDb", "crest", "clips", "duration", "shortTermVariationDb",
    "silenceRatio", "nearClipRatio", "lowEnergy", "lowMidEnergy", "midEnergy",
    "upperMidEnergy", "highEnergy", "spectralCentroidHz", "spectralRolloffHz",
    "dynamicComplexityDb", "zeroCrossingRate",
  ];
  const result = { ...first };
  for (const key of numericKeys) {
    const total = values.reduce((sum, item) => sum + Number(item[key]), 0);
    (result[key] as number) = total / values.length;
  }
  result.stereoCorrelation = values.every((item) => item.stereoCorrelation !== null)
    ? values.reduce((sum, item) => sum + (item.stereoCorrelation ?? 0), 0) / values.length
    : null;
  result.stereoWidth = values.every((item) => item.stereoWidth !== null)
    ? values.reduce((sum, item) => sum + (item.stereoWidth ?? 0), 0) / values.length
    : null;
  return result;
}

export async function analyzeSoundMatch(reference: AudioBuffer, tracks: TrackState[]): Promise<SoundMatchComparison> {
  if (!tracks.length) throw new Error("Select at least one audio track to compare.");
  const [referenceMeasurement, ...mixMeasurements] = await Promise.all([
    analyzeAudioBuffer(reference),
    ...tracks.map((track) => analyzeAudioBuffer(track.buffer)),
  ]);
  const mix = averageMeasurements(mixMeasurements);
  const differences: SoundMatchComparison["differences"] = [];
  const add = (label: string, value: number, threshold: number, format: (value: number) => string) => {
    if (Math.abs(value) < threshold) return;
    differences.push({
      label,
      detail: `${format(value)} versus reference`,
      direction: value > 0 ? "up" : "down",
    });
  };
  add("Loudness", mix.rmsDb - referenceMeasurement.rmsDb, 1, db);
  add("Peak headroom", mix.peakDb - referenceMeasurement.peakDb, 1, db);
  add("Low-end energy", mix.lowEnergy - referenceMeasurement.lowEnergy, 0.035, percent);
  add("Low-mid energy", mix.lowMidEnergy - referenceMeasurement.lowMidEnergy, 0.035, percent);
  add("Presence energy", mix.upperMidEnergy - referenceMeasurement.upperMidEnergy, 0.035, percent);
  add("Air energy", mix.highEnergy - referenceMeasurement.highEnergy, 0.035, percent);
  add("Dynamics", mix.crest - referenceMeasurement.crest, 1.5, db);
  if (mix.stereoCorrelation !== null && referenceMeasurement.stereoCorrelation !== null) {
    add("Stereo correlation", mix.stereoCorrelation - referenceMeasurement.stereoCorrelation, 0.08, (value) => value.toFixed(2));
  }
  const totalDifference =
    Math.abs(mix.rmsDb - referenceMeasurement.rmsDb) / 12 +
    Math.abs(mix.peakDb - referenceMeasurement.peakDb) / 12 +
    Math.abs(mix.lowEnergy - referenceMeasurement.lowEnergy) +
    Math.abs(mix.lowMidEnergy - referenceMeasurement.lowMidEnergy) +
    Math.abs(mix.upperMidEnergy - referenceMeasurement.upperMidEnergy) +
    Math.abs(mix.highEnergy - referenceMeasurement.highEnergy) +
    Math.abs(mix.crest - referenceMeasurement.crest) / 12;
  const score = Math.max(0, Math.min(100, Math.round(100 - totalDifference * 100)));
  const strategy = differences.length
    ? differences.slice(0, 5).map((difference) => `Address ${difference.label.toLowerCase()}: ${difference.detail}.`)
    : ["The measured profile is already close; use small, broad changes and audition carefully."];
  return { reference: referenceMeasurement, mix, score, differences, strategy };
}

export function createSoundMatchActions(comparison: SoundMatchComparison, track: TrackState): AiMixAction[] {
  const patch: Record<string, number | boolean> = {};
  const { reference, mix } = comparison;
  if (mix.lowEnergy > reference.lowEnergy + 0.035) {
    patch["hpOn"] = true;
    patch["hpFreq"] = 35;
  }
  if (mix.highEnergy < reference.highEnergy - 0.035) {
    patch["eqHigh"] = 1.5;
  }
  if (mix.highEnergy > reference.highEnergy + 0.035) {
    patch["eqHigh"] = -1.5;
  }
  if (mix.crest > reference.crest + 2) {
    patch["compOn"] = true;
    patch["compThreshold"] = -20;
    patch["compRatio"] = 2.5;
    patch["compAttack"] = 0.025;
    patch["compRelease"] = 0.18;
    patch["compMix"] = 0.7;
  }
  const actions: AiMixAction[] = [];
  if (Object.keys(patch).length) {
    actions.push({ type: "setFx", trackId: track.id, patch });
  }
  const loudnessDelta = reference.rmsDb - mix.rmsDb;
  if (Math.abs(loudnessDelta) > 1) {
    actions.push({ type: "setTrackMix", trackId: track.id, volume: Math.max(-60, Math.min(6, track.volume + loudnessDelta * 0.35)) });
  }
  return actions;
}
