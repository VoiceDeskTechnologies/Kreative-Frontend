import { useMemo } from "react";
import { analyzeTrackAudio } from "./audio-analysis";
import type { TrackState } from "./engine";

export function AnalysisPanel({ tracks, selected }: { tracks: TrackState[]; selected: TrackState | null }) {
  const stats = useMemo(() => new Map(tracks.map((t) => [t.id, analyzeTrackAudio(t)])), [tracks]);
  if (!tracks.length) return <div className="p-4 text-muted-foreground">Add audio to see an analysis.</div>;
  const s = selected ? stats.get(selected.id) : undefined;
  const tips: string[] = [];
  if (s && selected) {
    for (const issue of s.issues) {
      const action =
        issue.code === "clipping"
          ? " Lower the recording level next time."
          : issue.code === "headroom"
            ? " Pull the fader down a few dB."
            : issue.code === "quiet"
              ? " Raise Gain or add a Compressor."
              : issue.code === "dynamic"
                ? " A Compressor may even it out."
                : issue.code === "dc-offset"
                  ? " Enable High pass at ~20–40 Hz."
                  : "";
      tips.push(`${issue.message}${action}`);
    }
    if (!tips.length) tips.push("Levels look healthy.");
  }
  const row = (k: string, v: string) => <div className="flex justify-between border-b py-1"><span className="text-muted-foreground">{k}</span><span className="font-mono">{v}</span></div>;
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {s && selected ? (
        <>
          <div className="mb-2 text-[10px] tracking-wider text-muted-foreground">SELECTED · <span className="text-foreground">{selected.name}</span></div>
          {row("Peak", `${s.peakDb.toFixed(1)} dBFS`)}
          {row("RMS", `${s.rmsDb.toFixed(1)} dBFS`)}
          {row("Crest factor", `${s.crest.toFixed(1)} dB`)}
          {row("Clipped samples", String(s.clips))}
          {row("DC offset", s.dc.toFixed(4))}
          {row("Length", `${s.duration.toFixed(2)} s`)}
          {row("Format", `${s.sampleRate} Hz · ${s.channels === 1 ? "mono" : "stereo"}`)}
          <div className="mb-1 mt-3 text-[10px] tracking-wider text-muted-foreground">SUGGESTIONS</div>
          {tips.map((t) => <div key={t} className="mb-1 rounded-sm border bg-panel-2 p-2">{t}</div>)}
        </>
      ) : <div className="mb-3 text-muted-foreground">Select a track for details.</div>}
      <div className="mb-1 mt-4 text-[10px] tracking-wider text-muted-foreground">ALL TRACKS · PEAK / RMS</div>
      {tracks.map((t) => { const x = stats.get(t.id)!; return row(t.name, `${x.peakDb.toFixed(1)} / ${x.rmsDb.toFixed(1)}`); })}
    </div>
  );
}
