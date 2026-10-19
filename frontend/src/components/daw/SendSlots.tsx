import { useEffect, useState } from "react";
import { Plus, SlidersHorizontal, X } from "lucide-react";
import type { BusSendSlot, TrackState } from "./engine";

export function SendSlots({
  track,
  tracks,
  visible,
  onChange,
}: {
  track: TrackState;
  tracks: TrackState[];
  visible: boolean;
  onChange: (slots: (BusSendSlot | null)[]) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  if (!visible) return null;
  const slots = track.sendSlots ?? Array<BusSendSlot | null>(10).fill(null);
  return (
    <>
      <div className="mixer-slot-rack grid w-32 shrink-0 grid-flow-col grid-cols-2 grid-rows-5 gap-1 border-l border-primary/20 pl-1">
        {slots.map((slot, index) => (
          <button
            key={index}
            className={`flex h-5 min-w-0 items-center gap-1 rounded-sm border px-1 text-left text-[8px] ${
              slot
                ? "border-amber-400/40 bg-amber-400/10 text-foreground"
                : "border-border/70 bg-background/70 text-muted-foreground hover:border-primary/50"
            }`}
            title={slot ? `Edit send ${index + 1}` : `Add bus/send ${index + 1}`}
            onClick={(event) => {
              event.stopPropagation();
              setEditing(index);
            }}
          >
            <span className="font-mono text-[7px] text-muted-foreground">S{index + 1}</span>
            <span className="truncate">
              {slot ? (
                (tracks.find((item) => item.id === slot.targetId)?.name ?? "Missing bus")
              ) : (
                <Plus className="h-2.5 w-2.5" />
              )}
            </span>
          </button>
        ))}
      </div>
      {editing !== null && (
        <SendEditor
          source={track}
          tracks={tracks}
          slot={slots[editing] ?? null}
          index={editing}
          onClose={() => setEditing(null)}
          onChange={(value) => {
            const next = [...slots];
            next[editing] = value;
            onChange(next);
            setEditing(null);
          }}
          onClear={() => {
            const next = [...slots];
            next[editing] = null;
            onChange(next);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function SendEditor({
  source,
  tracks,
  slot,
  index,
  onClose,
  onChange,
  onClear,
}: {
  source: TrackState;
  tracks: TrackState[];
  slot: BusSendSlot | null;
  index: number;
  onClose: () => void;
  onChange: (slot: BusSendSlot) => void;
  onClear: () => void;
}) {
  const [targetId, setTargetId] = useState(
    slot?.targetId ??
      tracks.find((track) => track.kind === "bus" && track.id !== source.id)?.id ??
      "",
  );
  const [level, setLevel] = useState(slot?.level ?? -18);
  const candidates = tracks.filter((track) => track.id !== source.id);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-editor-title"
        className="w-full max-w-xs rounded-md border bg-panel p-4 shadow-overlay"
      >
        <header className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] tracking-wider text-muted-foreground">
              SEND SLOT {index + 1}
            </div>
            <h2 id="send-editor-title" className="font-display text-sm">
              {source.name}
            </h2>
          </div>
          <button
            type="button"
            className="daw-btn h-6 w-6"
            onClick={onClose}
            aria-label="Close send editor"
            title="Close send editor"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>
        <label className="block text-[10px] text-muted-foreground">
          DESTINATION
          <select
            className="mt-1 w-full rounded border bg-background p-2 text-xs text-foreground"
            value={targetId}
            onChange={(event) => setTargetId(event.currentTarget.value)}
          >
            <option value="">Choose a bus or track</option>
            {candidates.map((track) => (
              <option value={track.id} key={track.id}>
                {track.kind === "bus" ? "BUS · " : ""}
                {track.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-4 block text-[10px] text-muted-foreground">
          SEND LEVEL{" "}
          <div className="mt-2 flex items-center gap-2">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <input
              className="flex-1 accent-primary"
              type="range"
              min={-60}
              max={6}
              step={0.5}
              value={level}
              onInput={(event) => setLevel(Number(event.currentTarget.value))}
            />
            <span className="w-12 text-right font-mono text-xs text-lcd">
              {level.toFixed(1)} dB
            </span>
          </div>
        </label>
        <div className="mt-5 flex gap-2">
          <button
            className="flex-1 rounded bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            disabled={!targetId}
            onClick={() => onChange({ targetId, level })}
          >
            Save Send
          </button>
          {slot && (
            <button className="rounded border px-3 py-2 text-xs text-destructive" onClick={onClear}>
              Clear
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
