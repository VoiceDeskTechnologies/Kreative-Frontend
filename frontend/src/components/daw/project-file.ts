import type { Fx, TrackState, TrackRouting, BusSendSlot } from "./engine";
import { encodeWav } from "./export-audio";

export type ProjectTrackFile = {
  id: string;
  name: string;
  kind?: "audio" | "bus";
  busRole?: TrackState["busRole"];
  returnOnly?: boolean;
  delaySync?: TrackState["delaySync"];
  colorIdx: number;
  start: number;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  inserts: (string | null)[];
  pluginBypass: Record<string, boolean>;
  fx: Fx;
  routing?: TrackRouting;
  sendSlots?: (BusSendSlot | null)[];
  audioName?: string;
  audioBase64?: string;
};

export type KreativeProjectFile = {
  format: "kreative-session";
  version: 1;
  name: string;
  createdAt: string;
  updatedAt: string;
  key?: string;
  bpm?: number;
  masterVolume: number;
  tracks: ProjectTrackFile[];
};

function bytesToBase64(bytes: Uint8Array) {
  let output = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    output += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(output);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function audioBufferData(buffer: AudioBuffer) {
  const left = buffer.getChannelData(0).slice();
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1).slice() : left.slice();
  return { sampleRate: buffer.sampleRate, left, right };
}

export async function createKreativeProject(
  name: string,
  tracks: TrackState[],
  masterVolume: number,
  key = "C",
  bpm = 120,
): Promise<KreativeProjectFile> {
  const serializedTracks = await Promise.all(
    tracks.map(async (track) => {
      const audio =
        track.kind === "bus"
          ? undefined
          : bytesToBase64(new Uint8Array(await encodeWav(audioBufferData(track.buffer), 16).arrayBuffer()));
      return {
        id: track.id,
        name: track.name,
        kind: track.kind ?? "audio",
        ...(track.busRole ? { busRole: track.busRole } : {}),
        ...(track.returnOnly !== undefined ? { returnOnly: track.returnOnly } : {}),
        ...(track.delaySync ? { delaySync: track.delaySync } : {}),
        colorIdx: track.colorIdx,
        start: track.start,
        volume: track.volume,
        pan: track.pan,
        mute: track.mute,
        solo: track.solo,
        inserts: track.inserts,
        pluginBypass: track.pluginBypass,
        fx: track.fx,
        ...(track.routing ? { routing: track.routing } : {}),
        ...(track.sendSlots ? { sendSlots: track.sendSlots } : {}),
        ...(track.kind !== "bus" && audio
          ? { audioName: `${track.name}.wav`, audioBase64: audio }
          : {}),
      };
    }),
  );
  const now = new Date().toISOString();
  return {
    format: "kreative-session",
    version: 1,
    name,
    createdAt: now,
    updatedAt: now,
    key,
    bpm,
    masterVolume,
    tracks: serializedTracks,
  };
}

export function downloadKreativeProject(project: KreativeProjectFile) {
  const blob = new Blob([JSON.stringify(project)], { type: "application/vnd.kreative.session+json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${project.name.replace(/[^a-z0-9-_]+/gi, "-") || "kreative-session"}.kreative`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readKreativeProject(file: File) {
  const parsed: unknown = JSON.parse(await file.text());
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { format?: unknown }).format !== "kreative-session" ||
    (parsed as { version?: unknown }).version !== 1 ||
    !Array.isArray((parsed as { tracks?: unknown }).tracks)
  ) {
    throw new Error("This is not a valid Kreative session file.");
  }
  return parsed as KreativeProjectFile;
}

export function projectAudioFile(track: ProjectTrackFile) {
  if (!track.audioBase64) return null;
  return new File([base64ToBytes(track.audioBase64)], track.audioName ?? `${track.name}.wav`, {
    type: "audio/wav",
  });
}
