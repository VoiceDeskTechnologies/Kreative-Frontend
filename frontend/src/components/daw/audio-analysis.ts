import { analyzeBuffer, type BufferAnalysis, type TrackState } from "./engine";
import type { AudioData } from "./export-audio";

export type AnalysisSeverity = "info" | "low" | "medium" | "high" | "critical";
export type AnalysisIssue = {
  id: string;
  trackId: string;
  trackName: string;
  severity: AnalysisSeverity;
  confidence: number;
  explanation: string;
  evidence: Record<string, number | string | boolean>;
  suggestedArea: string;
  basis: "measured" | "heuristic";
};

export type SessionTrackMeasurements = BufferAnalysis & {
  shortTermVariationDb: number;
  silenceRatio: number;
  nearClipRatio: number;
  lowEnergy: number;
  lowMidEnergy: number;
  midEnergy: number;
  upperMidEnergy: number;
  highEnergy: number;
  spectralCentroidHz: number;
  spectralRolloffHz: number;
  dynamicComplexityDb: number;
  zeroCrossingRate: number;
  stereoCorrelation: number | null;
  stereoWidth: number | null;
};

export type SessionTrackReport = {
  trackId: string;
  name: string;
  role: string;
  muted: boolean;
  soloed: boolean;
  status: "complete" | "failed";
  measurements?: SessionTrackMeasurements;
  issues: AnalysisIssue[];
  recommendations: string[];
  failureReason?: string;
};

export type SessionAnalysisReport = {
  schemaVersion: "1.0";
  analysisId: string;
  sessionId: string;
  createdAt: string;
  analysisEngine: "KREATIVE DSP Session Analyzer 1.0";
  ruleSetVersion: "1.0";
  status: "complete" | "partial" | "failed";
  sessionSummary: {
    totalTracks: number;
    analyzedTracks: number;
    failedTracks: number;
    totalDurationSeconds: number;
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    lowIssues: number;
  };
  tracks: SessionTrackReport[];
  globalIssues: AnalysisIssue[];
  limitations: string[];
};

export type SessionAnalysisProgress = {
  completed: number;
  total: number;
  trackName: string;
};

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

const reportCache = new WeakMap<AudioBuffer, SessionTrackMeasurements>();
let essentiaPromise: Promise<import("essentia.js/dist/essentia.js-core.es.js").default> | null = null;

const levelDb = (value: number) => (value > 0 ? 20 * Math.log10(value) : -90);
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function goertzel(samples: Float32Array, start: number, size: number, frequency: number, sampleRate: number) {
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const coefficient = 2 * Math.cos(omega);
  let previous = 0;
  let previousPrevious = 0;
  for (let index = 0; index < size; index += 1) {
    const value = samples[start + index] ?? 0;
    const current = value + coefficient * previous - previousPrevious;
    previousPrevious = previous;
    previous = current;
  }
  return Math.max(0, previousPrevious * previousPrevious + previous * previous - coefficient * previous * previousPrevious);
}

