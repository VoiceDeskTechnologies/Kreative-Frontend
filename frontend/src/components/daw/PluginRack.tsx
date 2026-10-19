import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  Plus,
  Power,
  Replace,
  Save,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { EffectsPanel, Slider, type EffectSection } from "./EffectsPanel";
import { getPluginEntry, getPluginFamily, getPluginSettings, PLUGINS } from "./data";
import {
  engine,
  SPECTRUM_FFT_SIZE,
  type EqBand,
  type EqBandType,
  type Fx,
  type TrackState,
} from "./engine";
import { smoothedSpectrumLevel } from "./spectrum";
import {
  getFactoryPluginPresets,
  getUserPluginPresets,
  removeUserPluginPreset,
  saveUserPluginPreset,
  type UserPluginPreset,
} from "./plugin-presets";

export type InsertTarget = { trackId: string; slot: number };

export function PluginSlots({
  track,
  visible,
  onOpen,
}: {
  track: TrackState;
  visible: boolean;
  onOpen: (target: InsertTarget, plugin: string | null) => void;
}) {
  if (!visible) return null;
  return (
    <div className="mixer-slot-rack grid w-32 shrink-0 grid-flow-col grid-cols-2 grid-rows-5 gap-1">
      {track.inserts.map((plugin, slot) => (
        <button
          key={slot}
          aria-label={`${plugin ? "Edit" : "Add"} insert ${slot + 1}${plugin ? ` ${plugin}` : ""} on ${track.name}`}
          title={plugin ?? `Insert ${slot + 1}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpen({ trackId: track.id, slot }, plugin);
          }}
          className={`flex h-5 min-w-0 items-center gap-1 rounded-sm border px-1 text-left text-[8px] ${
            plugin
              ? "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/20"
              : "border-border/70 bg-background/70 text-muted-foreground hover:border-primary/50 hover:text-primary"
          }`}
        >
          <span className="font-mono text-[7px] text-muted-foreground">{slot + 1}</span>
          <span className="truncate">{plugin ?? <Plus className="h-2.5 w-2.5" />}</span>
        </button>
      ))}
    </div>
  );
}

export function InsertPicker({
  target,
  trackName,
  onChoose,
  onClose,
}: {
  target: InsertTarget;
  trackName: string;
  onChoose: (plugin: string) => void;
  onClose: () => void;
}) {
  const categories = Object.keys(PLUGINS);
  const [category, setCategory] = useState(categories[0] ?? "");
  const [pluginName, setPluginName] = useState(PLUGINS[category]?.[0]?.[0] ?? "");
  const choices = PLUGINS[category] ?? [];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="insert-picker-title"
        className="w-full max-w-md overflow-hidden rounded-md border border-border bg-panel shadow-overlay"
      >
        <header className="flex h-11 items-center justify-between border-b bg-panel-2 px-3">
          <div className="flex items-center gap-2">
            <AudioLines className="h-4 w-4 text-primary" />
            <div>
              <h2 id="insert-picker-title" className="text-[11px] tracking-wider">
                INSERT SELECTOR
              </h2>
              <div className="text-[9px] text-muted-foreground">
                {trackName} · SLOT {String(target.slot + 1).padStart(2, "0")}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="daw-btn grid h-6 w-6 place-items-center"
            onClick={onClose}
            aria-label="Close insert selector"
            title="Close insert selector"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>
        <div className="space-y-3 p-4">
          <label className="block text-[10px] text-muted-foreground">
            PROCESSOR TYPE
            <select
              value={category}
              onChange={(event) => {
                const next = event.target.value;
                setCategory(next);
                setPluginName(PLUGINS[next]?.[0]?.[0] ?? "");
              }}
              className="mt-1.5 w-full rounded-sm border bg-background px-2 py-2 text-[11px] text-foreground"
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[10px] text-muted-foreground">
            PLUGIN
            <select
              value={pluginName}
              onChange={(event) => setPluginName(event.target.value)}
              className="mt-1.5 w-full rounded-sm border bg-background px-2 py-2 text-[11px] text-foreground"
            >
              {choices.map(([name]) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded border border-primary/20 bg-primary/5 p-2 text-[9px] leading-relaxed text-muted-foreground">
            Inserts use current browser DSP blocks. One instance per block is supported, and insert
            order is visual; the audio engine currently uses a fixed processing order.
          </div>
          <button
            className="daw-btn h-9 w-full border-primary/40 bg-primary/10 text-[10px] text-primary hover:bg-primary/20"
            disabled={!pluginName}
            onClick={() => onChoose(pluginName)}
          >
            Insert {pluginName || "plugin"}
          </button>
        </div>
      </section>
    </div>
  );
}

const EDITOR_SECTIONS: Record<string, EffectSection> = {
  compressor: "COMPRESSOR",
  gate: "GATE",
  parametricEq: "EQ",
  consoleEq: "EQ",
  amp: "AMP",
  modulation: "MODULATION",
  reverb: "REVERB",
  delay: "DELAY",
  saturation: "SATURATION",
  utility: "UTILITY",
  imager: "UTILITY",
  smoothen: "VOCAL",
  pitchCorrection: "PITCH",
  deEsser: "DE-ESSER",
};
const DEFAULT_PLUGIN_SIZE = 100;

function ConsoleEqResponse({
  track,
  onChange,
}: {
  track: TrackState;
  onChange: (patch: Partial<Fx>) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragBand = useRef<"low" | "lowMid" | "highMid" | "high" | null>(null);
  const trackRef = useRef(track);
  trackRef.current = track;

  useEffect(() => {
    const spectrum = new Float32Array(SPECTRUM_FFT_SIZE / 2);
    let frame = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const width = Math.max(1, canvas.clientWidth * 2);
      const height = Math.max(1, canvas.clientHeight * 2);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const context = canvas.getContext("2d");
      if (!context) return;
      const { fx } = trackRef.current;
      const primary = "#e1b76c";
      const lowColor = "#f4bb59";
      const lowMidColor = "#e782c8";
      const highMidColor = "#b9cc78";
      const highColor = "#e8d9a8";
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#13140f";
      context.fillRect(0, 0, width, height);

      const xForHz = (hz: number) => (Math.log(hz / 20) / Math.log(1000)) * width;
      const yForDb = (db: number) => ((12 - db) / 24) * height;
      context.lineWidth = 1;
      context.font = `${Math.max(9, height * 0.045)}px ui-monospace, monospace`;
      context.textBaseline = "top";
      for (let db = -12; db <= 12; db += 6) {
        const y = yForDb(db);
        context.strokeStyle = db === 0 ? "rgba(220,195,145,.28)" : "rgba(180,155,110,.13)";
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
        context.fillStyle = "rgba(205,185,145,.62)";
        context.fillText(`${db > 0 ? "+" : ""}${db}`, 5, Math.max(1, y - 14));
      }
      for (const [hz, label] of [
        [20, "20"],
        [100, "100"],
        [1000, "1k"],
        [10000, "10k"],
        [20000, "20k"],
      ] as const) {
        const x = xForHz(hz);
        context.strokeStyle = "rgba(180,155,110,.14)";
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
        context.fillStyle = "rgba(205,185,145,.62)";
        context.fillText(label, Math.min(width - 34, x + 4), height - 18);
      }

      engine.readSpectrum(trackRef.current.id, spectrum);
      const sampleRate = engine.ctx?.sampleRate ?? 48000;
      context.beginPath();
      for (let x = 0; x <= width; x++) {
        const hz = 20 * Math.pow(1000, x / width);
        const magnitude = smoothedSpectrumLevel(spectrum, hz, sampleRate, SPECTRUM_FFT_SIZE);
        const y = height * (0.97 - magnitude * 0.84);
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = "rgba(235,184,99,.72)";
      context.lineWidth = 1.25;
      context.stroke();
      context.lineTo(width, height);
      context.lineTo(0, height);
      context.closePath();
      const fill = context.createLinearGradient(0, 0, 0, height);
      fill.addColorStop(0, "rgba(220,166,77,.26)");
      fill.addColorStop(1, "rgba(220,166,77,.01)");
      context.fillStyle = fill;
      context.fill();

      const response = (hz: number) => {
        const low = fx.eqLow / (1 + Math.pow(hz / 200, 4));
        const lowMidOctaves = Math.log2(hz / Math.max(20, fx.eqMidFreq));
        const lowMidWidth = Math.max(0.12, 0.82 / fx.eqMidQ);
        const lowMid = fx.eqMid * Math.exp(-0.5 * Math.pow(lowMidOctaves / lowMidWidth, 2));
        const highMidOctaves = Math.log2(hz / Math.max(20, fx.eqHighMidFreq));
        const highMidWidth = Math.max(0.12, 0.82 / fx.eqHighMidQ);
        const highMid = fx.eqHighMid * Math.exp(-0.5 * Math.pow(highMidOctaves / highMidWidth, 2));
        const high = fx.eqHigh / (1 + Math.pow(6000 / hz, 4));
        const hp = fx.hpOn && hz < fx.hpFreq ? -Math.min(24, 12 * Math.log2(fx.hpFreq / hz)) : 0;
        const lp = fx.lpOn && hz > fx.lpFreq ? -Math.min(24, 12 * Math.log2(hz / fx.lpFreq)) : 0;
        return Math.max(-24, Math.min(12, low + lowMid + highMid + high + hp + lp));
      };
      context.beginPath();
      for (let x = 0; x <= width; x++) {
        const hz = 20 * Math.pow(1000, x / width);
        const y = yForDb(response(hz));
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = primary;
      context.lineWidth = 3;
      context.shadowColor = primary;
      context.shadowBlur = 8;
      context.stroke();
      context.shadowBlur = 0;

      const bands = [
        { id: "low" as const, hz: 200, db: fx.eqLow, color: lowColor },
        { id: "lowMid" as const, hz: fx.eqMidFreq, db: fx.eqMid, color: lowMidColor },
        { id: "highMid" as const, hz: fx.eqHighMidFreq, db: fx.eqHighMid, color: highMidColor },
        { id: "high" as const, hz: 6000, db: fx.eqHigh, color: highColor },
      ];
      for (const band of bands) {
        const x = xForHz(band.hz);
        const y = yForDb(band.db);
        context.beginPath();
        context.arc(x, y, 10, 0, Math.PI * 2);
        context.fillStyle = "rgba(5,14,24,.9)";
        context.fill();
        context.strokeStyle = band.color;
        context.lineWidth = 2;
        context.stroke();
        context.fillStyle = band.color;
        context.font = "bold 10px ui-monospace, monospace";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(
          band.id === "lowMid" ? "LM" : band.id === "highMid" ? "HM" : band.id.toUpperCase(),
          x,
          y + 0.5,
        );
      }
      context.textAlign = "left";
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [track.id]);

  const bandPoints = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return [];
    const xForHz = (hz: number) => (Math.log(hz / 20) / Math.log(1000)) * rect.width;
    const yForDb = (db: number) => ((12 - db) / 24) * rect.height;
    return [
      { id: "low" as const, x: xForHz(200), y: yForDb(track.fx.eqLow) },
      {
        id: "lowMid" as const,
        x: xForHz(track.fx.eqMidFreq),
        y: yForDb(track.fx.eqMid),
      },
      {
        id: "highMid" as const,
        x: xForHz(track.fx.eqHighMidFreq),
        y: yForDb(track.fx.eqHighMid),
      },
      { id: "high" as const, x: xForHz(6000), y: yForDb(track.fx.eqHigh) },
    ];
  };

  const startDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const nearest = bandPoints()
      .map((point) => ({ ...point, distance: Math.hypot(point.x - x, point.y - y) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest && nearest.distance < 26) {
      dragBand.current = nearest.id;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };
  const moveBand = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const band = dragBand.current;
    if (!band) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    const db = Math.max(-12, Math.min(12, 12 - y * 24));
    if (band === "low") onChange({ eqLow: db });
    else if (band === "high") onChange({ eqHigh: db });
    else if (band === "lowMid")
      onChange({ eqMid: db, eqMidFreq: Math.max(100, Math.min(10000, 20 * Math.pow(1000, x))) });
    else
      onChange({
        eqHighMid: db,
        eqHighMidFreq: Math.max(1000, Math.min(12000, 20 * Math.pow(1000, x))),
      });
  };

  return (
    <div className="mb-3 overflow-hidden rounded border border-slate-600/70 bg-[#07111c]">
      <div className="flex items-center justify-between border-b border-slate-700/80 px-3 py-2">
        <span className="text-[9px] tracking-[0.18em] text-[#d7c49a]">
          FOUR-BAND CONSOLE EQ · VINTAGE TONE STACK
        </span>
        <span className="flex items-center gap-3 text-[8px] text-slate-500">
          <span>
            <i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />
            LIVE SPECTRUM
          </span>
          <span>
            <i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            FILTER CURVE
          </span>
        </span>
      </div>
      <canvas
        ref={canvasRef}
        aria-label="Live spectrum and draggable EQ bands"
        className="h-56 w-full cursor-crosshair touch-none"
        onPointerDown={startDrag}
        onPointerMove={moveBand}
        onPointerUp={() => {
          dragBand.current = null;
        }}
        onPointerCancel={() => {
          dragBand.current = null;
        }}
      />
      <div className="border-t border-slate-700/80 px-3 py-1 text-[8px] text-slate-500">
        Drag LOW / LM / HM / HIGH nodes to shape the console curve.
      </div>
    </div>
  );
}

const MAX_PARAMETRIC_BANDS = 8;

const eqBandTypes: [EqBandType, string][] = [
  ["bell", "Bell"],
  ["lowShelf", "Low shelf"],
  ["highShelf", "High shelf"],
  ["lowPass", "Low pass"],
  ["highPass", "High pass"],
  ["notch", "Notch"],
];

function ParametricEqEditor({
  track,
  onChange,
}: {
  track: TrackState;
  onChange: (patch: Partial<Fx>) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragBandId = useRef<string | null>(null);
  const trackRef = useRef(track);
  const [selectedBandId, setSelectedBandId] = useState<string | null>(
    track.fx.eqBands[0]?.id ?? null,
  );
  trackRef.current = track;
  const bands = track.fx.eqBands;
  const selectedBand = bands.find((band) => band.id === selectedBandId) ?? bands[0] ?? null;
  const updateBand = (id: string, patch: Partial<EqBand>) => {
    onChange({
      eqBands: track.fx.eqBands.map((band) => (band.id === id ? { ...band, ...patch } : band)),
    });
  };
  const addBand = (frequency: number, gain: number) => {
    if (track.fx.eqBands.length >= MAX_PARAMETRIC_BANDS) return;
    const band: EqBand = {
      id: crypto.randomUUID(),
      type: "bell",
      frequency,
      gain,
      q: 1,
      enabled: true,
      dynamic: false,
      thresholdDb: -24,
      rangeDb: 3,
      attack: 0.01,
      release: 0.16,
    };
    onChange({ eqBands: [...track.fx.eqBands, band] });
    setSelectedBandId(band.id);
  };
  const frequencyAt = (x: number) => 20 * Math.pow(1000, Math.max(0, Math.min(1, x)));
  const xAtFrequency = (frequency: number, width: number) =>
    (Math.log(Math.max(20, frequency) / 20) / Math.log(1000)) * width;
  const gainAt = (y: number) => Math.max(-18, Math.min(18, 18 - y * 36));
  const yAtGain = (gain: number, height: number) => ((18 - gain) / 36) * height;
  const hasGain = (type: EqBandType) => type !== "lowPass" && type !== "highPass";
  const formatHz = (frequency: number) =>
    frequency >= 1000 ? `${(frequency / 1000).toFixed(2)} kHz` : `${Math.round(frequency)} Hz`;

  useEffect(() => {
    const spectrum = new Float32Array(SPECTRUM_FFT_SIZE / 2);
    let frame = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const width = Math.max(1, canvas.clientWidth * 2);
      const height = Math.max(1, canvas.clientHeight * 2);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const context = canvas.getContext("2d");
      if (!context) return;
      const currentTrack = trackRef.current;
      const css = getComputedStyle(canvas);
      const primary = css.getPropertyValue("--primary").trim() || "#24a6f2";
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#07111c";
      context.fillRect(0, 0, width, height);
      context.font = `${Math.max(9, height * 0.044)}px ui-monospace, monospace`;
      context.textBaseline = "middle";

      for (let db = -18; db <= 18; db += 6) {
        const y = yAtGain(db, height);
        context.strokeStyle = db === 0 ? "rgba(160,190,215,.28)" : "rgba(120,150,175,.13)";
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
        context.fillStyle = "rgba(165,190,210,.62)";
        context.fillText(`${db > 0 ? "+" : ""}${db}`, 5, y);
      }
      for (const [frequency, label] of [
        [20, "20"],
        [100, "100"],
        [1000, "1k"],
        [10000, "10k"],
        [20000, "20k"],
      ] as const) {
        const x = xAtFrequency(frequency, width);
        context.strokeStyle = "rgba(120,150,175,.14)";
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
        context.fillStyle = "rgba(165,190,210,.62)";
        context.fillText(label, Math.min(width - 36, x + 4), height - 11);
      }

      engine.readSpectrum(currentTrack.id, spectrum);
      const sampleRate = engine.ctx?.sampleRate ?? 48000;
      context.beginPath();
      for (let x = 0; x <= width; x++) {
        const frequency = frequencyAt(x / width);
        const magnitude = smoothedSpectrumLevel(spectrum, frequency, sampleRate, SPECTRUM_FFT_SIZE);
        const y = height * (0.97 - magnitude * 0.84);
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = "rgba(67,196,247,.72)";
      context.lineWidth = 1.25;
      context.stroke();
      context.lineTo(width, height);
      context.lineTo(0, height);
      context.closePath();
      const spectrumFill = context.createLinearGradient(0, 0, 0, height);
      spectrumFill.addColorStop(0, "rgba(24,172,238,.3)");
      spectrumFill.addColorStop(1, "rgba(24,172,238,.01)");
      context.fillStyle = spectrumFill;
      context.fill();

      const responseAt = (frequency: number) =>
        currentTrack.fx.eqBands.reduce((response, band) => {
          if (!band.enabled) return response;
          const octaves = Math.log2(frequency / Math.max(20, band.frequency));
          const widthOctaves = Math.max(0.1, 0.82 / band.q);
          const bell = Math.exp(-0.5 * Math.pow(octaves / widthOctaves, 2));
          if (band.type === "bell") return response + band.gain * bell;
          if (band.type === "notch") return response - 24 * bell;
          if (band.type === "lowShelf")
            return response + band.gain / (1 + Math.pow(frequency / band.frequency, 4));
          if (band.type === "highShelf")
            return response + band.gain / (1 + Math.pow(band.frequency / frequency, 4));
          if (band.type === "highPass" && frequency < band.frequency)
            return response - Math.min(36, 12 * Math.log2(band.frequency / frequency));
          if (band.type === "lowPass" && frequency > band.frequency)
            return response - Math.min(36, 12 * Math.log2(frequency / band.frequency));
          return response;
        }, 0);
      const dynamicReductions = engine.dynamicEqReduction(currentTrack.id);
      const dynamicCutAt = (frequency: number) =>
        currentTrack.fx.eqBands.reduce((cut, band, index) => {
          if (!band.enabled || !band.dynamic) return cut;
          const octaves = Math.log2(frequency / Math.max(20, band.frequency));
          const widthOctaves = Math.max(0.1, 0.82 / band.q);
          const reduction = Math.min(band.rangeDb, dynamicReductions[index] ?? 0);
          return cut + reduction * Math.exp(-0.5 * Math.pow(octaves / widthOctaves, 2));
        }, 0);
      context.beginPath();
      for (let x = 0; x <= width; x++) {
        const frequency = frequencyAt(x / width);
        const y = yAtGain(Math.max(-24, Math.min(24, responseAt(frequency))), height);
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = primary;
      context.lineWidth = 3;
      context.shadowColor = primary;
      context.shadowBlur = 8;
      context.stroke();
      context.shadowBlur = 0;
      if (currentTrack.fx.eqBands.some((band) => band.enabled && band.dynamic)) {
        context.beginPath();
        for (let x = 0; x <= width; x++) {
          const frequency = frequencyAt(x / width);
          const response = responseAt(frequency) - dynamicCutAt(frequency);
          const y = yAtGain(Math.max(-24, Math.min(24, response)), height);
          if (x === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.setLineDash([6, 4]);
        context.strokeStyle = "#f4bb59";
        context.lineWidth = 1.5;
        context.stroke();
        context.setLineDash([]);
      }
      const palette = [
        "#f4bb59",
        "#e782c8",
        "#55c5ff",
        "#40d5ce",
        "#a6e65c",
        "#ee7d65",
        "#ad9bff",
        "#e8d46d",
      ];
      currentTrack.fx.eqBands.forEach((band, index) => {
        const x = xAtFrequency(band.frequency, width);
        const y = yAtGain(hasGain(band.type) ? band.gain : 0, height);
        const color = palette[index % palette.length]!;
        context.beginPath();
        context.arc(x, y, band.id === selectedBandId ? 12 : 9, 0, Math.PI * 2);
        context.fillStyle = band.enabled ? "rgba(5,14,24,.94)" : "rgba(80,88,98,.8)";
        context.fill();
        context.strokeStyle = color;
        context.lineWidth = band.id === selectedBandId ? 3 : 2;
        context.stroke();
        context.fillStyle = color;
        context.font = "bold 9px ui-monospace, monospace";
        context.textAlign = "center";
        context.fillText(`${index + 1}`, x, y + 0.5);
        if (band.dynamic) {
          context.textAlign = "left";
          context.font = "bold 8px ui-monospace, monospace";
          context.fillStyle = "#f4bb59";
          const reduction = dynamicReductions[index] ?? 0;
          context.fillText(`DYN ${reduction.toFixed(1)} dB`, x + 12, y - 10);
        }
      });
      context.textAlign = "left";
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [selectedBandId, track.id]);

  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const nearest = track.fx.eqBands
      .map((band) => ({
        band,
        distance: Math.hypot(
          xAtFrequency(band.frequency, bounds.width) - x,
          yAtGain(hasGain(band.type) ? band.gain : 0, bounds.height) - y,
        ),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest && nearest.distance < 24) {
      setSelectedBandId(nearest.band.id);
      dragBandId.current = nearest.band.id;
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (track.fx.eqBands.length >= MAX_PARAMETRIC_BANDS) return;
    const band: EqBand = {
      id: crypto.randomUUID(),
      type: "bell",
      frequency: frequencyAt(x / bounds.width),
      gain: gainAt(y / bounds.height),
      q: 1,
      enabled: true,
      dynamic: false,
      thresholdDb: -24,
      rangeDb: 3,
      attack: 0.01,
      release: 0.16,
    };
    setSelectedBandId(band.id);
    dragBandId.current = band.id;
    onChange({ eqBands: [...track.fx.eqBands, band] });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const id = dragBandId.current;
    if (!id) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width;
    const y = (event.clientY - bounds.top) / bounds.height;
    const band = track.fx.eqBands.find((candidate) => candidate.id === id);
    if (!band) return;
    const updated = track.fx.eqBands.map((candidate) =>
      candidate.id === id
        ? {
            ...candidate,
            frequency: frequencyAt(x),
            ...(hasGain(candidate.type) ? { gain: gainAt(y) } : {}),
          }
        : candidate,
    );
    onChange({ eqBands: updated });
  };
  const pointerContextMenu = (event: React.MouseEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const nearest = track.fx.eqBands
      .map((band) => ({
        band,
        distance: Math.hypot(
          xAtFrequency(band.frequency, bounds.width) - x,
          yAtGain(hasGain(band.type) ? band.gain : 0, bounds.height) - y,
        ),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (!nearest || nearest.distance > 28) return;
    setSelectedBandId(nearest.band.id);
    updateBand(nearest.band.id, { dynamic: !nearest.band.dynamic });
  };
  const updateSelected = (patch: Partial<EqBand>) => {
    if (selectedBand) updateBand(selectedBand.id, patch);
  };
  const frequencyKnob = selectedBand ? Math.log(selectedBand.frequency / 20) / Math.log(1000) : 0;
  const formatFrequency = (value: number) => {
    const frequency = 20 * Math.pow(1000, value);
    return frequency >= 1000
      ? `${(frequency / 1000).toFixed(2)} kHz`
      : `${Math.round(frequency)} Hz`;
  };

  return (
    <div className="mb-3 overflow-hidden rounded border border-slate-600/70 bg-[#07111c]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700/80 px-3 py-2">
        <div>
          <div className="text-[9px] tracking-[0.18em] text-slate-300">
            PARAMETRIC EQ · MULTI-BAND
          </div>
          <div className="mt-1 text-[8px] text-slate-500">
            Click the response to add a bell; drag handles to shape.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-slate-500">
            {bands.length}/{MAX_PARAMETRIC_BANDS} BANDS
          </span>
          <button
            className="daw-btn h-7 px-2 text-[9px] text-primary"
            disabled={bands.length >= MAX_PARAMETRIC_BANDS}
            onClick={() => addBand(1000, 0)}
          >
            + ADD BAND
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        aria-label="Parametric EQ spectrum graph; click to add bands and drag existing bands"
        className="h-60 w-full cursor-crosshair touch-none"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={() => {
          dragBandId.current = null;
        }}
        onPointerCancel={() => {
          dragBandId.current = null;
        }}
        onContextMenu={pointerContextMenu}
      />
      {selectedBand ? (
        <div className="border-t border-slate-700/80 bg-[#0a1521] p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[9px] tracking-wider text-slate-400">SELECTED BAND</span>
              <span className="font-mono text-[9px] text-primary">
                BAND {bands.findIndex((band) => band.id === selectedBand.id) + 1}
              </span>
              <label className="flex items-center gap-1 text-[9px] text-slate-400">
                <input
                  type="checkbox"
                  checked={selectedBand.enabled}
                  onChange={(event) => updateSelected({ enabled: event.target.checked })}
                />
                ENABLED
              </label>
            </div>
            <button
              className="daw-btn h-6 px-2 text-[9px] text-destructive"
              onClick={() => {
                const next = bands.filter((band) => band.id !== selectedBand.id);
                onChange({ eqBands: next });
                setSelectedBandId(next[0]?.id ?? null);
              }}
            >
              REMOVE BAND
            </button>
          </div>
          <div className="mb-3 max-w-xs">
            <label className="text-[8px] tracking-wider text-slate-500">FILTER TYPE</label>
            <select
              value={selectedBand.type}
              onChange={(event) => {
                const type = eqBandTypes.find(
                  ([candidate]) => candidate === event.target.value,
                )?.[0];
                if (type) updateSelected({ type });
              }}
              className="mt-1 w-full rounded-sm border border-slate-600 bg-[#07111c] px-2 py-1.5 text-[10px] text-slate-100"
            >
              {eqBandTypes.map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {hasGain(selectedBand.type) && (
            <div className="mb-3 w-full rounded border border-amber-300/20 bg-amber-200/5 p-2">
              <label className="flex items-center gap-2 text-[9px] tracking-wider text-amber-100/80">
                <input
                  type="checkbox"
                  checked={selectedBand.dynamic}
                  onChange={(event) => updateSelected({ dynamic: event.target.checked })}
                  className="accent-amber-300"
                />
                DYNAMIC EQ
              </label>
              <div className="mt-1 text-[8px] leading-relaxed text-slate-500">
                Adds frequency-selective attenuation above the threshold. Right-click a graph node
                to toggle dynamic mode.
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-start gap-2">
            <Slider
              label="Frequency"
              value={frequencyKnob}
              min={0}
              max={1}
              step={0.001}
              onChange={(value) => updateSelected({ frequency: 20 * Math.pow(1000, value) })}
              fmt={formatFrequency}
            />
            {hasGain(selectedBand.type) && (
              <Slider
                label="Gain"
                value={selectedBand.gain}
                min={-18}
                max={18}
                step={0.1}
                onChange={(gain) => updateSelected({ gain })}
                fmt={(value) => `${value.toFixed(1)} dB`}
              />
            )}
            <Slider
              label="Q"
              value={selectedBand.q}
              min={0.1}
              max={18}
              step={0.1}
              onChange={(q) => updateSelected({ q })}
              fmt={(value) => value.toFixed(1)}
            />
            {selectedBand.dynamic && hasGain(selectedBand.type) && (
              <>
                <Slider
                  label="Dynamic threshold"
                  value={selectedBand.thresholdDb}
                  min={-60}
                  max={0}
                  step={0.5}
                  onChange={(thresholdDb) => updateSelected({ thresholdDb })}
                  fmt={(value) => `${value.toFixed(1)} dB`}
                />
                <Slider
                  label="Max dynamic cut"
                  value={selectedBand.rangeDb}
                  min={0}
                  max={18}
                  step={0.1}
                  onChange={(rangeDb) => updateSelected({ rangeDb })}
                  fmt={(value) => `${value.toFixed(1)} dB`}
                />
                <Slider
                  label="Attack"
                  value={selectedBand.attack}
                  min={0.001}
                  max={0.2}
                  step={0.001}
                  onChange={(attack) => updateSelected({ attack })}
                  fmt={(value) => `${Math.round(value * 1000)} ms`}
                />
                <Slider
                  label="Release"
                  value={selectedBand.release}
                  min={0.01}
                  max={1}
                  step={0.01}
                  onChange={(release) => updateSelected({ release })}
                  fmt={(value) => `${Math.round(value * 1000)} ms`}
                />
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="border-t border-slate-700/80 px-3 py-4 text-center text-[10px] text-slate-500">
          Click the graph or Add Band to create your first filter.
        </div>
      )}
    </div>
  );
}

function KCompressorFaceplate({
  model,
  enabled,
  reduction,
  fx,
  onChange,
}: {
  model: "K-2A" | "K-76";
  enabled: boolean;
  reduction: number;
  fx: Fx;
  onChange: (patch: Partial<Fx>) => void;
}) {
  const isOptical = model === "K-2A";
  const meterWidth = Math.min(100, (reduction / 18) * 100);
  const meterNeedle = -38 + Math.min(76, reduction * 4.2);
  const accent = isOptical ? "#d9b56d" : "#71d6d0";
  return (
    <div
      className="mb-3 overflow-hidden rounded border p-3 shadow-[inset_0_1px_rgb(255_255_255_/_10%),0_12px_30px_rgb(0_0_0_/_30%)]"
      style={{
        borderColor: `${accent}66`,
        background: isOptical
          ? "linear-gradient(145deg,#302d27 0%,#171a1d 42%,#0b1015 100%)"
          : "linear-gradient(145deg,#17272c 0%,#0c161b 45%,#081015 100%)",
      }}
    >
      <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: `${accent}44` }}>
        <div>
          <div className="font-display text-[15px] tracking-[0.22em]" style={{ color: accent }}>
            KREATIVE {model}
          </div>
          <div className="mt-1 text-[8px] tracking-[0.18em] text-slate-400">
            {isOptical ? "VARIABLE-MU LEVEL CONTROL" : "FET PEAK CONTROL"} · ORIGINAL KREATIVE VOICING
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[9px]" style={{ color: accent }}>
            {enabled ? "ACTIVE" : "BYPASS"}
          </div>
          <div className="mt-1 text-[8px] tracking-wider text-slate-500">LIVE BROWSER DSP</div>
        </div>
      </div>
      <div className="grid items-center gap-3 py-3 sm:grid-cols-[1fr_1.4fr_1fr]">
        <div className="flex flex-wrap justify-center gap-2 rounded border border-white/10 bg-black/25 p-2">
          <Slider
            label={isOptical ? "Gain reduction" : "Input drive"}
            value={fx.compThreshold}
            min={-50}
            max={0}
            onChange={(value) => onChange({ compThreshold: value })}
            fmt={(value) => `${value.toFixed(1)} dB`}
          />
          <Slider
            label={isOptical ? "Gain" : "Output"}
            value={fx.compMakeup}
            min={-12}
            max={18}
            onChange={(value) => onChange({ compMakeup: value })}
            fmt={(value) => `${value.toFixed(1)} dB`}
          />
        </div>
        <div className="rounded border border-white/10 bg-black/30 p-2">
          <div className="mb-2 flex justify-between text-[8px] tracking-wider text-slate-400">
            <span>{isOptical ? "VU / REDUCTION" : "GAIN REDUCTION"}</span>
            <span className="font-mono" style={{ color: accent }}>{reduction.toFixed(1)} dB</span>
          </div>
          <div className="relative h-20 overflow-hidden rounded-sm border border-black/70 bg-[#d4c79b] shadow-inner">
            <div className="absolute inset-x-3 bottom-3 h-8 rounded-[50%] border border-black/40 bg-[#eee6b9]" />
            <div
              className="absolute bottom-6 left-1/2 h-7 w-px origin-bottom bg-[#392e25] transition-transform duration-100"
              style={{ transform: `translateX(-50%) rotate(${meterNeedle}deg)` }}
            />
            <div className="absolute inset-x-2 top-2 flex justify-between font-mono text-[7px] text-[#594d3a]">
              <span>-20</span><span>-10</span><span>0</span><span>+3</span>
            </div>
            <div className="absolute bottom-1 left-0 right-0 text-center text-[6px] font-semibold tracking-widest text-[#594d3a]">
              {isOptical ? "KREATIVE METER" : "GR"}
            </div>
          </div>
          <div className="relative mt-2 h-3 overflow-hidden rounded-sm bg-slate-950">
            <div
              className="absolute inset-y-0 left-0 transition-[width] duration-100"
              style={{ width: `${meterWidth}%`, background: accent }}
            />
            <div className="absolute inset-0 flex justify-between px-1">
              {Array.from({ length: 9 }, (_, index) => (
                <i key={index} className="h-full w-px bg-black/45" />
              ))}
            </div>
          </div>
          <div className="mt-1 flex justify-between font-mono text-[8px] text-slate-500">
            <span>0</span><span>6</span><span>12</span><span>18 dB</span>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2 rounded border border-white/10 bg-black/25 p-2">
          {isOptical ? (
            <>
              <Slider label="Response" value={fx.compRelease} min={0.05} max={1} step={0.01} onChange={(value) => onChange({ compRelease: value })} fmt={(value) => `${Math.round(value * 1000)} ms`} />
              <Slider label="Blend" value={fx.compMix} min={0} max={1} step={0.01} onChange={(value) => onChange({ compMix: value })} fmt={(value) => `${Math.round(value * 100)}%`} />
            </>
          ) : (
            <>
              <Slider
                label="Ratio"
                value={fx.compRatio}
                min={2}
                max={20}
                step={1}
                onChange={(value) => onChange({ compRatio: value })}
                fmt={(value) => `${value.toFixed(0)}:1`}
              />
              <Slider
                label="Attack"
                value={fx.compAttack}
                min={0.001}
                max={0.2}
                step={0.001}
                onChange={(value) => onChange({ compAttack: value })}
                fmt={(value) => `${Math.round(value * 1000)} ms`}
              />
              <Slider
                label="Release"
                value={fx.compRelease}
                min={0.01}
                max={1}
                step={0.01}
                onChange={(value) => onChange({ compRelease: value })}
                fmt={(value) => `${Math.round(value * 1000)} ms`}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function KImagerFaceplate({
  track,
  onChange,
}: {
  track: TrackState;
  onChange: (patch: Partial<Fx>) => void;
}) {
  const width = track.fx.width;
  const balance = track.fx.imagerBalance;
  const rotation = track.fx.imagerRotation;
  const mono = track.fx.imagerMono;
  const spread = Math.max(8, Math.min(94, width * 42));
  return (
    <div className="mb-3 overflow-hidden rounded border border-primary/35 bg-[#101923] p-3 shadow-[inset_0_1px_rgb(255_255_255_/_8%),0_12px_30px_rgb(0_0_0_/_25%)]">
      <div className="flex items-center justify-between border-b border-primary/20 pb-2">
        <div>
          <div className="font-display text-[15px] tracking-[0.22em] text-primary">K1-IMAGER</div>
          <div className="mt-1 text-[8px] tracking-[0.18em] text-slate-400">
            KREATIVE STEREO FIELD · MID / SIDE UTILITY
          </div>
        </div>
        <div className="text-right font-mono text-[9px] text-primary">
          WIDTH {width.toFixed(2)} · MONO {Math.round(mono * 100)}%
        </div>
      </div>
      <div className="grid items-center gap-3 py-3 sm:grid-cols-[1.4fr_1fr]">
        <div className="rounded border border-slate-700 bg-[#08111b] p-2">
          <svg
            viewBox="0 0 520 170"
            className="h-36 w-full"
            role="img"
            aria-label="Stereo field preview"
          >
            <path d="M260 12V158M22 85H498" stroke="rgba(135,160,185,.2)" />
            <path
              d={`M260 85L${260 - spread * 2.35} ${40 + Math.abs(balance) * 35}L260 85L${260 + spread * 2.35} ${40 + Math.abs(balance) * 35}Z`}
              fill="rgba(95,209,238,.18)"
              stroke="var(--primary)"
              strokeWidth="2"
            />
            <circle cx={260 - balance * 120} cy="85" r="5" fill="#d7f7ff" />
            <text x="12" y="18" fill="#7f93a5" fontSize="10">
              LEFT
            </text>
            <text x="458" y="18" fill="#7f93a5" fontSize="10">
              RIGHT
            </text>
            <text x="238" y="164" fill="#7f93a5" fontSize="10">
              MONO
            </text>
          </svg>
        </div>
        <div className="flex flex-wrap justify-center gap-x-2 gap-y-3">
          <Slider
            label="Width"
            value={width}
            min={0}
            max={2}
            step={0.01}
            onChange={(value) => onChange({ width: value })}
            fmt={(value) => `${value.toFixed(2)}x`}
          />
          <Slider
            label="Balance"
            value={balance}
            min={-1}
            max={1}
            step={0.01}
            onChange={(value) => onChange({ imagerBalance: value })}
            fmt={(value) =>
              Math.abs(value) < 0.01
                ? "C"
                : `${Math.round(Math.abs(value) * 100)}${value < 0 ? "L" : "R"}`
            }
          />
          <Slider
            label="Rotation"
            value={rotation}
            min={-90}
            max={90}
            step={1}
            onChange={(value) => onChange({ imagerRotation: value })}
            fmt={(value) => `${Math.round(value)}°`}
          />
          <Slider
            label="Mono blend"
            value={mono}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => onChange({ imagerMono: value })}
            fmt={(value) => `${Math.round(value * 100)}%`}
          />
        </div>
      </div>
      <div className="flex justify-between border-t border-primary/20 pt-2 text-[8px] tracking-wider text-slate-500">
        <span>SAFE WIDTH CONTROL · CHECK IN MONO</span>
        <span>ORIGINAL KREATIVE DESIGN</span>
      </div>
    </div>
  );
}

function CompressorMeters({
  trackId,
  pluginName,
  enabled,
  fx,
  onChange,
}: {
  trackId: string;
  pluginName: string;
  enabled: boolean;
  fx: Fx;
  onChange: (patch: Partial<Fx>) => void;
}) {
  const [meter, setMeter] = useState({ peak: -90, rms: -90, reduction: 0 });
  useEffect(() => {
    const timer = window.setInterval(() => {
      const { peak, rms } = engine.level(trackId);
      setMeter({ peak, rms, reduction: engine.compressorReduction(trackId) });
    }, 80);
    return () => window.clearInterval(timer);
  }, [trackId]);
  const reduction = Math.max(0, Math.min(18, meter.reduction));
  return (
    <>
      {(pluginName === "K-2A" || pluginName === "K-76") && (
        <KCompressorFaceplate
          model={pluginName}
          enabled={enabled}
          reduction={reduction}
          fx={fx}
          onChange={onChange}
        />
      )}
      {pluginName !== "K-2A" && pluginName !== "K-76" && (
      <div className="mb-3 grid grid-cols-[1fr_1.5fr] gap-2 rounded border border-slate-600/70 bg-[#07111c] p-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-slate-700 bg-[#050b12] p-2">
            <div className="text-[8px] tracking-wider text-slate-500">OUTPUT PEAK</div>
            <div className="mt-1 font-mono text-sm text-lcd">
              {meter.peak <= -89 ? "-∞" : meter.peak.toFixed(1)}
              <span className="ml-1 text-[8px]">dBFS</span>
            </div>
          </div>
          <div className="rounded border border-slate-700 bg-[#050b12] p-2">
            <div className="text-[8px] tracking-wider text-slate-500">OUTPUT RMS</div>
            <div className="mt-1 font-mono text-sm text-lcd">
              {meter.rms <= -89 ? "-∞" : meter.rms.toFixed(1)}
              <span className="ml-1 text-[8px]">dBFS</span>
            </div>
          </div>
        </div>
        <div className="rounded border border-slate-700 bg-[#050b12] p-2">
          <div className="mb-2 flex justify-between text-[8px] tracking-wider text-slate-400">
            <span>GAIN REDUCTION</span>
            <span className="font-mono text-meter-mid">{meter.reduction.toFixed(1)} dB</span>
          </div>
          <div className="relative h-3 overflow-hidden rounded-sm bg-slate-900">
            <div className="absolute inset-0 flex justify-between">
              {Array.from({ length: 18 }, (_, i) => (
                <i key={i} className="h-full w-px bg-black/70" />
              ))}
            </div>
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-meter-low via-meter-mid to-meter-high transition-[width] duration-100"
              style={{ width: `${(reduction / 18) * 100}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[8px] text-slate-500">
            <span>0</span>
            <span>6</span>
            <span>12</span>
            <span>18 dB</span>
          </div>
        </div>
      </div>
      )}
    </>
  );
}

const PITCH_NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const pitchNoteName = (midi: number) =>
  `${PITCH_NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12]}${Math.floor(Math.round(midi) / 12) - 1}`;

function PitchCorrectionDisplay({ track }: { track: TrackState }) {
  const [readout, setReadout] = useState(engine.pitchReadout(track.id));
  useEffect(() => {
    if (!track.fx.pitchOn) {
      setReadout(null);
      return;
    }
    const timer = window.setInterval(() => setReadout(engine.pitchReadout(track.id)), 80);
    return () => window.clearInterval(timer);
  }, [track.id, track.fx.pitchOn]);
  const detected = readout?.detectedMidi ?? 0;
  const target = readout?.targetMidi ?? 0;
  const cents = readout?.cents ?? 0;
  const indicator = `${50 + Math.max(-100, Math.min(100, cents)) / 2}%`;
  const selectedKey = PITCH_NOTE_NAMES[track.fx.pitchKey] ?? "C";
  const scaleName = ["Chromatic", "Major", "Minor", "Major pentatonic", "Minor pentatonic"][
    track.fx.pitchScale
  ];

  return (
    <div className="mb-3 overflow-hidden rounded border border-slate-600/70 bg-[#07111c] p-3">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[9px] tracking-[0.18em] text-slate-400">PITCH TRACKER · LIVE</div>
          <div className="mt-1 text-[8px] text-slate-600">MONOPHONIC INPUT · BROWSER DSP</div>
        </div>
        <div className="rounded border border-primary/30 bg-primary/5 px-2 py-1 text-[8px] text-primary">
          {selectedKey} {scaleName}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-slate-700 bg-[#050b12] p-2 text-center">
          <div className="text-[8px] tracking-wider text-slate-500">DETECTED</div>
          <div className="mt-1 font-mono text-lg text-sky-300">
            {detected > 0 ? pitchNoteName(detected) : "—"}
          </div>
        </div>
        <div className="rounded border border-slate-700 bg-[#050b12] p-2 text-center">
          <div className="text-[8px] tracking-wider text-slate-500">TARGET</div>
          <div className="mt-1 font-mono text-lg text-lcd">
            {target > 0 ? pitchNoteName(target) : "—"}
          </div>
        </div>
      </div>
      <div className="mt-3 rounded border border-slate-700 bg-[#050b12] p-2">
        <div className="mb-2 flex justify-between text-[8px] tracking-wider text-slate-500">
          <span>INPUT DEVIATION</span>
          <span className="font-mono text-primary">
            {cents >= 0 ? "+" : ""}
            {cents.toFixed(0)} CENT
          </span>
        </div>
        <div className="relative h-2 rounded bg-slate-900">
          <div className="absolute inset-y-0 left-1/2 w-px bg-slate-400/60" />
          <div
            className="absolute inset-y-0 w-1.5 -translate-x-1/2 rounded bg-primary shadow-[0_0_8px_var(--primary)]"
            style={{ left: indicator }}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[8px] text-slate-600">
          <span>-100</span>
          <span>0</span>
          <span>+100¢</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-12 gap-0.5">
        {PITCH_NOTE_NAMES.map((name, index) => {
          const noteInScale =
            track.fx.pitchScale === 0 ||
            (track.fx.pitchScale === 1 &&
              [0, 2, 4, 5, 7, 9, 11].includes((index - track.fx.pitchKey + 12) % 12)) ||
            (track.fx.pitchScale === 2 &&
              [0, 2, 3, 5, 7, 8, 10].includes((index - track.fx.pitchKey + 12) % 12)) ||
            (track.fx.pitchScale === 3 &&
              [0, 2, 4, 7, 9].includes((index - track.fx.pitchKey + 12) % 12)) ||
            (track.fx.pitchScale === 4 &&
              [0, 3, 5, 7, 10].includes((index - track.fx.pitchKey + 12) % 12));
          return (
            <div
              key={name}
              className={`rounded-sm py-1 text-center font-mono text-[7px] ${noteInScale ? "bg-slate-700 text-slate-200" : "bg-slate-900 text-slate-700"}`}
            >
              {name}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SpaceDisplay({ track, family }: { track: TrackState; family: "reverb" | "delay" }) {
  const isReverb = family === "reverb";
  const taps = Array.from({ length: 7 }, (_, index) => ({
    time: track.fx.delayTime * (index + 1),
    level: Math.pow(track.fx.delayFeedback, index + 1),
  })).filter((tap) => tap.time <= 1.5);
  return (
    <div className="mb-3 overflow-hidden rounded border border-slate-600/70 bg-[#07111c] p-3">
      <div className="mb-3 flex justify-between text-[9px] tracking-[0.16em] text-slate-400">
        <span>
          {isReverb ? "ROOM FIELD · EARLY REFLECTIONS / TAIL" : "REPEAT MAP · FEEDBACK / TIME"}
        </span>
        <span className="font-mono text-primary">
          {isReverb
            ? `${Math.round(track.fx.reverbSize * 100)}% SIZE`
            : `${Math.round(track.fx.delayTime * 1000)} ms`}
        </span>
      </div>
      {isReverb ? (
        <svg
          viewBox="0 0 600 118"
          className="h-28 w-full"
          role="img"
          aria-label="Reverb reflection and decay visualization"
        >
          <path d="M0 100H600M0 70H600M0 40H600" stroke="rgba(135,160,185,.16)" />
          <path
            d={`M0 105H${12 + track.fx.reverbPreDelay * 700}`}
            stroke="#49c6ef"
            strokeWidth="2"
          />
          {Array.from({ length: 7 }, (_, index) => {
            const x = 18 + track.fx.reverbPreDelay * 700 + index * (14 + track.fx.reverbSize * 12);
            const height = 18 + track.fx.reverbSize * 30;
            const opacity = Math.max(0.15, 1 - index * 0.12);
            return (
              <path
                key={index}
                d={`M${x} 105V${105 - height * opacity}`}
                stroke="#49c6ef"
                strokeWidth="2"
                opacity={opacity}
              />
            );
          })}
          <path
            d={`M${30 + track.fx.reverbPreDelay * 700} 100 C140 25 210 40 310 58 S470 88 600 96`}
            fill="none"
            stroke="#a6e65c"
            strokeWidth="2.5"
          />
          <text x="4" y="116" fill="#8ba0b4" fontSize="9">
            0 ms
          </text>
          <text x="545" y="116" fill="#8ba0b4" fontSize="9">
            2.5 s tail
          </text>
        </svg>
      ) : (
        <div className="relative h-28 border-b border-l border-slate-600">
          <div className="absolute inset-x-0 bottom-0 border-t border-dashed border-slate-700" />
          <div className="absolute bottom-0 left-0 h-full border-l border-dashed border-slate-700" />
          {taps.map((tap, index) => (
            <div
              key={index}
              className={`absolute bottom-0 w-1.5 -translate-x-1/2 rounded-t ${index % 2 ? "bg-fuchsia-400" : "bg-sky-400"}`}
              style={{
                left: `${(tap.time / 1.5) * 100}%`,
                height: `${Math.max(8, tap.level * 100)}%`,
              }}
              title={`Repeat ${index + 1}: ${(tap.time * 1000).toFixed(0)} ms`}
            />
          ))}
          <div
            className="absolute bottom-0 left-0 w-1.5 bg-meter-low"
            style={{ height: "100%" }}
            title="Dry signal"
          />
        </div>
      )}
      <div className="mt-2 flex justify-between font-mono text-[8px] text-slate-500">
        <span>{isReverb ? `PRE ${Math.round(track.fx.reverbPreDelay * 1000)} ms` : "DRY"}</span>
        <span>
          {isReverb
            ? `${Math.round(track.fx.reverbTone / 1000)} kHz DAMPING`
            : `${Math.round(track.fx.delayFeedback * 100)}% FEEDBACK`}
        </span>
        <span>{isReverb ? "DIFFUSE TAIL" : "1.5 s WINDOW"}</span>
      </div>
    </div>
  );
}

function ModulationScope({ track }: { track: TrackState }) {
  const { modWaveform, modDepth, modRate } = track.fx;
  const points = Array.from({ length: 100 }, (_, index) => {
    const phase = (index / 99) * Math.PI * 2;
    const wave =
      modWaveform === "square"
        ? Math.sign(Math.sin(phase))
        : modWaveform === "sawtooth"
          ? 1 - 2 * (index / 99)
          : modWaveform === "triangle"
            ? (2 / Math.PI) * Math.asin(Math.sin(phase))
            : Math.sin(phase);
    return `${index === 0 ? "M" : "L"}${(index / 99) * 600} ${50 - wave * modDepth * 38}`;
  }).join(" ");
  return (
    <div className="mb-3 overflow-hidden rounded border border-slate-600/70 bg-[#07111c] p-3">
      <div className="mb-2 flex justify-between text-[9px] tracking-[0.16em] text-slate-400">
        <span>MODULATION SCOPE</span>
        <span className="font-mono text-primary">
          {modWaveform.toUpperCase()} · {modRate.toFixed(2)} Hz
        </span>
      </div>
      <svg
        viewBox="0 0 600 100"
        className="h-24 w-full"
        role="img"
        aria-label="Modulation waveform preview"
      >
        <path d="M0 50H600M0 15H600M0 85H600" stroke="rgba(135,160,185,.16)" />
        <path d={points} fill="none" stroke="#48c5ef" strokeWidth="2.5" />
      </svg>
    </div>
  );
}

function VintageRiderFaceplate({
  enabled,
  gain,
  target,
}: {
  enabled: boolean;
  gain: number;
  target: number;
}) {
  const angle = -68 + (Math.max(-18, Math.min(18, gain)) / 18) * 68;
  return (
    <div className="smoothen-faceplate mb-3 overflow-hidden rounded-lg border border-[#786b52] p-3 sm:p-4">
      <div className="relative z-10 flex items-center justify-between border-b border-amber-100/15 pb-2">
        <div>
          <div className="font-display text-[12px] tracking-[0.22em] text-[#ead8ab]">
            KREATIVE · SMOOTHEN
          </div>
          <div className="mt-1 text-[8px] tracking-[0.2em] text-[#a99b7e]">
            VOCAL LEVEL RIDER · HARDWARE-INSPIRED EDITION
          </div>
        </div>
        <div className="flex items-center gap-2 text-[8px] tracking-wider text-[#c6b896]">
          <span
            className={`h-2 w-2 rounded-full ${enabled ? "bg-lime-300 shadow-[0_0_9px_#b8ff72]" : "bg-stone-600"}`}
          />
          {enabled ? "RIDE ACTIVE" : "BYPASS"}
        </div>
      </div>
      <div className="relative z-10 grid items-center gap-3 py-3 sm:grid-cols-[1fr_1.25fr_1fr]">
        <div className="rounded border border-black/60 bg-[#171914]/80 p-2 text-center shadow-inner">
          <div className="text-[8px] tracking-[0.16em] text-[#9b9d82]">TARGET LEVEL</div>
          <div className="mt-1 font-mono text-xl text-[#caff8b]">
            {target.toFixed(1)} <span className="text-[9px]">dBFS</span>
          </div>
          <div className="mt-1 text-[8px] text-[#77816d]">AUTO GAIN REFERENCE</div>
        </div>
        <div className="mx-auto w-full max-w-[280px] rounded-[50%] border border-[#6a624d] bg-[#151813] px-2 pt-2 shadow-[inset_0_2px_14px_rgba(0,0,0,.85)]">
          <svg
            viewBox="0 0 280 145"
            className="w-full"
            role="img"
            aria-label={`Smoothen gain ride ${gain.toFixed(1)} dB`}
          >
            <path d="M24 126 A116 116 0 0 1 256 126" fill="none" stroke="#887c5d" strokeWidth="2" />
            {Array.from({ length: 13 }, (_, index) => {
              const tickAngle = -75 + index * 12.5;
              const radians = (tickAngle * Math.PI) / 180;
              const x1 = 140 + Math.sin(radians) * 94;
              const y1 = 126 - Math.cos(radians) * 94;
              const x2 = 140 + Math.sin(radians) * 105;
              const y2 = 126 - Math.cos(radians) * 105;
              return (
                <path
                  key={index}
                  d={`M${x1} ${y1}L${x2} ${y2}`}
                  stroke="#d1c49e"
                  strokeWidth={index === 6 ? 2 : 1}
                  opacity=".8"
                />
              );
            })}
            <text x="33" y="112" fill="#c1b48f" fontSize="10">
              -18
            </text>
            <text x="136" y="27" fill="#c1b48f" fontSize="10">
              0
            </text>
            <text x="230" y="112" fill="#c1b48f" fontSize="10">
              +18
            </text>
            <g transform={`translate(140 126) rotate(${angle})`}>
              <path d="M0 6L-3 0L0 -82L3 0Z" fill="#e95743" />
              <circle r="7" fill="#b3a37a" stroke="#28261f" strokeWidth="2" />
            </g>
            <path d="M85 139H195" stroke="#554d3c" strokeWidth="7" strokeLinecap="round" />
            <text x="107" y="142" fill="#dfd1ad" fontSize="9" letterSpacing="2">
              GAIN RIDE
            </text>
          </svg>
        </div>
        <div className="rounded border border-black/60 bg-[#171914]/80 p-2 text-center shadow-inner">
          <div className="text-[8px] tracking-[0.16em] text-[#9b9d82]">AUTO CORRECTION</div>
          <div className="mt-1 font-mono text-xl text-[#e7d3a2]">
            {gain >= 0 ? "+" : ""}
            {gain.toFixed(1)} <span className="text-[9px]">dB</span>
          </div>
          <div className="mt-1 text-[8px] text-[#77816d]">
            {enabled ? "SMOOTH, BOUNDED RIDES" : "PROCESSING BYPASSED"}
          </div>
        </div>
      </div>
      <div className="relative z-10 flex items-center justify-between border-t border-amber-100/15 pt-2 text-[8px] tracking-wider text-[#a99b7e]">
        <span>INPUT TRACK · {enabled ? "FOLLOWING LEVEL" : "IDLE"}</span>
        <span>ANALOG-STYLE FACEPLATE · KREATIVE DSP</span>
      </div>
    </div>
  );
}

export function PluginWindow({
  track,
  slot,
  pluginName,
  onFxChange,
  onTrackChange,
  onReplace,
  onRemove,
  onClose,
}: {
  track: TrackState;
  slot: number;
  pluginName: string;
  onFxChange: (patch: Partial<Fx>) => void;
  onTrackChange: (patch: Partial<TrackState>) => void;
  onReplace: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const entry = getPluginEntry(pluginName);
  const family = getPluginFamily(pluginName);
  const section = family ? EDITOR_SECTIONS[family] : undefined;
  const pluginActive = family ? !track.pluginBypass[family] : true;
  const [riderGain, setRiderGain] = useState(0);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [sizePercent, setSizePercent] = useState(DEFAULT_PLUGIN_SIZE);
  const dragOrigin = useRef<{ pointerX: number; pointerY: number; x: number; y: number } | null>(
    null,
  );
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [userPresetsOpen, setUserPresetsOpen] = useState(false);
  const [userPresets, setUserPresets] = useState<UserPluginPreset[]>([]);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const factoryPresets = getFactoryPluginPresets(pluginName);
  const defaultSettings = getPluginSettings(pluginName) ?? {};

  useEffect(() => {
    setUserPresets(getUserPluginPresets(pluginName));
    setPresetMenuOpen(false);
    setUserPresetsOpen(false);
    setSavingPreset(false);
    setPresetName("");
    setDragOffset({ x: 0, y: 0 });
    setSizePercent(DEFAULT_PLUGIN_SIZE);
  }, [pluginName, track.id, slot]);

  const applyPreset = (settings: Partial<Fx>) => {
    onFxChange({ ...defaultSettings, ...settings });
    setPresetMenuOpen(false);
    setUserPresetsOpen(false);
    toast.success("Plugin preset loaded");
  };

  const saveCurrentPreset = () => {
    const name = presetName.trim();
    if (!name) {
      toast.error("Enter a name for your preset.");
      return;
    }
    const keys = Object.keys(defaultSettings) as (keyof Fx)[];
    const settings = Object.fromEntries(keys.map((key) => [key, track.fx[key]])) as Partial<Fx>;
    const preset: UserPluginPreset = {
      id: crypto.randomUUID(),
      name,
      settings,
    };
    try {
      setUserPresets(saveUserPluginPreset(pluginName, preset));
      setPresetName("");
      setSavingPreset(false);
      toast.success(`Saved "${name}" to your ${pluginName} presets`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save this preset.");
    }
  };

  const deleteUserPreset = (presetId: string) => {
    try {
      setUserPresets(removeUserPluginPreset(pluginName, presetId));
      toast.success("User preset removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove this preset.");
    }
  };

  useEffect(() => {
    if (family !== "smoothen" || !track.fx.smoothenOn) {
      setRiderGain(0);
      return;
    }
    const timer = window.setInterval(() => setRiderGain(engine.riderGainDb(track.id)), 100);
    return () => window.clearInterval(timer);
  }, [family, track.fx.smoothenOn, track.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!section) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="plugin-window-title"
        className={`plugin-window plugin-window-realistic pointer-events-auto fixed flex max-h-[88vh] w-[min(1024px,calc(100vw-24px))] flex-col overflow-visible rounded-md border border-border bg-panel shadow-overlay ${family === "smoothen" ? "plugin-window-vintage" : ""}`}
        style={{
          left: "50%",
          top: "50%",
          transform: `translate(calc(-50% + ${dragOffset.x}px), calc(-50% + ${dragOffset.y}px)) scale(${sizePercent / 100})`,
        }}
      >
        <header
          className="plugin-window-titlebar flex min-h-12 items-center gap-3 border-b bg-panel-2 px-3"
          onPointerDown={(event) => {
            if (event.target instanceof Element && event.target.closest("button")) return;
            dragOrigin.current = {
              pointerX: event.clientX,
              pointerY: event.clientY,
              x: dragOffset.x,
              y: dragOffset.y,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const origin = dragOrigin.current;
            if (!origin) return;
            const maxX = Math.max(0, window.innerWidth / 2 - 100);
            const maxY = Math.max(0, window.innerHeight / 2 - 64);
            setDragOffset({
              x: Math.max(-maxX, Math.min(maxX, origin.x + event.clientX - origin.pointerX)),
              y: Math.max(-maxY, Math.min(maxY, origin.y + event.clientY - origin.pointerY)),
            });
          }}
          onPointerUp={() => {
            dragOrigin.current = null;
          }}
          onPointerCancel={() => {
            dragOrigin.current = null;
          }}
          title="Drag to move plugin window"
        >
          <div className="grid h-7 w-7 place-items-center rounded-sm border border-primary/40 bg-primary/10 font-display text-[10px] text-primary">
            K
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="plugin-window-title"
              className="truncate text-[11px] font-medium tracking-wider"
            >
              {pluginName.toUpperCase()}
            </h2>
            <div className="text-[9px] text-muted-foreground">
              {entry?.category.toUpperCase()} · {track.name} · INSERT{" "}
              {String(slot + 1).padStart(2, "0")}
            </div>
          </div>
          <button
            className="daw-btn hidden h-7 items-center gap-1 px-2 text-[9px] sm:flex"
            onClick={onReplace}
          >
            <Replace className="h-3 w-3" />
            Replace
          </button>
          <button
            className={`daw-btn flex h-7 items-center gap-1.5 px-2 text-[9px] ${
              pluginActive
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-destructive/50 bg-destructive/10 text-destructive"
            }`}
            aria-pressed={pluginActive}
            aria-label={`${pluginName} ${pluginActive ? "active" : "bypassed"}`}
            title={`${pluginActive ? "Bypass" : "Activate"} ${pluginName}`}
            onClick={() => {
              if (!family) return;
              onTrackChange({
                pluginBypass: { ...track.pluginBypass, [family]: pluginActive },
              });
            }}
          >
            <Power className="h-3 w-3" />
            {pluginActive ? "ACTIVE" : "BYPASS"}
          </button>
          <button
            className="daw-btn grid h-7 w-7 place-items-center text-destructive"
            onClick={onRemove}
            aria-label="Remove plugin"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="daw-btn grid h-7 w-7 place-items-center"
            onClick={onClose}
            aria-label="Close plugin window"
            title="Close plugin window"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>
        <div className="relative z-20 flex min-h-11 flex-wrap items-center gap-2 border-b bg-background/80 px-3 py-1.5">
          <div className="relative">
            <button
              className="daw-btn flex h-7 items-center gap-2 px-2 text-[9px]"
              aria-expanded={presetMenuOpen}
              aria-label={`${pluginName} presets`}
              onClick={() => {
                setPresetMenuOpen((open) => !open);
                setUserPresetsOpen(false);
                setSavingPreset(false);
              }}
            >
              <span className="text-muted-foreground">PRESET</span>
              <span className="max-w-44 truncate text-foreground">Browse presets</span>
              <ChevronDown
                className={`h-3 w-3 transition-transform ${presetMenuOpen ? "rotate-180" : ""}`}
              />
            </button>
            {presetMenuOpen && (
              <div className="absolute left-0 top-[calc(100%+5px)] z-[70] w-64 rounded border border-border bg-panel shadow-overlay">
                <div className="border-b px-3 py-2 text-[8px] tracking-[0.18em] text-muted-foreground">
                  FACTORY · SOURCE-BASED STARTING POINTS
                </div>
                <div className="max-h-60 overflow-y-auto p-1">
                  {factoryPresets.map((preset, index) => (
                    <div key={preset.id}>
                      {index === 0 || factoryPresets[index - 1]?.category !== preset.category ? (
                        <div className="px-2 pb-1 pt-2 text-[8px] font-medium tracking-[0.16em] text-primary">
                          {preset.category.toUpperCase()}
                        </div>
                      ) : null}
                      <button
                        title={preset.description}
                        className="block w-full rounded px-2 py-1.5 text-left hover:bg-accent"
                        onClick={() => applyPreset(preset.settings)}
                      >
                        <span className="block text-[10px]">{preset.name}</span>
                        <span className="mt-0.5 block text-[8px] leading-relaxed text-muted-foreground">
                          {preset.description}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="relative border-t p-1">
                  <button
                    className={`flex w-full items-center justify-between rounded px-2 py-2 text-left text-[10px] hover:bg-accent ${userPresetsOpen ? "bg-accent text-foreground" : "text-muted-foreground"}`}
                    aria-expanded={userPresetsOpen}
                    onClick={() => setUserPresetsOpen((open) => !open)}
                  >
                    <span className="flex items-center gap-2">
                      <User className="h-3 w-3" />
                      USER
                      <span className="font-mono text-[8px]">{userPresets.length}</span>
                    </span>
                    <ChevronRight className="h-3 w-3" />
                  </button>
                  {userPresetsOpen && (
                    <div className="absolute left-[calc(100%+5px)] top-0 z-[71] w-56 rounded border border-border bg-panel p-1 shadow-overlay">
                      <div className="border-b px-2 py-2 text-[8px] tracking-[0.16em] text-muted-foreground">
                        YOUR {pluginName.toUpperCase()} PRESETS
                      </div>
                      {userPresets.length ? (
                        <div className="max-h-52 overflow-y-auto">
                          {userPresets.map((preset) => (
                            <div key={preset.id} className="group flex items-center gap-1">
                              <button
                                className="min-w-0 flex-1 truncate rounded px-2 py-2 text-left text-[10px] hover:bg-accent"
                                onClick={() => applyPreset(preset.settings)}
                              >
                                {preset.name}
                              </button>
                              <button
                                className="daw-btn grid h-6 w-6 place-items-center text-destructive opacity-0 group-hover:opacity-100 focus:opacity-100"
                                aria-label={`Delete ${preset.name}`}
                                onClick={() => deleteUserPreset(preset.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="px-2 py-3 text-[9px] text-muted-foreground">
                          No saved presets for this plugin yet.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1" />
          <label className="flex h-7 items-center gap-1.5 text-[8px] tracking-wider text-muted-foreground">
            SIZE
            <select
              aria-label="Plugin size"
              value={sizePercent}
              onChange={(event) => setSizePercent(Number(event.target.value))}
              className="h-7 rounded border bg-panel px-1.5 text-[9px] text-foreground"
            >
              {[25, 50, 75, 100].map((size) => (
                <option key={size} value={size}>
                  {size}%
                </option>
              ))}
            </select>
          </label>
          {savingPreset ? (
            <form
              className="flex items-center gap-1"
              onSubmit={(event) => {
                event.preventDefault();
                saveCurrentPreset();
              }}
            >
              <input
                autoFocus
                aria-label="User preset name"
                placeholder="Name this preset"
                maxLength={48}
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                className="h-7 w-36 rounded border bg-background px-2 text-[9px] outline-none focus:border-primary"
              />
              <button
                className="daw-btn grid h-7 w-7 place-items-center text-primary"
                type="submit"
                aria-label="Save preset"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                className="daw-btn grid h-7 w-7 place-items-center"
                type="button"
                aria-label="Cancel save preset"
                onClick={() => setSavingPreset(false)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </form>
          ) : (
            <button
              className="daw-btn flex h-7 items-center gap-1.5 px-2 text-[9px] text-primary"
              onClick={() => {
                setPresetMenuOpen(false);
                setUserPresetsOpen(false);
                setSavingPreset(true);
              }}
            >
              <Save className="h-3 w-3" />
              SAVE PRESET
            </button>
          )}
        </div>
        <div className="grid min-h-0 flex-1 sm:grid-cols-[180px_minmax(0,1fr)]">
          <aside className="hidden border-r bg-background/50 p-3 sm:block">
            <div className="mb-1 text-[9px] tracking-[0.16em] text-muted-foreground">CHANNEL</div>
            <div className="truncate text-[11px]">{track.name}</div>
            <div className="mt-4 border-t pt-3">
              <div className="mb-1 text-[9px] tracking-[0.16em] text-muted-foreground">
                PROCESSING BLOCK
              </div>
              <div className="text-[10px] capitalize text-primary">{family}</div>
            </div>
            <div className="mt-4 rounded border p-2 text-[9px] leading-relaxed text-muted-foreground">
              Controls update live browser DSP. Slot order is organizational; processing order is
              currently fixed by the engine.
            </div>
          </aside>
          <main className="min-h-0 overflow-y-auto p-3 sm:p-4">
            {family === "smoothen" && (
              <VintageRiderFaceplate
                enabled={track.fx.smoothenOn}
                gain={riderGain}
                target={track.fx.smoothenTarget}
              />
            )}
            {family === "parametricEq" && (
              <ParametricEqEditor track={track} onChange={onFxChange} />
            )}
            {family === "consoleEq" && <ConsoleEqResponse track={track} onChange={onFxChange} />}
            {pluginName === "K1-Imager" && <KImagerFaceplate track={track} onChange={onFxChange} />}
            {family === "compressor" && (
              <CompressorMeters
                trackId={track.id}
                pluginName={pluginName}
                enabled={track.fx.compOn}
                fx={track.fx}
                onChange={onFxChange}
              />
            )}
            {family === "pitchCorrection" && <PitchCorrectionDisplay track={track} />}
            {(family === "reverb" || family === "delay") && (
              <SpaceDisplay track={track} family={family} />
            )}
            {family === "modulation" && <ModulationScope track={track} />}
            {family === "amp" && (
              <div className="amp-model-display mb-3 overflow-hidden rounded border p-3">
                <div className="mb-3 flex items-center justify-between border-b border-amber-100/15 pb-2">
                  <span className="text-[9px] tracking-[0.18em] text-amber-100/70">
                    CIRCUIT VOICING
                  </span>
                  <span className="font-mono text-[9px] text-amber-200/80">
                    {["OFF", "CLASS A", "TWEED", "BRITISH", "HIGH GAIN"][track.fx.ampModel]}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_1.3fr_1fr]">
                  {["PREAMP", "POWER STAGE", "SPEAKER CAB"].map((stage, index) => (
                    <div
                      key={stage}
                      className="rounded border border-black/50 bg-black/25 p-2 text-center shadow-inner"
                    >
                      <div className="mb-2 text-[8px] tracking-widest text-amber-100/60">
                        {stage}
                      </div>
                      <div
                        className={`mx-auto h-9 w-9 rounded-full border border-amber-100/20 ${index === 2 ? "amp-speaker-grille" : "bg-[radial-gradient(circle_at_35%_30%,#d1a666,#574334_42%,#181716_75%)]"}`}
                      />
                      <div className="mt-2 font-mono text-[8px] text-amber-100/70">
                        {index === 0
                          ? `DRIVE ${Math.round(track.fx.ampDrive * 100)}%`
                          : index === 1
                            ? `SAG ${Math.round(track.fx.ampSag * 100)}%`
                            : track.fx.cabOn
                              ? "CAB ON"
                              : "CAB OFF"}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[8px] leading-relaxed text-amber-100/50">
                  Circuit-inspired browser model · not a hardware capture.
                </div>
              </div>
            )}
            {family === "saturation" && (
              <div className="mb-3 overflow-hidden rounded border border-slate-600/70 bg-[#07111c] p-3">
                <div className="mb-2 flex items-center justify-between text-[9px] tracking-[0.16em] text-slate-400">
                  <span>TRANSFER / HARMONIC SHAPE</span>
                  <span className="font-mono text-primary">
                    DRIVE {Math.round(track.fx.drive * 100)}%
                  </span>
                </div>
                <svg
                  viewBox="0 0 600 170"
                  className="h-36 w-full"
                  role="img"
                  aria-label="Saturation transfer curve"
                >
                  <path d="M0 85H600M300 0V170M0 25H600M0 145H600" stroke="rgba(135,160,185,.16)" />
                  <path
                    d={`M20 155 Q150 ${130 - track.fx.drive * 70} 300 85 Q450 ${40 + track.fx.drive * 70} 580 15`}
                    fill="none"
                    stroke="#5fd1ee"
                    strokeWidth="3"
                  />
                  <path
                    d="M20 155L580 15"
                    fill="none"
                    stroke="rgba(150,180,205,.25)"
                    strokeDasharray="6 6"
                  />
                </svg>
                <div className="text-[8px] text-slate-500">INPUT AMPLITUDE → OUTPUT HARMONICS</div>
              </div>
            )}
            {family !== "parametricEq" && pluginName !== "K-2A" && pluginName !== "K-76" && (
              <div
                className={`plugin-control-surface rounded-sm border p-2 sm:p-3 ${family === "smoothen" ? "plugin-control-vintage" : "bg-background/40"}`}
              >
                <EffectsPanel t={track} section={section} fx={onFxChange} patch={onTrackChange} />
              </div>
            )}
          </main>
        </div>
      </section>
    </div>
  );
}
