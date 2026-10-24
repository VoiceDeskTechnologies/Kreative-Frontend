import { describe, expect, it } from "vitest";
import { analyzeSession, formatSessionAnalysisReport } from "./audio-analysis";
import type { TrackState } from "./engine";

function buffer(samples: number[], channels = 1): AudioBuffer {
  const channelData = Array.from({ length: channels }, (_, channel) =>
    new Float32Array(channel ? samples.map((value) => value * 0.8) : samples),
  );
  return {
    duration: samples.length / 1000,
    length: samples.length,
    numberOfChannels: channels,
    sampleRate: 1000,
    getChannelData: (index: number) => channelData[index]!,
  } as unknown as AudioBuffer;
}

function track(id: string, name: string, audio: AudioBuffer, mute = false): TrackState {
  return {
    id,
    name,
    kind: "audio",
    colorIdx: 0,
    start: 0,
    buffer: audio,
    peaks: [],
    volume: 0,
    pan: 0,
    mute,
    solo: false,
    inserts: Array(10).fill(null),
    pluginBypass: {},
    fx: {} as TrackState["fx"],
  } as TrackState;
}

describe("browser session analysis", () => {
  it("analyzes one real buffer and inserts measured findings into a report", async () => {
    const report = await analyzeSession(
      [track("vocal-1", "Lead Vocal", buffer([0, 0.2, -0.3, 1, -1]))],
      "Demo Session",
    );

    expect(report.status).toBe("complete");
    expect(report.sessionSummary.analyzedTracks).toBe(1);
    expect(report.tracks[0]?.measurements?.peakDb).toBeCloseTo(0);
    expect(report.tracks[0]?.issues.some((issue) => issue.id === "digital-clipping")).toBe(true);
    expect(formatSessionAnalysisReport(report)).toContain("TRACK: Lead Vocal");
  });

  it("analyzes multiple tracks, including silent and muted tracks", async () => {
    const progress: string[] = [];
    const report = await analyzeSession(
      [
        track("beat-1", "Instrumental Beat", buffer([0.1, -0.1, 0.2])),
        track("vocal-1", "Lead Vocal", buffer([0, 0, 0, 0]), true),
      ],
      "Two Track Session",
      (value) => progress.push(value.trackName),
    );

    expect(report.sessionSummary.analyzedTracks).toBe(2);
    expect(report.tracks.map((item) => item.name)).toEqual(["Instrumental Beat", "Lead Vocal"]);
    expect(report.tracks[1]?.muted).toBe(true);
    expect(report.tracks[1]?.issues.some((issue) => issue.id === "near-silence")).toBe(true);
    expect(progress).toEqual(["Instrumental Beat", "Lead Vocal"]);
  });
});