function measureSessionBuffer(buffer: AudioBuffer): SessionTrackMeasurements {
  const cached = reportCache.get(buffer);
  if (cached) return cached;
  const base = analyzeBuffer(buffer);
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const sampleStep = Math.max(1, Math.ceil(left.length / 65_536));
  let silence = 0;
  let nearClip = 0;
  let leftSum = 0;
  let rightSum = 0;
  let leftSquared = 0;
  let rightSquared = 0;
  let cross = 0;
  for (let index = 0; index < left.length; index += sampleStep) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    const mono = (l + r) * 0.5;
    const level = Math.abs(mono);
    if (level < 0.0001) silence += 1;
    if (Math.abs(l) >= 0.98 || Math.abs(r) >= 0.98) nearClip += 1;
    leftSum += l;
    rightSum += r;
    leftSquared += l * l;
    rightSquared += r * r;
    cross += l * r;
  }

  const sampleCount = Math.max(1, Math.ceil(left.length / sampleStep));
  const leftMean = leftSum / sampleCount;
  const rightMean = rightSum / sampleCount;
  const leftVariance = Math.max(0, leftSquared / sampleCount - leftMean * leftMean);
  const rightVariance = Math.max(0, rightSquared / sampleCount - rightMean * rightMean);
  const correlation =
    buffer.numberOfChannels > 1 && leftVariance > 0 && rightVariance > 0
      ? clamp((cross / sampleCount - leftMean * rightMean) / Math.sqrt(leftVariance * rightVariance), -1, 1)
      : null;
  const windows = 64;
  const windowSize = Math.max(1, Math.floor(left.length / windows));
  const levels: number[] = [];
  for (let window = 0; window < windows; window += 1) {
    const start = window * windowSize;
    const end = Math.min(left.length, start + windowSize);
    let sum = 0;
    for (let index = start; index < end; index += sampleStep) {
      const value = ((left[index] ?? 0) + (right[index] ?? 0)) * 0.5;
      sum += value * value;
    }
    levels.push(levelDb(Math.sqrt(sum / Math.max(1, Math.ceil((end - start) / sampleStep)))));
  }
  const validLevels = levels.filter((level) => level > -90);
  const shortTermVariationDb = validLevels.length
    ? Math.max(...validLevels) - Math.min(...validLevels)
    : 0;
  const bandFrequencies = [80, 300, 1000, 3500, 9000];
  const bandPowers = bandFrequencies.map((frequency) => {
    const frameSize = Math.min(2048, Math.max(128, left.length));
    const frameStart = Math.max(0, Math.floor((left.length - frameSize) / 2));
    return goertzel(left, frameStart, frameSize, frequency, buffer.sampleRate);
  });
  const totalPower = Math.max(1, bandPowers.reduce((sum, power) => sum + power, 0));
  const bandEnergy = bandPowers.map((power) => power / totalPower);
  const weightedFrequencies = bandFrequencies.map((frequency, index) => frequency * (bandEnergy[index] ?? 0));
  const spectralCentroidHz = weightedFrequencies.reduce((sum, value) => sum + value, 0);
  let accumulated = 0;
  let spectralRolloffHz = bandFrequencies[bandFrequencies.length - 1]!;
  for (let index = 0; index < bandEnergy.length; index += 1) {
    accumulated += bandEnergy[index] ?? 0;
    if (accumulated >= 0.85) {
      spectralRolloffHz = bandFrequencies[index]!;
      break;
    }
  }
  const analysis = {
    ...base,
    shortTermVariationDb,
    silenceRatio: silence / sampleCount,
    nearClipRatio: nearClip / sampleCount,
    lowEnergy: bandEnergy[0] ?? 0,
    lowMidEnergy: bandEnergy[1] ?? 0,
    midEnergy: bandEnergy[2] ?? 0,
    upperMidEnergy: bandEnergy[3] ?? 0,
    highEnergy: bandEnergy[4] ?? 0,
    spectralCentroidHz,
    spectralRolloffHz,
    dynamicComplexityDb: shortTermVariationDb,
    zeroCrossingRate: 0,
    stereoCorrelation: correlation,
    stereoWidth: correlation === null ? null : 1 - correlation,
  };
  reportCache.set(buffer, analysis);
  return analysis;
}

