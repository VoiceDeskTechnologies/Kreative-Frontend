import { describe, expect, it } from "vitest";
import { createZip, encodeMp3, encodeWav, safeFileName, type AudioData } from "./export-audio";

const audio: AudioData = {
  sampleRate: 44100,
  left: Float32Array.of(-1, 0, 1),
  right: Float32Array.of(1, 0, -1),
};

function readBlob(blob: Blob) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("Couldn't read the export blob."));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe("audio export encoding", () => {
  it.each([
    [16, 56, 1],
    [24, 62, 1],
    [32, 68, 3],
  ] as const)("writes %i-bit WAV headers and samples", async (bitDepth, expectedSize, format) => {
    const bytes = new Uint8Array(await readBlob(encodeWav(audio, bitDepth)));
    const view = new DataView(bytes.buffer);

    expect(bytes.length).toBe(expectedSize);
    expect(new TextDecoder().decode(bytes.subarray(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(bytes.subarray(8, 12))).toBe("WAVE");
    expect(view.getUint16(20, true)).toBe(format);
    expect(view.getUint16(34, true)).toBe(bitDepth);
    expect(view.getUint32(40, true)).toBe(expectedSize - 44);
  });

  it("encodes an MP3 file", () => {
    const mp3 = encodeMp3(audio, 192);

    expect(mp3.type).toBe("audio/mpeg");
    expect(mp3.size).toBeGreaterThan(0);
  });

  it("creates a ZIP containing named WAV entries", async () => {
    const file = new Blob(["audio"]);
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new TextEncoder().encode("audio").buffer,
    });
    const archive = new Uint8Array(
      await readBlob(await createZip([{ name: "Drums.wav", blob: file }])),
    );
    const contents = new TextDecoder().decode(archive);

    expect(new DataView(archive.buffer).getUint32(0, true)).toBe(0x04034b50);
    expect(contents).toContain("Drums.wav");
    expect(contents).toContain("audio");
    expect(new DataView(archive.buffer).getUint32(archive.length - 22, true)).toBe(0x06054b50);
  });

  it("removes path and platform-invalid characters from export names", () => {
    expect(safeFileName("../mix:final?.wav")).toBe("..-mix-final-.wav");
    expect(safeFileName("  ")).toBe("Untitled Mix");
  });
});
