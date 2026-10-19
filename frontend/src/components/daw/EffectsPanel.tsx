import type { ReactNode } from "react";
import type { Fx, TrackState, ModType, ModWaveform, DelayType } from "./engine";

export const Slider = ({
  label,
  value,
  min,
  max,
  step = 0.1,
  onChange,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
}) => {
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = -135 + normalized * 270;
  return (
    <label className="group flex w-[76px] flex-col items-center gap-1 text-center">
      <span className="min-h-5 w-full px-0.5 text-[8px] leading-tight tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="plugin-knob relative grid h-12 w-12 place-items-center rounded-full">
        <span className="plugin-knob-face absolute inset-1 rounded-full" />
        <span
          className="plugin-knob-indicator absolute"
          style={{ transform: `rotate(${angle}deg)` }}
        />
        <input
          aria-label={`${label} ${fmt ? fmt(value) : value.toFixed(1)}`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onInput={(e) => onChange(+e.currentTarget.value)}
          className="plugin-knob-input absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </span>
      <span className="min-h-4 font-mono text-[9px] text-lcd">
        {fmt ? fmt(value) : value.toFixed(1)}
      </span>
    </label>
  );
};

const Section = ({ title, children, on }: { title: string; children: ReactNode; on?: boolean }) => (
  <div className="mb-2 rounded-sm border bg-panel-2 p-2">
    <div
      className={`mb-1 text-[10px] tracking-wider ${on ? "text-primary" : "text-muted-foreground"}`}
    >
      {title}
    </div>
    <div className="flex flex-wrap items-start gap-x-1 gap-y-2">{children}</div>
  </div>
);

const Check = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <label className="mb-1 flex items-center gap-2 text-[10px]">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="accent-primary"
    />
    {label}
  </label>
);

const Pick = <T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) => (
  <select
    value={String(value)}
    onChange={(e) => {
      const o = options.find(([v]) => String(v) === e.target.value);
      if (o) onChange(o[0]);
    }}
    className="mb-1.5 w-full rounded-sm border bg-background px-1 py-0.5 text-[11px]"
  >
    {options.map(([v, l]) => (
      <option key={String(v)} value={String(v)}>
        {l}
      </option>
    ))}
  </select>
);