async function measureWithEssentia(buffer: AudioBuffer) {
  const fallback = measureSessionBuffer(buffer);
  try {
    if (!essentiaPromise) {
      essentiaPromise = Promise.all([
        import("essentia.js/dist/essentia.js-core.es.js"),
        import("essentia.js/dist/essentia-wasm.es.js"),
      ]).then(async ([core, wasmModule]) => {
        const wasm = await wasmModule.EssentiaWASM.ready;
        return new core.default(wasm);
      });
    }
    const essentia = await essentiaPromise;
    const channel = buffer.getChannelData(0);
    const frameSize = Math.min(2048, Math.max(128, channel.length));
    const hopSize = Math.max(1, Math.floor(frameSize / 2));
    const rmsValues: number[] = [];
    const centroids: number[] = [];
    const rolloffs: number[] = [];
    const bandRatios = [[], [], [], [], []] as number[][];
    for (let start = 0; start + frameSize <= channel.length; start += hopSize) {
      const frame = channel.slice(start, start + frameSize);
      const vector = essentia.arrayToVector(frame);
      const spectrum = essentia.Spectrum(vector, frameSize).spectrum;
      const rms = essentia.RMS(vector).rms;
      const centroid = essentia.SpectralCentroidTime(vector, buffer.sampleRate).centroid;
      const rolloff = essentia.RollOff(spectrum, 0.85, buffer.sampleRate).rollOff;
      const bands = [
        essentia.EnergyBandRatio(spectrum, buffer.sampleRate, 20, 150).energyBandRatio,
        essentia.EnergyBandRatio(spectrum, buffer.sampleRate, 150, 800).energyBandRatio,
        essentia.EnergyBandRatio(spectrum, buffer.sampleRate, 800, 2000).energyBandRatio,
        essentia.EnergyBandRatio(spectrum, buffer.sampleRate, 2000, 4000).energyBandRatio,
        essentia.EnergyBandRatio(spectrum, buffer.sampleRate, 4000, 20000).energyBandRatio,
      ];
      if (Number.isFinite(rms)) rmsValues.push(rms);
      if (Number.isFinite(centroid)) centroids.push(centroid);
      if (Number.isFinite(rolloff)) rolloffs.push(rolloff);
      bands.forEach((value, index) => {
        if (Number.isFinite(value)) bandRatios[index]!.push(value);
      });
    }
    if (!rmsValues.length) return fallback;
    const rms = rmsValues.reduce((sum, value) => sum + value, 0) / rmsValues.length;
    const averageBandRatio = (index: number) => {
      const values = bandRatios[index]!;
      return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    };
    const fullVector = essentia.arrayToVector(channel);
    const dynamicComplexity = essentia.DynamicComplexity(fullVector, 0.2, buffer.sampleRate).dynamicComplexity;
    const zeroCrossingRate = essentia.ZeroCrossingRate(fullVector).zeroCrossingRate;
    return {
      ...fallback,
      rmsDb: levelDb(rms),
      crest: fallback.peakDb - levelDb(rms),
      spectralCentroidHz: centroids.reduce((sum, value) => sum + value, 0) / Math.max(1, centroids.length),
      spectralRolloffHz: rolloffs.reduce((sum, value) => sum + value, 0) / Math.max(1, rolloffs.length),
      lowEnergy: averageBandRatio(0),
      lowMidEnergy: averageBandRatio(1),
      midEnergy: averageBandRatio(2),
      upperMidEnergy: averageBandRatio(3),
      highEnergy: averageBandRatio(4),
      dynamicComplexityDb: Number.isFinite(dynamicComplexity) ? dynamicComplexity : fallback.shortTermVariationDb,
      zeroCrossingRate: Number.isFinite(zeroCrossingRate) ? zeroCrossingRate : 0,
    };
  } catch (error) {
    console.warn("Essentia.js analysis unavailable; using browser DSP fallback.", error);
    return fallback;
  }
}

function roleForTrack(track: TrackState) {
  if (track.kind === "bus") return "bus";
  const name = track.name.toLowerCase();
  if (/\b(ad[- ]?lib|adlib)\b/.test(name)) return "ad-lib";
  if (/\b(background|backing|bgv|harmony|harmonies)\b/.test(name)) return "backing vocal";
  if (/\b(beat|instrumental|music|music bed)\b/.test(name)) return "instrumental";
  if (/\b(bass|808)\b/.test(name)) return "bass";
  if (/\b(drum|kick|snare|perc|percussion)\b/.test(name)) return "drums/percussion";
  if (/\b(vocal|vox|voice|lead|rap|singer)\b/.test(name)) return "lead vocal";
  return "unknown audio";
}

