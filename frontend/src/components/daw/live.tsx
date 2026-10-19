import { useEffect, useRef } from "react";
import { engine, formatTime, SPECTRUM_FFT_SIZE } from "./engine";
import { smoothedSpectrumLevel } from "./spectrum";

function useFrame(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let id = 0;
    const loop = () => {
      ref.current();
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
}

const pct = (db: number) => Math.max(0, Math.min(100, ((db + 60) / 60) * 100));

export function Meter({
  id,
  horizontal = false,
}: {
  id?: string | undefined;
  horizontal?: boolean;
}) {
  const bar = useRef<HTMLDivElement>(null);
  useFrame(() => {
    const { peak } = id ? engine.level(id) : engine.masterLevel();
    if (bar.current) bar.current.style[horizontal ? "width" : "height"] = `${pct(peak)}%`;
  });
  return horizontal ? (
    <div className="h-1.5 w-full overflow-hidden rounded-sm bg-background">
      <div
        ref={bar}
        aria-label="Audio level meter"
        className="h-full w-0 transition-[width] duration-75"
        style={{
          background:
            "linear-gradient(90deg,var(--meter-low) 0%,var(--meter-low) 70%,var(--meter-mid) 70%,var(--meter-mid) 90%,var(--meter-high) 90%,var(--meter-high) 100%)",
        }}
      />
    </div>
  ) : (
    <div className="relative h-full w-1.5 overflow-hidden rounded-sm bg-background">
      <div
        ref={bar}
        aria-label="Audio level meter"
        className="absolute inset-x-0 bottom-0 h-0 transition-[height] duration-75"
        style={{
          background:
            "linear-gradient(to top,var(--meter-low) 0%,var(--meter-low) 70%,var(--meter-mid) 70%,var(--meter-mid) 90%,var(--meter-high) 90%,var(--meter-high) 100%)",
        }}
      />
    </div>
  );
}

export function Clock({
  length,
  loop,
  onEnd,
}: {
  length: number;
  loop: boolean;
  onEnd: () => void;
}) {
  const el = useRef<HTMLSpanElement>(null);
  useFrame(() => {
    const t = engine.time();
    if (engine.playing && t >= length) {
      onEnd();
      return;
    }
    if (el.current) el.current.textContent = formatTime(Math.min(t, length));
  });
  void loop;
  return (
    <span ref={el} className="font-mono text-2xl text-lcd">
      00:00:00:00
    </span>
  );
}

export function Playhead({ length }: { length: number }) {
  const el = useRef<HTMLDivElement>(null);
  useFrame(() => {
    if (el.current) el.current.style.left = `${(engine.time() / length) * 100}%`;
  });
  return <div ref={el} className="pointer-events-none absolute inset-y-0 z-10 w-px bg-lcd" />;
}

export function LoudnessReadout() {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const hold = useRef(-90);
  useFrame(() => {
    const { rms, peak } = engine.masterLevel();
    hold.current = engine.playing ? Math.max(hold.current, peak) : hold.current;
    const vals = [rms, peak, hold.current];
    vals.forEach((v, i) => {
      const e = refs.current[i];
      if (e) e.textContent = v <= -89 ? "-∞" : v.toFixed(1);
    });
  });
  return (
    <div className="mt-2 grid grid-cols-3 gap-1 text-center">
      {["RMS dB", "Peak dB", "Max Peak"].map((l, i) => (
        <div key={l}>
          <div
            ref={(e) => {
              refs.current[i] = e;
            }}
            className="font-mono text-sm"
          >
            -∞
          </div>
          <div className="text-[9px] text-muted-foreground">{l}</div>
        </div>
      ))}
    </div>
  );
}

export function Spectrum() {
  const cv = useRef<HTMLCanvasElement>(null);
  const data = useRef(new Float32Array(SPECTRUM_FFT_SIZE / 2));
  useFrame(() => {
    const c = cv.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    const w = (c.width = c.clientWidth * 2),
      h = (c.height = c.clientHeight * 2);
    g.clearRect(0, 0, w, h);
    if (!engine.ctx) return;
    engine.masterAnalyser.getFloatFrequencyData(data.current);
    const css = getComputedStyle(c);
    g.strokeStyle = css.getPropertyValue("--primary").trim() || "#35b5ff";
    g.fillStyle = css.getPropertyValue("--accent");
    g.lineWidth = 1.5;
    g.lineJoin = "round";
    g.lineCap = "round";
    g.beginPath();
    for (let x = 0; x <= w; x++) {
      const frequency = 20 * Math.pow(1000, x / w);
      const level = smoothedSpectrumLevel(
        data.current,
        frequency,
        engine.ctx.sampleRate,
        engine.masterAnalyser.fftSize,
      );
      const y = h * (0.98 - level * 0.88);
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.lineTo(w, h);
    g.lineTo(0, h);
    g.closePath();
    g.fill();
  });
  return <canvas ref={cv} className="mt-2 h-28 w-full rounded-sm bg-background" />;
}
