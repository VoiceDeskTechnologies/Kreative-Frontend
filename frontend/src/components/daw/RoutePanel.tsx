import type { TrackRouting, TrackState } from "./engine";

export function RoutePanel({
  selected,
  tracks,
  onChange,
}: {
  selected: TrackState | null;
  tracks: TrackState[];
  onChange: (routing: TrackRouting) => void;
}) {
  if (!selected) {
    return (
      <div className="border-b p-3 text-[10px] text-muted-foreground">
        Select a track to edit routing.
      </div>
    );
  }
  const routing = selected.routing ?? { outputBus: "master", sends: {} };
  return (
    <div className="border-b p-3">
      <div className="mb-2 text-[10px] tracking-wider text-muted-foreground">
        ROUTING · {selected.name.toUpperCase()}
      </div>
      <label className="flex items-center justify-between gap-2 text-[10px]">
        <span>Output</span>
        <select
          className="max-w-40 rounded border bg-background px-2 py-1 text-[10px]"
          value={routing.outputBus}
          onChange={(event) => onChange({ ...routing, outputBus: event.target.value })}
        >
          <option value="master">Master</option>
          {tracks
            .filter((track) => track.id !== selected.id)
            .map((track) => (
              <option value={track.id} key={track.id}>
                {track.name}
              </option>
            ))}
        </select>
      </label>
      <div className="mt-3 space-y-2">
        <div className="text-[9px] uppercase text-muted-foreground">Sends into tracks</div>
        {tracks
          .filter((track) => track.id !== selected.id)
          .map((track) => {
            const value = routing.sends[track.id] ?? -60;
            return (
              <label className="flex items-center gap-2 text-[10px]" key={track.id}>
                <span className="w-20 truncate">{track.name}</span>
                <input
                  aria-label={`Send ${selected.name} into ${track.name}`}
                  className="min-w-0 flex-1 accent-primary"
                  type="range"
                  min={-60}
                  max={6}
                  step={0.5}
                  value={value}
                  onChange={(event) =>
                    onChange({
                      ...routing,
                      sends: { ...routing.sends, [track.id]: Number(event.target.value) },
                    })
                  }
                />
                <span className="w-10 text-right font-mono text-[9px]">{value.toFixed(1)}</span>
              </label>
            );
          })}
      </div>
    </div>
  );
}
