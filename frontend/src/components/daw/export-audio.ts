import * as lamejs from "@breezystack/lamejs";
import { engine, type TrackState } from "./engine";

export type AudioData = {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
};

export type ExportFormat = "wav" | "mp3" | "zip";
export type ExportOptions = {
  name: string;
  format: ExportFormat;
  bitDepth: 16 | 24 | 32;
  bitrate: 128 | 192 | 320;
  start: number;
  end: number;
};

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function captureMix(
  tracks: TrackState[],
  start: number,
  end: number,
  onProgress: (fraction: number) => void,
): Promise<AudioData> {
  const ctx = engine.ctx;
  if (!ctx || ctx.state === "closed") throw new Error("The audio engine is not available.");
  if (end <= start) throw new Error("The export range must have a positive duration.");

  const frameCount = Math.ceil((end - start) * ctx.sampleRate);
  const leftChunks: Float32Array[] = [];
  const rightChunks: Float32Array[] = [];
  let captured = 0;
  let settled = false;
  const processor = ctx.createScriptProcessor(4096, 2, 2);
  const silence = ctx.createGain();
  silence.gain.value = 0;
  processor.connect(silence).connect(ctx.destination);
  engine.masterAnalyser.disconnect(ctx.destination);
  engine.masterAnalyser.connect(processor);

  try {
    const audio = await new Promise<AudioData>((resolve, reject) => {
      const cleanup = () => {
        processor.onaudioprocess = null;
        processor.disconnect();
        silence.disconnect();
        engine.masterAnalyser.disconnect(processor);
        engine.masterAnalyser.connect(ctx.destination);
      };
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        engine.stop();
        if (error) {
          reject(error);
          return;
        }
        const left = new Float32Array(frameCount);
        const right = new Float32Array(frameCount);
        let offset = 0;
        for (let i = 0; i < leftChunks.length; i++) {
          const l = leftChunks[i]!;
          const r = rightChunks[i]!;
          left.set(l, offset);
          right.set(r, offset);
          offset += l.length;
        }
        resolve({ sampleRate: ctx.sampleRate, left, right });
      };

      processor.onaudioprocess = (event) => {
        const length = Math.min(event.inputBuffer.length, frameCount - captured);
        if (length <= 0) {
          finish();
          return;
        }
        leftChunks.push(event.inputBuffer.getChannelData(0).slice(0, length));
        rightChunks.push(event.inputBuffer.getChannelData(1).slice(0, length));
        captured += length;
        onProgress(Math.min(1, captured / frameCount));
        if (captured >= frameCount) finish();
      };

      void engine.play(tracks, start).catch((error: unknown) => {
        finish(error instanceof Error ? error : new Error("Couldn't start audio playback."));
      });
    });
    return audio;
  } catch (error) {
    if (!settled) {
      processor.disconnect();
      silence.disconnect();
      engine.masterAnalyser.disconnect(processor);
      engine.masterAnalyser.connect(ctx.destination);
    }
    engine.stop();
    throw error;
  }
}

