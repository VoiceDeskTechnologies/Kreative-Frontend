import { describe, expect, it } from "vitest";
import { getPluginFamily, getPluginSettings, PLUGINS, PRESETS } from "./data";
import { defaultFx } from "./engine";
import {
  getFactoryPluginPresets,
  getUserPluginPresets,
  removeUserPluginPreset,
  saveUserPluginPreset,
} from "./plugin-presets";

describe("factory presets", () => {
  it("give each preset a distinct, complete processing profile", () => {
    const signatures = PRESETS.map((preset) => JSON.stringify({ ...defaultFx(), ...preset.fx }));

    expect(PRESETS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(signatures).size).toBe(PRESETS.length);
    expect(PRESETS.every((preset) => preset.description.length > 20)).toBe(true);
  });

  it("keeps every selectable processor at an advanced control depth", () => {
    const actions = Object.values(PLUGINS).flatMap((plugins) =>
      plugins.map(([, action]) => action),
    );
    const configurable = actions.filter((action) => action !== "focus" && action !== "phase");

    expect(configurable.every((action) => Object.keys(action).length >= 4)).toBe(true);
  });

  it("maps the insert catalog to distinct supported processor blocks", () => {
    const names = Object.values(PLUGINS).flatMap((plugins) => plugins.map(([name]) => name));
    const families = names.map(getPluginFamily);

    expect(families.every(Boolean)).toBe(true);
    expect(new Set(families).size).toBe(14);
    expect(getPluginFamily("Parametric EQ")).not.toBe(getPluginFamily("Four-Band Console EQ"));
    expect(getPluginSettings("Smoothen")).toMatchObject({ smoothenOn: true, smoothenMix: 1 });
    expect(getPluginSettings("Parametric EQ")?.eqBands).toHaveLength(3);
    expect(getPluginSettings("Four-Band Console EQ")?.eqBands).toHaveLength(0);
    expect(getPluginSettings("KREATIVE Pitch")).toMatchObject({ pitchOn: true, pitchMix: 1 });
    expect(getPluginFamily("K-2A")).toBe("compressor");
    expect(getPluginFamily("K-76")).toBe("compressor");
    expect(getPluginFamily("K1-Imager")).toBe("imager");
    expect(PLUGINS["Dynamics"]?.map(([name]) => name)).toEqual(
      expect.arrayContaining(["K-2A", "K-76"]),
    );
    expect(PLUGINS["Imaging"]?.map(([name]) => name)).toContain("K1-Imager");
  });

  it("provides at least ten distinct factory voicings for every plugin", () => {
    const pluginNames = Object.values(PLUGINS).flatMap((plugins) => plugins.map(([name]) => name));
    for (const pluginName of pluginNames) {
      const presets = getFactoryPluginPresets(pluginName);
      expect(presets.length, pluginName).toBeGreaterThanOrEqual(10);
      expect(
        new Set(presets.map((preset) => JSON.stringify(preset.settings))).size,
        pluginName,
      ).toBe(presets.length);
    }
  });

  it("ships source-aware vocal, drum, and instrument EQ starting points", () => {
    const presets = getFactoryPluginPresets("Parametric EQ");
    const vocalClean = presets.find((preset) => preset.name.includes("Vocal Clean"));
    const vocalDeBox = presets.find((preset) => preset.name.includes("Vocal De-Box"));
    const kick = presets.find((preset) => preset.name.includes("Kick Punch"));
    const bass = presets.find((preset) => preset.name.includes("Bass Definition"));

    expect(vocalClean?.category).toBe("Vocals");
    expect(
      vocalClean?.settings.eqBands?.some(
        (band) => band.type === "highPass" && band.frequency === 80,
      ),
    ).toBe(true);
    expect(
      vocalDeBox?.settings.eqBands?.some(
        (band) => band.dynamic && band.frequency === 320 && band.rangeDb >= 3,
      ),
    ).toBe(true);
    expect(kick?.category).toBe("Drums");
    expect(
      kick?.settings.eqBands?.some((band) => band.type === "highPass" && band.frequency < 40),
    ).toBe(true);
    expect(bass?.category).toBe("Instruments");
  });

  it("ships model-specific professional compressor voicings", () => {
    const k2a = getFactoryPluginPresets("K-2A");
    const k76 = getFactoryPluginPresets("K-76");

    expect(k2a[0]).toMatchObject({ name: "K-2A · Opto Vocal Leveler", category: "Vocals" });
    expect(k2a[0]?.settings).toMatchObject({ compRatio: 3, compRelease: 0.32 });
    expect(k76[0]).toMatchObject({ name: "K-76 · All-Buttons Drum Crush", category: "Drums" });
    expect(k76[0]?.settings).toMatchObject({ compRatio: 20, compAttack: 0.001 });
  });

  it("ships stereo-field factory voicings for K1-Imager", () => {
    const presets = getFactoryPluginPresets("K1-Imager");
    expect(presets[0]).toMatchObject({ name: "K1-Imager · Wide but Safe", category: "Mix & Bus" });
    expect(presets[0]?.settings).toMatchObject({ width: 1.16, imagerMono: 0.08 });
    expect(presets.some((preset) => (preset.settings.width ?? 1) > 1.4)).toBe(true);
  });

  it("saves and removes user presets independently for each plugin", () => {
    const smoothenPreset = {
      id: "smoothen-user-test",
      name: "My Vocal Ride",
      settings: { smoothenOn: true, smoothenTarget: -20, smoothenRange: 6 },
    };
    const eqPreset = {
      id: "eq-user-test",
      name: "My Vocal Notch",
      settings: {
        eqBands: [
          {
            id: "saved-band",
            type: "notch" as const,
            frequency: 440,
            gain: 0,
            q: 2,
            enabled: true,
            dynamic: false,
            thresholdDb: -24,
            rangeDb: 6,
            attack: 0.01,
            release: 0.16,
          },
        ],
      },
    };

    try {
      expect(saveUserPluginPreset("Smoothen", smoothenPreset)).toEqual([smoothenPreset]);
      expect(saveUserPluginPreset("Parametric EQ", eqPreset)).toEqual([eqPreset]);
      expect(getUserPluginPresets("Smoothen")).toEqual([smoothenPreset]);
      expect(getUserPluginPresets("Parametric EQ")).toEqual([eqPreset]);
      expect(removeUserPluginPreset("Smoothen", smoothenPreset.id)).toEqual([]);
      expect(getUserPluginPresets("Parametric EQ")).toEqual([eqPreset]);
    } finally {
      window.localStorage.removeItem("kreative.plugin-presets.v1:Smoothen");
      window.localStorage.removeItem("kreative.plugin-presets.v1:Parametric EQ");
    }
  });
});