function issuesForTrack(track: TrackState, measurements: SessionTrackMeasurements): AnalysisIssue[] {
  const issue = (
    id: string,
    severity: AnalysisSeverity,
    confidence: number,
    explanation: string,
    evidence: Record<string, number | string | boolean>,
    suggestedArea: string,
    basis: AnalysisIssue["basis"],
  ): AnalysisIssue => ({
    id,
    trackId: track.id,
    trackName: track.name,
    severity,
    confidence,
    explanation,
    evidence,
    suggestedArea,
    basis,
  });
  const issues: AnalysisIssue[] = [];
  if (measurements.clips > 0)
    issues.push(issue("digital-clipping", "critical", 1, "Clipped samples were measured.", { clippedSamples: measurements.clips }, "Recording gain or clip repair", "measured"));
  else if (measurements.peakDb > -1)
    issues.push(issue("limited-headroom", "high", 0.95, "The sample peak leaves very little digital headroom.", { peakDbfs: measurements.peakDb }, "Gain staging and peak control", "measured"));
  if (measurements.rmsDb < -38 && measurements.silenceRatio < 0.98)
    issues.push(issue("low-signal-level", "medium", 0.9, "The active signal is unusually quiet.", { rmsDbfs: measurements.rmsDb }, "Clip gain or input gain", "measured"));
  if (measurements.silenceRatio >= 0.98)
    issues.push(issue("near-silence", "low", 1, "The buffer is nearly silent.", { silenceRatio: measurements.silenceRatio }, "Confirm the source and recording region", "measured"));
  if (measurements.shortTermVariationDb > 24)
    issues.push(issue("large-level-variation", "medium", 0.8, "Short-term level variation is large.", { variationDb: measurements.shortTermVariationDb }, "Manual gain riding or conservative compression", "measured"));
  if (measurements.dc !== 0 && Math.abs(measurements.dc) > 0.01)
    issues.push(issue("dc-offset", "low", 0.95, "A measurable DC offset is present.", { dcOffset: measurements.dc }, "High-pass filtering or source cleanup", "measured"));
  if (measurements.lowEnergy > 0.42)
    issues.push(issue("possible-low-frequency-buildup", "low", 0.65, "Low-frequency energy is prominent relative to the measured bands.", { lowEnergyRatio: measurements.lowEnergy }, "Listen for rumble or low-end masking", "heuristic"));
  if (measurements.lowMidEnergy > 0.38)
    issues.push(issue("possible-low-mid-buildup", "low", 0.55, "Low-mid energy is prominent relative to the measured bands.", { lowMidEnergyRatio: measurements.lowMidEnergy }, "Listen for masking before applying corrective EQ", "heuristic"));
  if (measurements.stereoCorrelation !== null && measurements.stereoCorrelation < -0.35)
    issues.push(issue("phase-concern", "medium", 0.8, "Left and right channels show negative correlation.", { correlation: measurements.stereoCorrelation }, "Check mono compatibility", "measured"));
  return issues;
}

