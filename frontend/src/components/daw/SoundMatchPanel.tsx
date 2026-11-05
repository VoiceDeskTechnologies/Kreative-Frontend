import { useRef, useState } from "react";
import { AudioLines, Check, FileAudio, LoaderCircle, Play, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { analyzeSoundMatch, createSoundMatchActions, type SoundMatchComparison } from "./sound-match";
import type { TrackState } from "./engine";

export function SoundMatchPanel({
  tracks,
  onApplyActions,
  isPro,
}: {
  tracks: TrackState[];
  onApplyActions: (actions: import("./ai-mix-types").AiMixAction[], onProgress: (index: number, label: string) => void) => Promise<void>;
  isPro: boolean;
}) {
  const [reference, setReference] = useState<{ file: File; buffer: AudioBuffer; url: string } | null>(null);
  const [selected, setSelected] = useState(() => new Set<string>());
  const [comparison, setComparison] = useState<SoundMatchComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const chooseReference = async (file: File) => {
    if (!file.type.startsWith("audio/") || file.size > 250 * 1024 * 1024) {
      toast.error("Choose an audio file smaller than 250 MB.");
      return;
    }
    setBusy(true);
    try {
      const context = new AudioContext();
      try {
        const buffer = await context.decodeAudioData(await file.arrayBuffer());
        if (buffer.duration > 20 * 60) throw new Error("Reference audio must be 20 minutes or shorter.");
        if (reference) URL.revokeObjectURL(reference.url);
        setReference({ file, buffer, url: URL.createObjectURL(file) });
        setComparison(null);
      } finally {
        await context.close();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The reference could not be decoded.");
    } finally {
      setBusy(false);
    }
  };

  const toggleTrack = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setComparison(null);
  };

  const analyze = async (): Promise<void> => {
    if (!reference) {
      toast.error("Upload a reference first.");
      return;
    }
    const chosen = tracks.filter((track) => selected.has(track.id) && track.kind !== "bus");
    if (!chosen.length) {
      toast.error("Select at least one session track.");
      return;
    }
    setBusy(true);
    try {
      setComparison(await analyzeSoundMatch(reference.buffer, chosen));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sound Match analysis failed.");
    } finally {
      setBusy(false);
    }
  };

  const selectedTrack = tracks.find((track) => selected.has(track.id) && track.kind !== "bus");
  const apply = async (): Promise<void> => {
    if (!comparison || !selectedTrack) return;
    const actions = createSoundMatchActions(comparison, selectedTrack);
    if (!actions.length) {
      toast.success("No processing changes were needed.");
      return;
    }
    setBusy(true);
    try {
      await onApplyActions(actions, () => undefined);
      toast.success("Sound Match processing applied. Use Undo to restore the original.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sound Match could not be applied.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="mb-3 flex items-center gap-2 border-b pb-3">
        <div className="grid h-8 w-8 place-items-center rounded border border-primary/30 bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1"><div className="text-xs font-medium">Sound Match AI</div><div className="text-[9px] tracking-wider text-muted-foreground">DSP-GUIDED REFERENCE MATCHING</div></div>
      </div>
      <section className="rounded border bg-panel-2 p-3">
        <div className="mb-2 flex items-center justify-between"><span className="text-[10px] tracking-wider text-muted-foreground">REFERENCE</span>{reference && <button className="text-muted-foreground hover:text-foreground" onClick={() => { URL.revokeObjectURL(reference.url); setReference(null); setComparison(null); }} aria-label="Remove reference"><X className="h-3 w-3" /></button>}</div>
        {!reference ? <button className="daw-btn flex w-full items-center justify-center gap-2 py-5 text-[10px] text-primary" onClick={() => inputRef.current?.click()} disabled={busy}><Upload className="h-4 w-4" /> Upload reference audio</button> : <div className="flex items-center gap-2"><FileAudio className="h-4 w-4 text-primary" /><div className="min-w-0 flex-1 truncate text-[10px]">{reference.file.name}<div className="text-[9px] text-muted-foreground">{reference.buffer.duration.toFixed(1)} s · {reference.buffer.sampleRate} Hz · {reference.buffer.numberOfChannels === 1 ? "mono" : "stereo"}</div></div><button className="daw-btn p-1" onClick={() => { void audioRef.current?.play(); setPlaying(true); }} aria-label="Preview reference"><Play className="h-3 w-3" /></button></div>}
        <input ref={inputRef} className="hidden" type="file" accept="audio/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void chooseReference(file); event.target.value = ""; }} />
        {reference && <audio ref={audioRef} className="hidden" src={reference.url} onEnded={() => setPlaying(false)} />}
        {playing && <button className="mt-2 text-[9px] text-primary" onClick={() => { audioRef.current?.pause(); setPlaying(false); }}>Stop preview</button>}
      </section>
      <section className="mt-3 rounded border bg-panel-2 p-3">
        <div className="mb-2 flex items-center justify-between"><span className="text-[10px] tracking-wider text-muted-foreground">YOUR MIX · SELECT TRACKS</span><button className="text-[9px] text-primary" onClick={() => setSelected(new Set(tracks.filter((track) => track.kind !== "bus").map((track) => track.id)))}>Select all</button></div>
        <div className="space-y-1">{tracks.filter((track) => track.kind !== "bus").map((track) => <button key={track.id} className={`flex w-full items-center gap-2 rounded border p-2 text-left text-[10px] ${selected.has(track.id) ? "border-primary/60 bg-primary/10" : "border-border"}`} onClick={() => toggleTrack(track.id)}><span className="grid h-4 w-4 place-items-center rounded border">{selected.has(track.id) && <Check className="h-3 w-3 text-primary" />}</span><AudioLines className="h-3 w-3 text-muted-foreground" /><span className="truncate">{track.name}</span></button>)}</div>
        <button className="daw-btn mt-3 flex w-full items-center justify-center gap-2 py-2 text-[10px] text-primary" onClick={() => void analyze()} disabled={busy || !reference || !selected.size}>{busy ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Analyze Reference & Mix</button>
      </section>
          {comparison && <section className="mt-3 rounded border bg-panel-2 p-3"><div className="mb-3 flex items-center justify-between"><span className="text-[10px] tracking-wider text-muted-foreground">COMPARISON REPORT</span><strong className="text-primary">{comparison.score}% match</strong></div><div className="grid grid-cols-2 gap-2 text-[9px]"><div className="rounded border p-2"><div className="mb-1 text-muted-foreground">Reference</div><div>{comparison.reference.rmsDb.toFixed(1)} dB RMS</div><div>{comparison.reference.crest.toFixed(1)} dB crest</div></div><div className="rounded border p-2"><div className="mb-1 text-muted-foreground">Your mix</div><div>{comparison.mix.rmsDb.toFixed(1)} dB RMS</div><div>{comparison.mix.crest.toFixed(1)} dB crest</div></div></div><div className="mt-3 space-y-1">{comparison.strategy.slice(0, isPro ? comparison.strategy.length : 2).map((item) => <div key={item} className="rounded border p-2 text-[9px]">{item}</div>)}</div>{!isPro ? <div className="mt-3 rounded border border-primary/30 bg-primary/10 p-3"><div className="text-[10px] font-medium text-primary">Unlock the complete Sound Match chain</div><div className="mt-1 text-[9px] text-muted-foreground">Upgrade to K-PRO to generate and apply the recommended processing chain.</div><button className="daw-btn mt-2 w-full py-2 text-[10px] text-primary" onClick={() => window.dispatchEvent(new Event("kreative:open-pricing"))}>View K-PRO plans</button></div> : <button className="daw-btn mt-3 flex w-full items-center justify-center gap-2 py-2 text-[10px] text-primary" onClick={() => void apply()} disabled={busy || !selectedTrack}><Sparkles className="h-3 w-3" /> Generate Sound Match Mix</button>}</section>}
    </div>
  );
}
