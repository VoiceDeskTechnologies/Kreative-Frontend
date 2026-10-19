import { getPluginFamily, getPluginSettings } from "./data";
import { defaultFx, type Fx, type TrackState } from "./engine";
import type { MixTemplate, TemplateRole } from "./templates";

export type TemplatePluginLoad = {
  slot: number;
  plugin: string;
  parameters: Partial<Fx>;
  enabled: boolean;
};

export type TemplateTrackPlan = {
  role: TemplateRole;
  outputBus: string;
  volume?: number;
  pan?: number;
  sends: MixTemplate["tracks"][number]["sends"];
  plugins: TemplatePluginLoad[];
};

/** Compiles declarative template data into the browser engine's insert plan. */
export function compileTemplateTrack(
  template: MixTemplate,
  role: TemplateRole = "lead-vocal",
): TemplateTrackPlan {
  const definition = template.tracks.find((item) => item.role === role) ?? template.tracks[0];
  if (!definition) throw new Error(`Template ${template.name} has no processing track.`);
  return {
    role: definition.role,
    outputBus: definition.outputBus,
    ...(definition.volume === undefined ? {} : { volume: definition.volume }),
    ...(definition.pan === undefined ? {} : { pan: definition.pan }),
    sends: definition.sends,
    plugins: definition.plugins.map((item, slot) => {
      if (!getPluginSettings(item.pluginType)) {
        throw new Error(`Template references unavailable plugin: ${item.pluginType}`);
      }
      return {
        slot,
        plugin: item.pluginType,
        parameters: item.parameters,
        enabled: item.enabledByDefault,
      };
    }),
  };
}

export function applyTemplatePlan(trackState: TrackState, plan: TemplateTrackPlan): TrackState {
  const fx = defaultFx();
  const inserts: (string | null)[] = Array(10).fill(null);
  const pluginBypass: Record<string, boolean> = {};
  for (const item of plan.plugins) {
    inserts[item.slot] = item.plugin;
    Object.assign(fx, item.parameters);
    const family = getPluginFamily(item.plugin);
    if (family) pluginBypass[family] = !item.enabled;
  }
  return {
    ...trackState,
    ...(plan.volume === undefined ? {} : { volume: plan.volume }),
    ...(plan.pan === undefined ? {} : { pan: plan.pan }),
    inserts,
    pluginBypass,
    fx,
  };
}
