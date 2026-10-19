import { useEffect, useState } from "react";
import { AudioWaveform, Brain, Users, SlidersHorizontal, Workflow, BarChart3, Layers, Cloud, LayoutTemplate, Cpu, Download, Lock } from "lucide-react";
import { KMark } from "./Logo";

const FEATURES = [
  [AudioWaveform, "AI Mixing & Mastering", "One-click or custom"],
  [Brain, "AI Analysis", "Get mix suggestions & insights"],
  [Users, "Collaboration", "Work with your team"],
  [SlidersHorizontal, "Advanced DSP Plugins", "EQ, Compressor, Limiter, Reverb & more"],
  [Workflow, "Automation", "Control your sound with precision"],
  [BarChart3, "Meters & Analysis", "Loudness, spectrum, phase"],
  [Layers, "Multitrack Support", "Unlimited tracks & busses"],
  [Cloud, "Cloud Projects", "Save, sync & collaborate"],
  [LayoutTemplate, "Presets & Templates", "Start from pro templates"],
  [Cpu, "Real-time Audio Engine", "Low latency, high performance"],
  [Download, "Audio Export", "WAV, MP3, FLAC & more"],
  [Lock, "Secure & Private", "Your data, your control"],
] as const;

export function LoadingOverlay({ onDone }: { onDone: () => void }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setP((v) => Math.min(100, v + 3 + Math.random() * 6)), 90);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (p < 100) return;
    const t = setTimeout(onDone, 350);
    return () => clearTimeout(t);
  }, [p, onDone]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="max-h-full w-full max-w-[680px] overflow-auto rounded-md border bg-popover p-6 shadow-[var(--shadow-overlay)]">
        <div className="flex flex-col items-center">
          <KMark className="h-14 w-14" />
          <div className="mt-4 font-display text-xl tracking-[0.6em]">KREATIVE</div>
          <div className="mt-2 text-[10px] tracking-[0.3em] text-muted-foreground">AI MIXING & MASTERING</div>
          <div className="mt-6 h-1 w-72 max-w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-[image:var(--gradient-progress)] transition-[width]" style={{ width: `${p}%` }} />
          </div>
          <div className="mt-3 text-muted-foreground">Loading your studio... {Math.floor(p)}%</div>
        </div>
        <div className="mt-6 grid gap-x-6 gap-y-4 border-t pt-5 sm:grid-cols-3">
          {FEATURES.map(([Icon, t, d]) => (
            <div key={t} className="flex items-start gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded border bg-panel-2 text-primary"><Icon className="h-4 w-4" /></div>
              <div>
                <div className="text-foreground">{t}</div>
                <div className="text-[10px] text-muted-foreground">{d}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 text-center text-[10px] text-muted-foreground/60">Better Sound. Faster.</div>
      </div>
    </div>
  );
}
