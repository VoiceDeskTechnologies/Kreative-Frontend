import { analyzeBuffer, type BufferAnalysis, type TrackState } from "./engine";
import type { AudioData } from "./export-audio";

export type AudioIssue = {
  code: "clipping" | "headroom" | "true-peak" | "quiet" | "dynamic" | "compressed" | "dc-offset";
  message: string;
  severity: "info" | "warning";
};

export type TrackAudioAnalysis = BufferAnalysis & {
  issues: AudioIssue[];
};

export function analyzeTrackAudio(track: TrackState): TrackAudioAnalysis {
  const measurements = analyzeBuffer(track.buffer);
  return { ...measurements, issues: identifyAudioIssues(measurements) };
}

export function identifyAudioIssues(measurements: BufferAnalysis): AudioIssue[] {
  const issues: AudioIssue[] = [];
  if (measurements.clips > 0)
    issues.push({ code: "clipping", severity: "warning", message: `${measurements.clips} clipped samples detected.` });
  if (measurements.peakDb > -1)
    issues.push({ code: "headroom", severity: "warning", message: "Peaks are very close to 0 dBFS." });
  if (measurements.truePeakDb > -1)
    issues.push({ code: "true-peak", severity: "warning", message: "Estimated true peak is above -1 dBTP." });
  if (measurements.rmsDb < -30)
    issues.push({ code: "quiet", severity: "info", message: "The average level is very quiet." });
  if (measurements.crest > 20)
    issues.push({ code: "dynamic", severity: "info", message: "The signal has a large peak-to-average gap." });
  if (measurements.crest < 8)
    issues.push({ code: "compressed", severity: "info", message: "The signal is already heavily compressed." });
  if (Math.abs(measurements.dc) > 0.01)
    issues.push({ code: "dc-offset", severity: "warning", message: "DC offset detected." });
  return issues;
}

export type AudioQualityComparison = {
  rmsDeltaDb: number;
  peakDeltaDb: number;
  truePeakDb: number;
  clipping: boolean;
  loudnessMatchedGainDb: number;
  shouldRevert: boolean;
  reasons: string[];
};

function db(value: number) {
  return value > 0 ? 20 * Math.log10(value) : -90;
}

function audioDataStats(audio: AudioData) {
  let peak = 0;
  let sum = 0;
  let samples = 0;
  for (const channel of [audio.left, audio.right]) {
    for (let index = 0; index < channel.length; index += 1) {
      const value = channel[index] ?? 0;
      peak = Math.max(peak, Math.abs(value));
      sum += value * value;
      samples += 1;
    }
  }
  return { rmsDb: db(Math.sqrt(sum / Math.max(1, samples))), peakDb: db(peak), truePeakDb: db(peak) };
}

export function loudnessMatch(reference: AudioData, candidate: AudioData, maxGainDb = 6): AudioData {
  const referenceStats = audioDataStats(reference);
  const candidateStats = audioDataStats(candidate);
  const gainDb = Math.max(-maxGainDb, Math.min(maxGainDb, referenceStats.rmsDb - candidateStats.rmsDb));
  const gain = 10 ** (gainDb / 20);
  return {
    ...candidate,
    left: candidate.left.map((value) => value * gain),
    right: candidate.right.map((value) => value * gain),
  };
}

export function compareRenderedAudio(before: AudioData, after: AudioData): AudioQualityComparison {
  const beforeStats = audioDataStats(before);
  const afterStats = audioDataStats(after);
  const rmsDeltaDb = afterStats.rmsDb - beforeStats.rmsDb;
  const peakDeltaDb = afterStats.peakDb - beforeStats.peakDb;
  const reasons: string[] = [];
  if (afterStats.truePeakDb > -0.1) reasons.push("post-processing reached 0 dBTP");
  if (rmsDeltaDb > 6) reasons.push("post-processing raised average level by more than 6 dB");
  if (afterStats.peakDb > 0) reasons.push("post-processing clipped the rendered result");
  return {
    rmsDeltaDb,
    peakDeltaDb,
    truePeakDb: afterStats.truePeakDb,
    clipping: afterStats.peakDb >= 0,
    loudnessMatchedGainDb: beforeStats.rmsDb - afterStats.rmsDb,
    shouldRevert: reasons.length > 0,
    reasons,
  };
}
