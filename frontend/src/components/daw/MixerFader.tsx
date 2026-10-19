import { dbToFaderPosition, faderPositionToDb } from "./mixer-fader-scale";

type MixerFaderProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onReset: () => void;
};

const FADER_MARKS = [-60, -48, -36, -24, -18, -12, -6, 0, 6];

export function MixerFader({ label, value, onChange, onReset }: MixerFaderProps) {
  const position = dbToFaderPosition(value);

  return (
    <div
      className="relative h-full min-h-12 w-10 shrink-0"
      title={`${label}: ${value.toFixed(1)} dB`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 left-[68%] w-[3px] -translate-x-1/2 rounded-full bg-background shadow-[inset_0_1px_2px_rgba(0,0,0,0.9)]"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-1 left-0 right-0">
        {FADER_MARKS.map((mark) => (
          <div
            key={mark}
            className="absolute inset-x-0 flex -translate-y-1/2 items-center"
            style={{ bottom: `${dbToFaderPosition(mark) * 100}%` }}
          >
            <span
              className={`w-5 text-right font-mono text-[7px] leading-none ${
                mark === 0 ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {mark > 0 ? `+${mark}` : mark}
            </span>
            <span
              className={`ml-1 h-px ${
                mark === 0
                  ? "w-3 bg-white shadow-[0_0_3px_rgba(255,255,255,0.65)]"
                  : "w-2 bg-border"
              }`}
            />
          </div>
        ))}
      </div>
      <input
        aria-label={`${label} volume fader`}
        aria-valuetext={`${value.toFixed(1)} decibels`}
        className="mixer-fader absolute inset-y-1 left-[68%] z-10 h-[calc(100%-0.5rem)] w-5 -translate-x-1/2"
        max={1}
        min={0}
        onInput={(event) => onChange(faderPositionToDb(Number(event.currentTarget.value)))}
        onDoubleClick={onReset}
        onKeyDown={(event) => {
          if (event.key === "Home") {
            event.preventDefault();
            onChange(-60);
          } else if (event.key === "End") {
            event.preventDefault();
            onChange(6);
          }
        }}
        onKeyUp={(event) => {
          if (event.key === "Enter") onReset();
        }}
        onPointerDown={(event) => {
          if (event.detail === 2) onReset();
        }}
        step={0.001}
        type="range"
        value={position}
      />
      <div
        aria-hidden="true"
        className="fader-thumb pointer-events-none absolute bottom-0 left-[68%] z-20 h-4 w-3 -translate-x-1/2 translate-y-1/2"
        style={{ bottom: `${position * 100}%` }}
      />
    </div>
  );
}