export async function analyzeSession(
  tracks: TrackState[],
  sessionId: string,
  onProgress?: (progress: SessionAnalysisProgress) => void,
): Promise<SessionAnalysisReport> {
  const reports: SessionTrackReport[] = [];
  const eligible = tracks.filter((track) => track.kind !== "bus");
  for (const [index, track] of eligible.entries()) {
    try {
      const measurements = await measureWithEssentia(track.buffer);
      const issues = issuesForTrack(track, measurements);
      reports.push({
        trackId: track.id,
        name: track.name,
        role: roleForTrack(track),
        muted: track.mute,
        soloed: track.solo,
        status: "complete",
        measurements,
        issues,
        recommendations: issues.length
          ? ["Review the measured evidence and audition changes before processing."]
          : ["No rule-based issue was detected; use listening and context before changing this track."],
      });
    } catch (error) {
      reports.push({
        trackId: track.id,
        name: track.name,
        role: roleForTrack(track),
        muted: track.mute,
        soloed: track.solo,
        status: "failed",
        issues: [],
        recommendations: [],
        failureReason: error instanceof Error ? error.message : "Track analysis failed.",
      });
    }
    onProgress?.({ completed: index + 1, total: eligible.length, trackName: track.name });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const issues = reports.flatMap((report) => report.issues);
  const failedTracks = reports.filter((report) => report.status === "failed").length;
  const analyzedTracks = reports.length - failedTracks;
  const summary = {
    totalTracks: eligible.length,
    analyzedTracks,
    failedTracks,
    totalDurationSeconds: Math.max(0, ...eligible.map((track) => track.buffer.duration + track.start)),
    criticalIssues: issues.filter((item) => item.severity === "critical").length,
    highIssues: issues.filter((item) => item.severity === "high").length,
    mediumIssues: issues.filter((item) => item.severity === "medium").length,
    lowIssues: issues.filter((item) => item.severity === "low").length,
  };
  return {
    schemaVersion: "1.0",
    analysisId: crypto.randomUUID(),
    sessionId,
    createdAt: new Date().toISOString(),
    analysisEngine: "KREATIVE DSP Session Analyzer 1.0",
    ruleSetVersion: "1.0",
    status: !eligible.length || !analyzedTracks ? "failed" : failedTracks ? "partial" : "complete",
    sessionSummary: summary,
    tracks: reports,
    globalIssues: [],
    limitations: [
      "Band energy and spectral descriptors are deterministic screening measurements, not a substitute for listening.",
      "Track roles use transparent name and track-kind heuristics and should be confirmed by ear.",
      "Integrated LUFS, true-peak compliance, source separation, and instrument recognition are not claimed by this analyzer.",
    ],
  };
}

export function formatSessionAnalysisReport(report: SessionAnalysisReport) {
  const lines = [
    "KREATIVE SESSION ANALYSIS",
    `Session: ${report.sessionId}`,
    `Analysis status: ${report.status}`,
    `Tracks analyzed: ${report.sessionSummary.analyzedTracks}/${report.sessionSummary.totalTracks}`,
    `Analysis engine: ${report.analysisEngine} · rules ${report.ruleSetVersion}`,
    `Issues: ${report.sessionSummary.criticalIssues} critical, ${report.sessionSummary.highIssues} high, ${report.sessionSummary.mediumIssues} medium, ${report.sessionSummary.lowIssues} low`,
    "",
  ];
  for (const track of report.tracks) {
    lines.push(`TRACK: ${track.name}`, `Role: ${track.role} · State: ${track.muted ? "muted" : "audible"}${track.soloed ? " · soloed" : ""}`);
    if (track.status === "failed") {
      lines.push(`Analysis failed: ${track.failureReason ?? "unknown reason"}`, "");
      continue;
    }
    const m = track.measurements!;
    lines.push(
      `Peak: ${m.peakDb.toFixed(1)} dBFS · RMS: ${m.rmsDb.toFixed(1)} dBFS · Crest: ${m.crest.toFixed(1)} dB`,
      `Variation: ${m.shortTermVariationDb.toFixed(1)} dB · Essentia dynamic complexity: ${m.dynamicComplexityDb.toFixed(1)} dB · Silence: ${(m.silenceRatio * 100).toFixed(1)}%`,
      `Spectral centroid: ${m.spectralCentroidHz.toFixed(0)} Hz · Rolloff: ${m.spectralRolloffHz.toFixed(0)} Hz`,
      `Zero-crossing rate: ${m.zeroCrossingRate.toFixed(4)}`,
      `Bands: low ${(m.lowEnergy * 100).toFixed(1)}% · low-mid ${(m.lowMidEnergy * 100).toFixed(1)}% · mid ${(m.midEnergy * 100).toFixed(1)}% · upper-mid ${(m.upperMidEnergy * 100).toFixed(1)}% · high ${(m.highEnergy * 100).toFixed(1)}%`,
      m.stereoCorrelation === null
        ? "Stereo: mono source"
        : `Stereo: correlation ${m.stereoCorrelation.toFixed(2)} · width indicator ${m.stereoWidth!.toFixed(2)}`,
      "Potential issues:",
    );
    if (!track.issues.length) lines.push("- None detected by the rule set.");
    else for (const item of track.issues) lines.push(`- [${item.severity}] ${item.explanation} Evidence: ${JSON.stringify(item.evidence)} Confidence: ${(item.confidence * 100).toFixed(0)}%.`);
    lines.push("");
  }
  lines.push("LIMITATIONS:", ...report.limitations.map((item) => `- ${item}`), "", "USER MIXING GOAL:", "", "INSTRUCTIONS:", "Use the measurements and evidence above to choose the minimum effective processing. Do not blindly apply every suggested correction.");
  return lines.join("\n");
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
