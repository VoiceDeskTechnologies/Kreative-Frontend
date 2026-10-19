import { getPluginFamily, getPluginSettings } from "./data";
import type { AiMixAction } from "./ai-mix-types";
import type { TrackState } from "./engine";

export function validateAiMixActions(actions: AiMixAction[], tracks: TrackState[]): void {
  const ids = new Set(tracks.map((track) => track.id));
  for (const action of actions) {
    if (action.type === "setMaster") continue;
    const track = tracks.find((item) => item.id === action.trackId);
    if (!track) throw new Error(`AI change references missing track ${action.trackId}`);
    if (action.type !== "insertPlugin") continue;
    if (!getPluginFamily(action.plugin) || !getPluginSettings(action.plugin))
      throw new Error(`AI selected unsupported plugin ${action.plugin}`);
    if (action.slot >= track.inserts.length) throw new Error(`AI selected an invalid insert slot.`);
    const duplicate = track.inserts.findIndex(
      (plugin, slot) => slot !== action.slot && plugin && getPluginFamily(plugin) === getPluginFamily(action.plugin),
    );
    if (duplicate >= 0) throw new Error(`${track.name} already has this processor family in insert ${duplicate + 1}.`);
  }
  if (ids.size !== tracks.length) throw new Error("Cannot apply AI changes to duplicate track ids.");
}

export function describeAiAction(action: AiMixAction, trackName?: string): string {
  if (action.type === "setMaster") return `Master level -> ${action.volume.toFixed(1)} dB`;
  if (action.type === "setFx") return `Updating supported processing on ${trackName ?? action.trackId}`;
  if (action.type === "setTrackMix") return `Balancing ${trackName ?? action.trackId}`;
  return `Inserting ${action.plugin} on ${trackName ?? action.trackId}`;
}
