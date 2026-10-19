import { describe, expect, it } from "vitest";
import { dbToFaderPosition, faderPositionToDb } from "./mixer-fader-scale";

describe("mixer fader scale", () => {
  it("maps the supported gain limits to the slider limits", () => {
    expect(dbToFaderPosition(-60)).toBe(0);
    expect(dbToFaderPosition(6)).toBe(1);
    expect(faderPositionToDb(0)).toBe(-60);
    expect(faderPositionToDb(1)).toBe(6);
  });

  it("keeps 0 dB in the upper part of the fader travel", () => {
    expect(dbToFaderPosition(0)).toBeCloseTo(0.88);
    expect(faderPositionToDb(dbToFaderPosition(0))).toBeCloseTo(0);
  });

  it("round-trips gain values across the track scale", () => {
    for (const db of [-60, -48, -36, -24, -18, -12, -6, -3, 0, 3, 6]) {
      expect(faderPositionToDb(dbToFaderPosition(db))).toBeCloseTo(db);
    }
  });

  it("clamps values that exceed the supported fader travel", () => {
    expect(dbToFaderPosition(-100)).toBe(0);
    expect(dbToFaderPosition(12)).toBe(1);
    expect(faderPositionToDb(-1)).toBe(-60);
    expect(faderPositionToDb(2)).toBe(6);
  });
});
