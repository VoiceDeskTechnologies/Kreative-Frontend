import { describe, expect, it } from "vitest";
import { smoothedSpectrumLevel } from "./spectrum";

describe("spectrum display smoothing", () => {
  it("softens isolated FFT peaks without flattening them", () => {
    const spectrum = new Float32Array(4096).fill(-90);
    spectrum[320] = -24;
    const level = smoothedSpectrumLevel(spectrum, (320 * 48000) / 8192, 48000, 8192);

    expect(level).toBeGreaterThan(0);
    expect(level).toBeLessThan((-24 + 96) / 90);
  });

  it("keeps silent and invalid bins at the display floor", () => {
    const spectrum = new Float32Array(4096).fill(Number.NEGATIVE_INFINITY);

    expect(smoothedSpectrumLevel(spectrum, 1000, 48000, 8192)).toBe(0);
    expect(smoothedSpectrumLevel(spectrum, 0, 48000, 8192)).toBe(0);
  });
});
