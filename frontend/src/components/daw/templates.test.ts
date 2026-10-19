import { describe, expect, it } from "vitest";
import { defaultFx, routingWouldCycle } from "./engine";
import {
  applyTemplateToTrack,
  MIX_TEMPLATES,
  validateTemplate,
  validateTemplateLibrary,
} from "./templates";

describe("built-in mix templates", () => {
  it("contains 38 unique, valid templates", () => {
    expect(MIX_TEMPLATES).toHaveLength(38);
    expect(new Set(MIX_TEMPLATES.map((template) => template.id)).size).toBe(38);
    expect(validateTemplateLibrary()).toBe(true);
    expect(MIX_TEMPLATES.every((template) => validateTemplate(template).length === 0)).toBe(true);
  });

  it("references only registered plugins and known parameters", () => {
    const keys = new Set(Object.keys(defaultFx()));
    for (const template of MIX_TEMPLATES) {
      for (const track of template.tracks) {
        expect(track.plugins.length).toBeLessThanOrEqual(10);
        for (const plugin of track.plugins) {
          for (const key of Object.keys(plugin.parameters)) expect(keys.has(key)).toBe(true);
        }
      }
    }
  });

  it("ships engineering guardrails for AI follow-up adjustments", () => {
    for (const template of MIX_TEMPLATES) {
      expect(template.processingConstraints).toMatchObject({
        maxCorrectiveEqCutDb: 3,
        maxCorrectiveEqQ: 2.5,
        maxStereoWidth: 1.15,
        masteringCeilingDb: -1,
      });
      expect(template.aiInstructions).toEqual(
        expect.arrayContaining([
          "Use the template as a starting point: do not stack compression without measured gain reduction.",
          "Prefer broad, low-gain EQ moves; use narrow cuts only when analysis confirms a resonance.",
        ]),
      );
    }
  });

  it("gives every full-mix template dedicated shared effect returns and a master bus", () => {
    const fullMixes = MIX_TEMPLATES.filter((template) => template.category === "full-mix");
    expect(fullMixes).toHaveLength(6);
    for (const template of fullMixes) {
      const roles = new Set(template.tracks.map((track) => track.role));
      expect(roles).toEqual(
        new Set([
          "lead-vocal",
          "vocal-double",
          "harmony",
          "adlib",
          "vocal-bus",
          "reverb-bus",
          "delay-bus",
          "beat",
          "master",
        ]),
      );
      const vocalBus = template.tracks.find((track) => track.role === "vocal-bus");
      for (const send of vocalBus?.sends ?? []) expect(roles.has(send.targetRole)).toBe(true);
      for (const track of template.tracks.filter((item) =>
        ["lead-vocal", "vocal-double", "harmony", "adlib"].includes(item.role),
      )) {
        expect(track.volume).toBeTypeOf("number");
        expect(track.pan).toBeTypeOf("number");
        expect(
          track.plugins.some((plugin) =>
            ["Room Reverb", "Analog Delay", "Tape Echo", "Ping Pong Delay"].includes(
              plugin.pluginType,
            ),
          ),
        ).toBe(false);
      }
    }
  });

  it("keeps reverb and delay on return buses instead of vocal inserts", () => {
    const vocalRoles = new Set(["lead-vocal", "vocal-double", "harmony", "adlib", "vocal-bus"]);
    const spacePlugins = new Set(["Room Reverb", "Analog Delay", "Tape Echo", "Ping Pong Delay"]);
    for (const template of MIX_TEMPLATES) {
      for (const track of template.tracks.filter((item) => vocalRoles.has(item.role))) {
        expect(track.plugins.some((plugin) => spacePlugins.has(plugin.pluginType))).toBe(false);
      }
    }
  });

  it("applies a real chain and parameters to a track without replacing its audio", () => {
    const source = MIX_TEMPLATES.find((template) => template.id === "trap-vocal")!;
    const buffer = { duration: 2 } as AudioBuffer;
    const track = {
      id: "track-1",
      name: "Lead",
      colorIdx: 0,
      start: 0,
      buffer,
      peaks: [],
      volume: 0,
      pan: 0,
      mute: false,
      solo: false,
      inserts: Array<string | null>(10).fill(null),
      pluginBypass: {},
      fx: defaultFx(),
    };
    const updated = applyTemplateToTrack(track, source);
    expect(updated.buffer).toBe(buffer);
    expect(updated.inserts.slice(0, 3)).toEqual(["High Pass / Low Pass", "K-76", "KREATIVE Pitch"]);
    expect(updated.fx.pitchOn).toBe(true);
    expect(updated.pluginBypass["pitchCorrection"]).toBe(true);
    expect(updated.fx.delayType).toBe("off");
    expect(updated.volume).toBe(0);
    expect(updated.pan).toBe(0);
  });

  it("rejects output and send feedback loops", () => {
    const track = (id: string, routing = { outputBus: "master" as const, sends: {} }) => ({
      id,
      name: id,
      colorIdx: 0,
      start: 0,
      buffer: {} as AudioBuffer,
      peaks: [],
      volume: 0,
      pan: 0,
      mute: false,
      solo: false,
      inserts: Array<string | null>(10).fill(null),
      pluginBypass: {},
      fx: defaultFx(),
      routing,
    });
    const tracks = [track("vocal"), track("delay", { outputBus: "master", sends: { vocal: -12 } })];
    expect(routingWouldCycle(tracks, "vocal", { outputBus: "delay", sends: {} })).toBe(true);
    expect(
      routingWouldCycle([track("vocal"), track("delay")], "vocal", {
        outputBus: "master",
        sends: { delay: -18 },
      }),
    ).toBe(false);
  });
});