const dB = (v: number) => `${v.toFixed(1)} dB`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const hz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`) + " Hz";
const pitchKeys: [number, string][] = [
  [0, "C"],
  [1, "C♯ / D♭"],
  [2, "D"],
  [3, "D♯ / E♭"],
  [4, "E"],
  [5, "F"],
  [6, "F♯ / G♭"],
  [7, "G"],
  [8, "G♯ / A♭"],
  [9, "A"],
  [10, "A♯ / B♭"],
  [11, "B"],
];
const pitchScales: [Fx["pitchScale"], string][] = [
  [0, "Chromatic"],
  [1, "Major"],
  [2, "Minor"],
  [3, "Major pentatonic"],
  [4, "Minor pentatonic"],
];
const noteName = (midi: number) =>
  `${["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"][midi % 12]}${Math.floor(midi / 12) - 1}`;
const pitchNotes: [number, string][] = Array.from({ length: 61 }, (_, index) => {
  const midi = index + 36;
  return [midi, noteName(midi)];
});

export type EffectSection =
  | "UTILITY"
  | "EQ"
  | "DYNAMICS"
  | "COMPRESSOR"
  | "GATE"
  | "AMP"
  | "SATURATION"
  | "MODULATION"
  | "SPACE"
  | "REVERB"
  | "DELAY"
  | "DE-ESSER"
  | "VOCAL"
  | "PITCH";

export function EffectsPanel({
  t,
  fx,
  patch,
  section,
}: {
  t: TrackState;
  fx: (p: Partial<Fx>) => void;
  patch: (p: Partial<TrackState>) => void;
  section?: EffectSection;
}) {
  const f = t.fx;
  const show = (name: EffectSection) => !section || section === name;
  return (
    <>
      {show("UTILITY") && (
        <Section title="UTILITY">
          <Slider
            label="Gain"
            value={t.volume}
            min={-60}
            max={6}
            onChange={(v) => patch({ volume: v })}
            fmt={dB}
          />
          <Slider
            label="Pan"
            value={t.pan}
            min={-1}
            max={1}
            step={0.01}
            onChange={(v) => patch({ pan: v })}
            fmt={(v) =>
              Math.abs(v) < 0.01 ? "C" : `${Math.round(Math.abs(v) * 100)}${v < 0 ? "L" : "R"}`
            }
          />
          <Slider
            label="Stereo width"
            value={f.width}
            min={0}
            max={2}
            step={0.01}
            onChange={(v) => fx({ width: v })}
            fmt={pct}
          />
          <Check label="Invert phase" checked={f.phase} onChange={(v) => fx({ phase: v })} />
        </Section>
      )}
      {show("PITCH") && (
        <Section title="KREATIVE PITCH · MONOPHONIC CORRECTION" on={f.pitchOn}>
          <Check
            label="Enable pitch correction"
            checked={f.pitchOn}
            onChange={(v) => fx({ pitchOn: v })}
          />
          <div className="w-full rounded border border-primary/25 bg-primary/5 p-2 text-[9px] leading-relaxed text-muted-foreground">
            Original browser pitch correction for isolated vocal lines. This does not clone another
            plugin or preserve formants.
          </div>
          <Pick value={f.pitchKey} options={pitchKeys} onChange={(v) => fx({ pitchKey: v })} />
          <Pick
            value={f.pitchScale}
            options={pitchScales}
            onChange={(v) => fx({ pitchScale: v })}
          />
          <Pick
            value={f.pitchRangeLow}
            options={pitchNotes.filter(([note]) => note < f.pitchRangeHigh)}
            onChange={(v) => fx({ pitchRangeLow: v })}
          />
          <Pick
            value={f.pitchRangeHigh}
            options={pitchNotes.filter(([note]) => note > f.pitchRangeLow)}
            onChange={(v) => fx({ pitchRangeHigh: v })}
          />
          <Slider
            label="Retune speed"
            value={f.pitchSpeed}
            min={0.005}
            max={0.5}
            step={0.005}
            onChange={(v) => fx({ pitchSpeed: v })}
            fmt={(v) => `${Math.round(v * 1000)} ms`}
          />
          <Slider
            label="Humanize"
            value={f.pitchHumanize}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => fx({ pitchHumanize: v })}
            fmt={pct}
          />
          <Slider
            label="Ignore below"
            value={f.pitchFloor}
            min={-72}
            max={-24}
            onChange={(v) => fx({ pitchFloor: v })}
            fmt={dB}
          />
          <Slider
            label="Transpose"
            value={f.pitchTranspose}
            min={-12}
            max={12}
            step={1}
            onChange={(v) => fx({ pitchTranspose: v })}
            fmt={(v) => `${v > 0 ? "+" : ""}${v} st`}
          />
          <Slider
            label="Reference"
            value={f.pitchReference}
            min={430}
            max={450}
            step={0.1}
            onChange={(v) => fx({ pitchReference: v })}
            fmt={(v) => `${v.toFixed(1)} Hz`}
          />
          <Slider
            label="Wet / dry"
            value={f.pitchMix}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => fx({ pitchMix: v })}
            fmt={pct}
          />
        </Section>
      )}
      {show("EQ") && (
        <Section
          title="FOUR-BAND CONSOLE EQ"
          on={!!(f.eqLow || f.eqMid || f.eqHighMid || f.eqHigh || f.hpOn || f.lpOn)}
        >
          <Slider
            label="Low shelf · 200 Hz"
            value={f.eqLow}
            min={-12}
            max={12}
            onChange={(v) => fx({ eqLow: v })}
            fmt={dB}
          />
          <Slider
            label="Mid frequency"
            value={f.eqMidFreq}
            min={100}
            max={10000}
            step={10}
            onChange={(v) => fx({ eqMidFreq: v })}
            fmt={hz}
          />
          <Slider
            label="Mid gain"
            value={f.eqMid}
            min={-12}
            max={12}
            onChange={(v) => fx({ eqMid: v })}
            fmt={dB}
          />
          <Slider
            label="Mid Q"
            value={f.eqMidQ}
            min={0.2}
            max={8}
            step={0.1}
            onChange={(v) => fx({ eqMidQ: v })}
            fmt={(v) => v.toFixed(1)}
          />
          <Slider
            label="High-mid frequency"
            value={f.eqHighMidFreq}
            min={1000}
            max={12000}
            step={10}
            onChange={(v) => fx({ eqHighMidFreq: v })}
            fmt={hz}
          />
          <Slider
            label="High-mid gain"
            value={f.eqHighMid}
            min={-12}
            max={12}
            onChange={(v) => fx({ eqHighMid: v })}
            fmt={dB}
          />
          <Slider
            label="High-mid Q"
            value={f.eqHighMidQ}
            min={0.2}
            max={8}
            step={0.1}
            onChange={(v) => fx({ eqHighMidQ: v })}
            fmt={(v) => v.toFixed(1)}
          />
          <Slider
            label="High shelf · 6 kHz"
            value={f.eqHigh}
            min={-12}
            max={12}
            onChange={(v) => fx({ eqHigh: v })}
            fmt={dB}
          />
          <Check label="High pass" checked={f.hpOn} onChange={(v) => fx({ hpOn: v })} />
          {f.hpOn && (
            <Slider
              label="HP freq"
              value={f.hpFreq}
              min={20}
              max={1000}
              step={1}
              onChange={(v) => fx({ hpFreq: v })}
              fmt={hz}
            />
          )}
          <Check label="Low pass" checked={f.lpOn} onChange={(v) => fx({ lpOn: v })} />
          {f.lpOn && (
            <Slider
              label="LP freq"
              value={f.lpFreq}
              min={1000}
              max={20000}
              step={10}
              onChange={(v) => fx({ lpFreq: v })}
              fmt={hz}
            />
          )}
        </Section>
      )}
      {(show("DYNAMICS") || show("COMPRESSOR")) && (
        <Section title="COMPRESSOR" on={f.compOn}>
          <Check label="Compressor" checked={f.compOn} onChange={(v) => fx({ compOn: v })} />
          {f.compOn && (
            <>
              <Slider
                label="Threshold"
                value={f.compThreshold}
                min={-50}
                max={0}
                onChange={(v) => fx({ compThreshold: v })}
                fmt={dB}
              />
              <Slider
                label="Ratio"
                value={f.compRatio}
                min={1}
                max={20}
                step={0.1}
                onChange={(v) => fx({ compRatio: v })}
                fmt={(v) => `${v.toFixed(1)}:1`}
              />
              <Slider
                label="Attack"
                value={f.compAttack}
                min={0.001}
                max={0.2}
                step={0.001}
                onChange={(v) => fx({ compAttack: v })}
                fmt={(v) => `${(v * 1000).toFixed(0)} ms`}
              />
              <Slider
                label="Release"
                value={f.compRelease}
                min={0.01}
                max={1}
                step={0.01}
                onChange={(v) => fx({ compRelease: v })}
                fmt={(v) => `${(v * 1000).toFixed(0)} ms`}
              />
              <Slider
                label="Knee"
                value={f.compKnee}
                min={0}
                max={30}
                step={1}
                onChange={(v) => fx({ compKnee: v })}
                fmt={dB}
              />
              <Slider
                label="Makeup gain"
                value={f.compMakeup}
                min={-12}
                max={18}
                onChange={(v) => fx({ compMakeup: v })}
                fmt={dB}
              />
              <Slider
                label="Parallel blend"
                value={f.compMix}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => fx({ compMix: v })}
                fmt={pct}
              />
            </>
          )}
        </Section>
      )}
      {(show("DYNAMICS") || show("GATE")) && (
        <Section title="GATE / EXPANDER" on={f.dynMode > 0}>
          <Pick
            value={f.dynMode}
            options={[
              [0, "Gate / Expander off"],
              [1, "Gate"],
              [2, "Expander"],
            ]}
            onChange={(v) => fx({ dynMode: v })}
          />
          {f.dynMode > 0 && (
            <>
              <Slider
                label="Threshold"
                value={f.dynThreshold}
                min={-80}
                max={-10}
                onChange={(v) => fx({ dynThreshold: v })}
                fmt={dB}
              />
              <Slider
                label="Detector attack"
                value={f.dynAttack}
                min={0.001}
                max={0.1}
                step={0.001}
                onChange={(v) => fx({ dynAttack: v })}
                fmt={(v) => `${(v * 1000).toFixed(0)} ms`}
              />
              <Slider
                label="Detector release"
                value={f.dynRelease}
                min={0.005}
                max={1}
                step={0.005}
                onChange={(v) => fx({ dynRelease: v })}
                fmt={(v) => `${(v * 1000).toFixed(0)} ms`}
              />
              <Slider
                label="Range"
                value={f.dynRange}
                min={-80}
                max={0}
                onChange={(v) => fx({ dynRange: v })}
                fmt={dB}
              />
              <Slider
                label="Hysteresis"
                value={f.dynHysteresis}
                min={0}
                max={12}
                step={0.1}
                onChange={(v) => fx({ dynHysteresis: v })}
                fmt={dB}
              />
            </>
          )}
        </Section>
      )}
      {show("AMP") && (
        <Section title="TUBE & AMP" on={f.ampModel > 0}>
          <Pick
            value={f.ampModel}
            options={[
              [0, "Amp modeling off"],
              [1, "12AX7 Class A"],
              [2, "Tweed Combo"],
              [3, "British Stack"],
              [4, "Modern High Gain"],
            ]}
            onChange={(v) => fx({ ampModel: v as Fx["ampModel"] })}
          />
          {f.ampModel > 0 && (
            <>
              <div className="mb-2 rounded-sm border border-primary/30 bg-primary/5 p-2 text-[9px] leading-relaxed text-muted-foreground">
                Circuit-inspired browser DSP voicings; not hardware captures or a substitute for a
                measured amp model.
              </div>
              <Slider
                label="Preamp drive"
                value={f.ampDrive}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => fx({ ampDrive: v })}
                fmt={pct}
              />
              <Slider
                label="Bias"
                value={f.ampBias}
                min={-0.5}
                max={0.5}
                step={0.01}
                onChange={(v) => fx({ ampBias: v })}
                fmt={(v) => v.toFixed(2)}
              />
              <Slider
                label="Power sag"
                value={f.ampSag}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => fx({ ampSag: v })}
                fmt={pct}
              />
              <Slider
                label="Presence"
                value={f.ampPresence}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => fx({ ampPresence: v })}
                fmt={pct}
              />
              <Slider
                label="Bass"
                value={f.ampBass}
                min={-12}
                max={12}
                onChange={(v) => fx({ ampBass: v })}
                fmt={dB}
              />
              <Slider
                label="Middle"
                value={f.ampMid}
                min={-12}
                max={12}
                onChange={(v) => fx({ ampMid: v })}
                fmt={dB}
              />
              <Slider
                label="Treble"
                value={f.ampTreble}
                min={-12}
                max={12}
                onChange={(v) => fx({ ampTreble: v })}
                fmt={dB}
              />
              <Slider
                label="Output trim"
                value={f.ampOutput}
                min={-18}
                max={6}
                onChange={(v) => fx({ ampOutput: v })}
                fmt={dB}
              />
              <Check
                label="Speaker cabinet filter"
                checked={f.cabOn}
                onChange={(v) => fx({ cabOn: v })}
              />
            </>
          )}
        </Section>
      )}
      {show("SATURATION") && (
        <Section title="SATURATION" on={f.satMode > 0}>
          <Pick
            value={f.satMode}
            options={[
              [0, "Off"],
              [1, "Saturation"],
              [2, "Tape"],
              [3, "Tube"],
              [4, "Warmth"],
            ]}
            onChange={(v) => fx({ satMode: v })}
          />
          {f.satMode > 0 && (
            <>
              <Slider
                label="Drive"
                value={f.drive}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => fx({ drive: v })}
                fmt={pct}
              />
              <Slider
                label="Asymmetry bias"
                value={f.satBias}
                min={-0.5}
                max={0.5}
                step={0.01}
                onChange={(v) => fx({ satBias: v })}
                fmt={(v) => v.toFixed(2)}
              />
              <Slider
                label="Wet / dry"
                value={f.satMix}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => fx({ satMix: v })}
                fmt={pct}
              />
              <Slider
                label="Output trim"
                value={f.satOutput}
                min={-18}
                max={6}
                onChange={(v) => fx({ satOutput: v })}
                fmt={dB}
              />
            </>
          )}
        </Section>
      )}
      {show("MODULATION") && (
        <Section title="MODULATION" on={f.modType !== "off"}>
          <Pick<ModType>
            value={f.modType}
            options={[
              ["off", "Off"],
              ["chorus", "Chorus"],
              ["flanger", "Flanger"],
              ["phaser", "Phaser"],
              ["tremolo", "Tremolo"],
            ]}
            onChange={(v) => fx({ modType: v })}
          />
          {f.modType !== "off" && (
            <>
              <Pick<ModWaveform>
                value={f.modWaveform}
                options={[
                  ["sine", "Sine"],
                  ["triangle", "Triangle"],
                  ["square", "Square"],
                  ["sawtooth", "Sawtooth"],
                ]}
                onChange={(v) => fx({ modWaveform: v })}
              />
              <Slider
                label="Rate"
                value={f.modRate}
                min={0.05}
                max={8}
                step={0.05}
                onChange={(v) => fx({ modRate: v })}
                fmt={(v) => `${v.toFixed(2)} Hz`}
              />
              <Slider
                label="Depth"
                value={f.modDepth}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => fx({ modDepth: v })}
                fmt={pct}
              />
              <Slider
                label={f.modType === "tremolo" ? "Intensity" : "Mix"}
                value={f.modMix}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => fx({ modMix: v })}
                fmt={pct}
              />
              {["chorus", "flanger"].includes(f.modType) && (
                <Slider
                  label="Feedback"
                  value={f.modFeedback}
                  min={0}
                  max={0.9}
                  step={0.01}
                  onChange={(v) => fx({ modFeedback: v })}
                  fmt={pct}
                />
              )}
              {f.modType !== "tremolo" && (
                <>
                  <Slider
                    label="Wet pan"
                    value={f.modPan}
                    min={-1}
                    max={1}
                    step={0.01}
                    onChange={(v) => fx({ modPan: v })}
                    fmt={(v) =>
                      Math.abs(v) < 0.01
                        ? "C"
                        : `${Math.round(Math.abs(v) * 100)}${v < 0 ? "L" : "R"}`
                    }
                  />
                  <Slider
                    label="Wet tone"
                    value={f.modTone}
                    min={1000}
                    max={18000}
                    step={100}
                    onChange={(v) => fx({ modTone: v })}
                    fmt={hz}
                  />
                </>
              )}
            </>
          )}
        </Section>
      )}
      {(show("SPACE") || show("REVERB")) && (
        <Section title="REVERB" on={f.reverb > 0}>
          <Slider
            label="Reverb send"
            value={f.reverb}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => fx({ reverb: v })}
            fmt={pct}
          />
          {f.reverb > 0 && (
            <>
              <Slider
                label="Room size / early reflections"
                value={f.reverbSize}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => fx({ reverbSize: v })}
                fmt={pct}
              />
              <Slider
                label="Pre-delay"
                value={f.reverbPreDelay}
                min={0}
                max={0.15}
                step={0.001}
                onChange={(v) => fx({ reverbPreDelay: v })}
                fmt={(v) => `${(v * 1000).toFixed(0)} ms`}
              />
              <Slider
                label="Damping / tone"
                value={f.reverbTone}
                min={800}
                max={18000}
                step={100}
                onChange={(v) => fx({ reverbTone: v })}
                fmt={hz}
              />
            </>
          )}
        </Section>
      )}
      {(show("SPACE") || show("DELAY")) && (
        <Section title="DELAY" on={f.delayType !== "off"}>
          <Pick<DelayType>
            value={f.delayType}
            options={[
              ["off", "Delay off"],
              ["delay", "Delay"],
              ["tape", "Tape Echo"],
              ["pingpong", "Ping Pong"],
            ]}
            onChange={(v) => fx({ delayType: v })}
          />
          {f.delayType !== "off" && (
            <>
              <Slider
                label="Time"
                value={f.delayTime}
                min={0.02}
                max={1.5}
                step={0.01}
                onChange={(v) => fx({ delayTime: v })}
                fmt={(v) => `${Math.round(v * 1000)} ms`}
              />
              <Slider
                label="Feedback"
                value={f.delayFeedback}
                min={0}
                max={0.9}
                step={0.01}
                onChange={(v) => fx({ delayFeedback: v })}
                fmt={pct}
              />
              <Slider
                label="Mix"
                value={f.delayMix}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => fx({ delayMix: v })}
                fmt={pct}
              />
              <Slider
                label="Feedback tone"
                value={f.delayTone}
                min={800}
                max={18000}
                step={100}
                onChange={(v) => fx({ delayTone: v })}
                fmt={hz}
              />
            </>
          )}
        </Section>
      )}
      {show("DE-ESSER") && (
        <Section title="KREATIVE DE-ESSER · FREQUENCY SELECTIVE" on={f.deEssOn}>
          <Check
            label="Enable de-esser"
            checked={f.deEssOn}
            onChange={(v) => fx({ deEssOn: v })}
          />
          <div className="w-full rounded border border-primary/25 bg-primary/5 p-2 text-[9px] leading-relaxed text-muted-foreground">
            Original browser DSP inspired by focused vocal de-essing workflows. It attenuates the
            selected sibilance band instead of dulling the whole signal.
          </div>
          <Slider
            label="Sibilance focus"
            value={f.deEssFrequency}
            min={3500}
            max={12000}
            step={50}
            onChange={(v) => fx({ deEssFrequency: v })}
            fmt={hz}
          />
          <Slider
            label="Threshold"
            value={f.deEssThreshold}
            min={-60}
            max={-6}
            step={0.5}
            onChange={(v) => fx({ deEssThreshold: v })}
            fmt={dB}
          />
          <Slider
            label="Max reduction"
            value={f.deEssRange}
            min={0}
            max={18}
            step={0.5}
            onChange={(v) => fx({ deEssRange: v })}
            fmt={dB}
          />
          <Slider
            label="Attack"
            value={f.deEssAttack}
            min={0.001}
            max={0.02}
            step={0.001}
            onChange={(v) => fx({ deEssAttack: v })}
            fmt={(v) => `${Math.round(v * 1000)} ms`}
          />
          <Slider
            label="Release"
            value={f.deEssRelease}
            min={0.01}
            max={0.3}
            step={0.005}
            onChange={(v) => fx({ deEssRelease: v })}
            fmt={(v) => `${Math.round(v * 1000)} ms`}
          />
          <Slider
            label="Mix"
            value={f.deEssMix}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => fx({ deEssMix: v })}
            fmt={pct}
          />
        </Section>
      )}
      {show("VOCAL") && (
        <Section title="SMOOTHEN · AUTOMATIC LEVEL RIDER" on={f.smoothenOn}>
          <Check
            label="Enable automatic riding"
            checked={f.smoothenOn}
            onChange={(v) => fx({ smoothenOn: v })}
          />
          <div className="mb-2 rounded-sm border border-primary/30 bg-primary/5 p-2 text-[9px] leading-relaxed text-muted-foreground">
            Smoothen follows vocal level with bounded, smoothed gain changes. This is an original
            browser DSP design, not a clone of another plugin.
          </div>
          <Slider
            label="Target level"
            value={f.smoothenTarget}
            min={-30}
            max={-10}
            onChange={(v) => fx({ smoothenTarget: v })}
            fmt={dB}
          />
          <Slider
            label="Maximum ride range ±"
            value={f.smoothenRange}
            min={0}
            max={18}
            onChange={(v) => fx({ smoothenRange: v })}
            fmt={dB}
          />
          <Slider
            label="Ignore below"
            value={f.smoothenFloor}
            min={-72}
            max={-24}
            onChange={(v) => fx({ smoothenFloor: v })}
            fmt={dB}
          />
          <Slider
            label="Ride response"
            value={f.smoothenSpeed}
            min={0.05}
            max={1.5}
            step={0.01}
            onChange={(v) => fx({ smoothenSpeed: v })}
            fmt={(v) => `${v.toFixed(2)} s`}
          />
          <Slider
            label="Blend"
            value={f.smoothenMix}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => fx({ smoothenMix: v })}
            fmt={pct}
          />
        </Section>
      )}
    </>
  );
}