export function encodeWav(audio: AudioData, bitDepth: 16 | 24 | 32): Blob {
  const bytesPerSample = bitDepth / 8;
  const dataBytes = audio.left.length * 2 * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index++) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * 2 * bytesPerSample, true);
  view.setUint16(32, 2 * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  write(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let index = 0; index < audio.left.length; index++) {
    for (const channel of [audio.left, audio.right]) {
      const sample = Math.max(-1, Math.min(1, channel[index] ?? 0));
      if (bitDepth === 32) {
        view.setFloat32(offset, sample, true);
      } else if (bitDepth === 24) {
        const value = Math.round(sample < 0 ? sample * 0x800000 : sample * 0x7fffff);
        view.setUint8(offset, value & 0xff);
        view.setUint8(offset + 1, (value >> 8) & 0xff);
        view.setUint8(offset + 2, (value >> 16) & 0xff);
      } else {
        view.setInt16(offset, Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff), true);
      }
      offset += bytesPerSample;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function resample(input: Float32Array, fromRate: number, toRate: number) {
  if (fromRate === toRate) return input;
  const output = new Float32Array(Math.ceil((input.length * toRate) / fromRate));
  const ratio = fromRate / toRate;
  for (let index = 0; index < output.length; index++) {
    const position = index * ratio;
    const before = Math.floor(position);
    const fraction = position - before;
    output[index] =
      (input[before] ?? 0) * (1 - fraction) +
      (input[Math.min(before + 1, input.length - 1)] ?? 0) * fraction;
  }
  return output;
}

function toPcm16(channel: Float32Array) {
  const output = new Int16Array(channel.length);
  for (let index = 0; index < channel.length; index++) {
    const sample = Math.max(-1, Math.min(1, channel[index] ?? 0));
    output[index] = Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff);
  }
  return output;
}

export function encodeMp3(audio: AudioData, bitrate: 128 | 192 | 320): Blob {
  const left = resample(audio.left, audio.sampleRate, 44100);
  const right = resample(audio.right, audio.sampleRate, 44100);
  const encoder = new lamejs.Mp3Encoder(2, 44100, bitrate);
  const leftPcm = toPcm16(left);
  const rightPcm = toPcm16(right);
  const chunks: Uint8Array[] = [];
  const blockSize = 1152 * 8;
  for (let offset = 0; offset < leftPcm.length; offset += blockSize) {
    const encoded = encoder.encodeBuffer(
      leftPcm.subarray(offset, offset + blockSize),
      rightPcm.subarray(offset, offset + blockSize),
    );
    if (encoded.length) chunks.push(new Uint8Array(encoded));
  }
  const final = encoder.flush();
  if (final.length) chunks.push(new Uint8Array(final));
  return new Blob(chunks.map(toArrayBuffer), { type: "audio/mpeg" });
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipTime(date: Date) {
  return (
    ((date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)) >>> 0
  );
}

function zipDate(date: Date) {
  return (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) >>> 0;
}

export function createZip(files: { name: string; blob: Blob }[]): Promise<Blob> {
  return (async () => {
    const encoder = new TextEncoder();
    const localParts: Uint8Array[] = [];
    const centralParts: Uint8Array[] = [];
    let localOffset = 0;
    const date = new Date();

    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = new Uint8Array(await file.blob.arrayBuffer());
      const crc = crc32(data);
      const local = new Uint8Array(30 + name.length + data.length);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x800, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, zipTime(date), true);
      localView.setUint16(12, zipDate(date), true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, name.length, true);
      local.set(name, 30);
      local.set(data, 30 + name.length);
      localParts.push(local);

      const central = new Uint8Array(46 + name.length);
      const centralView = new DataView(central.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, zipTime(date), true);
      centralView.setUint16(14, zipDate(date), true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, name.length, true);
      centralView.setUint32(42, localOffset, true);
      central.set(name, 46);
      centralParts.push(central);
      localOffset += local.length;
    }

    const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, localOffset, true);
    return new Blob([...localParts, ...centralParts, end].map(toArrayBuffer), {
      type: "application/zip",
    });
  })();
}

export function safeFileName(name: string) {
  const safe = name
    .trim()
    .replace(/[<>:"/\\|?*]/g, "-")
    .split("")
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join("")
    .replace(/[. ]+$/g, "");
  return safe || "Untitled Mix";
}

export function audioTracks(tracks: TrackState[]) {
  return tracks.filter((track) => track.kind !== "bus");
}

export function tracksForStem(tracks: TrackState[], stemId: string) {
  return tracks.map((track) => ({
    ...track,
    solo: track.kind === "bus" || track.id === stemId,
    mute: track.kind === "bus" ? track.mute : track.id === stemId ? track.mute : true,
  }));
}
