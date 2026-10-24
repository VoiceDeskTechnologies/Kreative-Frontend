import { WORKLET_CODE } from "./worklet";

export const SPECTRUM_FFT_SIZE = 8192;

export type ModType = "off" | "chorus" | "flanger" | "phaser" | "tremolo";
export type ModWaveform = "sine" | "triangle" | "square" | "sawtooth";
export type DelayType = "off" | "delay" | "tape" | "pingpong";
export type EqBandType = "bell" | "lowShelf" | "highShelf" | "lowPass" | "highPass" | "notch";
export type EqBand = {
  id: string;
  type: EqBandType;
  frequency: number;
  gain: number;
  q: number;
  enabled: boolean;
  dynamic: boolean;
  thresholdDb: number;
  rangeDb: number;
  attack: number;
  release: number;
};
export type PitchScale = 0 | 1 | 2 | 3 | 4;
export type Fx = {
  eqLow: number;
  eqMid: number;
  eqMidFreq: number;
  eqMidQ: number;
  eqHighMid: number;
  eqHighMidFreq: number;
  eqHighMidQ: number;
  eqHigh: number;
  eqBands: EqBand[];
  hpOn: boolean;
  hpFreq: number;
  lpOn: boolean;
  lpFreq: number;
  compOn: boolean;
  compThreshold: number;
  compRatio: number;
  compAttack: number;
  compRelease: number;
  compKnee: number;
  compMakeup: number;
  compMix: number;
  smoothenOn: boolean;
  smoothenTarget: number;
  smoothenRange: number;
  smoothenFloor: number;
  smoothenSpeed: number;
  smoothenMix: number;
  pitchOn: boolean;
  pitchKey: number;
  pitchScale: PitchScale;
  pitchSpeed: number;
  pitchHumanize: number;
  pitchFloor: number;
  pitchMix: number;
  pitchReference: number;
  pitchTranspose: number;
  pitchRangeLow: number;
  pitchRangeHigh: number;
  deEssOn: boolean;
  deEssFrequency: number;
  deEssThreshold: number;
  deEssRange: number;
  deEssAttack: number;
  deEssRelease: number;
  deEssMix: number;
  dynMode: 0 | 1 | 2;
  dynThreshold: number;
  dynAttack: number;
  dynRelease: number;
  dynRange: number;
  dynHysteresis: number;
  satMode: 0 | 1 | 2 | 3 | 4;
  drive: number;
  satMix: number;
  satBias: number;
  satOutput: number;
  ampModel: 0 | 1 | 2 | 3 | 4;
  ampDrive: number;
  ampBias: number;
  ampSag: number;
  ampPresence: number;
  ampOutput: number;
  ampBass: number;
  ampMid: number;
  ampTreble: number;
  cabOn: boolean;
  width: number;
  phase: boolean;
  imagerBalance: number;
  imagerRotation: number;
  imagerMono: number;
  modType: ModType;
  modWaveform: ModWaveform;
  modRate: number;
  modDepth: number;
  modMix: number;
  modFeedback: number;
  modPan: number;
  modTone: number;
  delayType: DelayType;
  delayTime: number;
  delayFeedback: number;
  delayMix: number;
  delayTone: number;
  reverb: number;
  reverbSize: number;
  reverbPreDelay: number;
  reverbTone: number;
};
export type TrackState = {
  id: string;
  name: string;
  kind?: "audio" | "bus";
  busRole?: "vocal" | "reverb" | "delay" | "master";
  returnOnly?: boolean;
  delaySync?: "eighth" | "dotted-eighth";
  colorIdx: number;
  start: number;
  buffer: AudioBuffer;
  peaks: number[];
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  inserts: (string | null)[];
  pluginBypass: Record<string, boolean>;
  fx: Fx;
  routing?: TrackRouting;
  sendSlots?: (BusSendSlot | null)[];
};
export type BusSendSlot = {
  targetId: string;
  level: number;
};
export type TrackRouting = {
  outputBus: "master" | string;
  sends: Record<string, number>;
};
export const defaultTrackRouting = (): TrackRouting => ({ outputBus: "master", sends: {} });
export function routingWouldCycle(tracks: TrackState[], sourceId: string, next: TrackRouting) {
  const edges = new Map<string, string[]>();
  for (const track of tracks) {
    const routing = track.id === sourceId ? next : (track.routing ?? defaultTrackRouting());
    edges.set(track.id, [
      ...(routing.outputBus === "master" ? [] : [routing.outputBus]),
      ...Object.entries(routing.sends)
        .filter(([, level]) => level > -60)
        .map(([targetId]) => targetId),
    ]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const target of edges.get(id) ?? []) if (edges.has(target) && visit(target)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...edges.keys()].some(visit);
}
export const defaultFx = (): Fx => ({
  eqLow: 0,
  eqMid: 0,
  eqMidFreq: 1200,
  eqMidQ: 0.9,
  eqHighMid: 0,
  eqHighMidFreq: 3200,
  eqHighMidQ: 0.9,
  eqHigh: 0,
  eqBands: [],
  hpOn: false,
  hpFreq: 80,
  lpOn: false,
  lpFreq: 12000,
  compOn: false,
  compThreshold: -18,
  compRatio: 4,
  compAttack: 0.01,
  compRelease: 0.18,
  compKnee: 6,
  compMakeup: 0,
  compMix: 1,
  smoothenOn: false,
  smoothenTarget: -18,
  smoothenRange: 9,
  smoothenFloor: -54,
  smoothenSpeed: 0.25,
  smoothenMix: 1,
  pitchOn: false,
  pitchKey: 0,
  pitchScale: 1,
  pitchSpeed: 0.08,
  pitchHumanize: 0.25,
  pitchFloor: -54,
  pitchMix: 1,
  pitchReference: 440,
  pitchTranspose: 0,
  pitchRangeLow: 40,
  pitchRangeHigh: 88,
  deEssOn: false,
  deEssFrequency: 6500,
  deEssThreshold: -28,
  deEssRange: 6,
  deEssAttack: 0.002,
  deEssRelease: 0.08,
  deEssMix: 1,
  dynMode: 0,
  dynThreshold: -45,
  dynAttack: 0.01,
  dynRelease: 0.12,
  dynRange: -60,
  dynHysteresis: 4,
  satMode: 0,
  drive: 0.3,
  satMix: 1,
  satBias: 0,
  satOutput: 0,
  ampModel: 0,
  ampDrive: 0.35,
  ampBias: 0,
  ampSag: 0.25,
  ampPresence: 0.45,
  ampOutput: 0,
  ampBass: 0,
  ampMid: 0,
  ampTreble: 0,
  cabOn: true,
  width: 1,
  phase: false,
  imagerBalance: 0,
  imagerRotation: 0,
  imagerMono: 0,
  modType: "off",
  modWaveform: "sine",
  modRate: 0.8,
  modDepth: 0.5,
  modMix: 0.5,
  modFeedback: 0.12,
  modPan: 0,
  modTone: 12000,
  delayType: "off",
  delayTime: 0.35,
  delayFeedback: 0.35,
  delayMix: 0.25,
  delayTone: 12000,
  reverb: 0,
  reverbSize: 0.5,
  reverbPreDelay: 0.025,
  reverbTone: 12000,
});

type Nodes = {
  input: GainNode;
  hp: BiquadFilterNode;
  lp: BiquadFilterNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  consoleHighMid: BiquadFilterNode;
  high: BiquadFilterNode;
  parametricBands: BiquadFilterNode[];
  fx: AudioWorkletNode;
  cabHp: BiquadFilterNode;
  cabLp: BiquadFilterNode;
  ampLow: BiquadFilterNode;
  ampMid: BiquadFilterNode;
  ampHigh: BiquadFilterNode;
  ampOut: GainNode;
  comp: DynamicsCompressorNode;
  compDry: GainNode;
  compWet: GainNode;
  compMakeup: GainNode;
  compSum: GainNode;
  dry: GainNode;
  chDelay: DelayNode;
  chFb: GainNode;
  chPan: StereoPannerNode;
  phPan: StereoPannerNode;
  modTone: BiquadFilterNode;
  chWet: GainNode;
  aps: BiquadFilterNode[];
  phWet: GainNode;
  trem: GainNode;
  lfo: OscillatorNode;
  lfoCh: GainNode;
  lfoPh: GainNode;
  lfoTr: GainNode;
  gain: GainNode;
  pan: StereoPannerNode;
  dryOutput: GainNode;
  analyser: AnalyserNode;
  send: GainNode;
  revPre: DelayNode;
  revTone: BiquadFilterNode;
  earlyDelay: DelayNode;
  earlyTone: BiquadFilterNode;
  earlySend: GainNode;
  dSend: GainNode;
  dL: DelayNode;
  dR: DelayNode;
  dFilt: BiquadFilterNode;
  dSelf: GainNode;
  dCross: GainNode;
  dBack: GainNode;
  pL: StereoPannerNode;
  pR: StereoPannerNode;
  output: GainNode;
  routeGains: Map<string, GainNode>;
  all: AudioNode[];
};

const dbToGain = (db: number) => (db <= -60 ? 0 : Math.pow(10, db / 20));

class Engine {
  ctx: AudioContext | null = null;
  private ready: Promise<AudioContext> | null = null;
  master!: GainNode;
  masterAnalyser!: AnalyserNode;
  reverbIn!: GainNode;
  private reverbReturn!: GainNode;
  private masterBusId: string | null = null;
  nodes = new Map<string, Nodes>();
  sources = new Map<string, AudioBufferSourceNode>();
  riderLevels = new Map<string, number>();
  pitchReadouts = new Map<string, { detectedMidi: number; targetMidi: number; cents: number }>();
  dynamicEqReductions = new Map<string, number[]>();
  startedAt = 0;
  offset = 0;
  playing = false;
  private buf = new Float32Array(2048);

  init() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const ctx = new AudioContext();
      const url = URL.createObjectURL(new Blob([WORKLET_CODE], { type: "application/javascript" }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      this.master = ctx.createGain();
      this.masterAnalyser = ctx.createAnalyser();
      this.masterAnalyser.fftSize = SPECTRUM_FFT_SIZE;
      this.masterAnalyser.smoothingTimeConstant = 0.82;
      this.masterAnalyser.minDecibels = -100;
      this.masterAnalyser.maxDecibels = 0;
      this.master.connect(this.masterAnalyser).connect(ctx.destination);
      const len = ctx.sampleRate * 2.5;
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      let seed = 0x13579bdf;
      const nextNoise = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return (seed / 4294967296) * 2 - 1;
      };
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        let filtered = 0;
        for (let i = 0; i < len; i++) {
          const time = i / ctx.sampleRate;
          const early =
            i === Math.floor(ctx.sampleRate * 0.013) ||
            i === Math.floor(ctx.sampleRate * 0.029) ||
            i === Math.floor(ctx.sampleRate * 0.047);
          const tail = nextNoise() * Math.pow(1 - i / len, 3.4);
          filtered += (tail - filtered) * 0.08;
          d[i] = (early ? (c === 0 ? 0.18 : -0.15) : 0) + filtered * (1 - Math.min(0.35, time * 0.08));
        }
      }
      const conv = ctx.createConvolver();
      conv.buffer = ir;
      this.reverbIn = ctx.createGain();
      this.reverbReturn = ctx.createGain();
      this.reverbIn.connect(conv).connect(this.reverbReturn).connect(this.master);
      this.ctx = ctx;
      return ctx;
    })();
    return this.ready;
  }

  async decode(data: Blob) {
    const ctx = await this.init();
    return ctx.decodeAudioData(await data.arrayBuffer());
  }

  addTrack(id: string) {
    const ctx = this.ctx!;
    const bq = (type: BiquadFilterType, f: number) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      return b;
    };
    const g = (v = 1) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    const input = g(),
      hp = bq("highpass", 10),
      lp = bq("lowpass", 22000);
    const low = bq("lowshelf", 200),
      mid = bq("peaking", 1200),
      consoleHighMid = bq("peaking", 3200),
      high = bq("highshelf", 6000);
    mid.Q.value = 0.9;
    consoleHighMid.Q.value = 0.9;
    const parametricBands = Array.from({ length: 8 }, () => bq("peaking", 1000));
    const fx = new AudioWorkletNode(ctx, "kreative-fx", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
    });
    fx.port.onmessage = (
      event: MessageEvent<{
        type?: string;
        gainDb?: number;
        detectedMidi?: number;
        targetMidi?: number;
        cents?: number;
        reductionsDb?: number[];
      }>,
    ) => {
      if (event.data.type === "smoothen-meter" && typeof event.data.gainDb === "number") {
        this.riderLevels.set(id, event.data.gainDb);
      }
      if (
        event.data.type === "pitch-meter" &&
        typeof event.data.detectedMidi === "number" &&
        typeof event.data.targetMidi === "number" &&
        typeof event.data.cents === "number"
      ) {
        this.pitchReadouts.set(id, {
          detectedMidi: event.data.detectedMidi,
          targetMidi: event.data.targetMidi,
          cents: event.data.cents,
        });
      }
      if (event.data.type === "eq-dynamic-meter" && Array.isArray(event.data.reductionsDb)) {
        this.dynamicEqReductions.set(
          id,
          Array.from({ length: 8 }, (_, index) => {
            const value = event.data.reductionsDb?.[index];
            return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
          }),
        );
      }
    };
    const cabHp = bq("highpass", 10),
      cabLp = bq("lowpass", 22000);
    const ampLow = bq("lowshelf", 120),
      ampMid = bq("peaking", 800),
      ampHigh = bq("highshelf", 4000);
    ampMid.Q.value = 0.8;
    const ampOut = g(),
      compDry = g(1),
      compWet = g(0),
      compMakeup = g();
    const compSum = g();
    const comp = ctx.createDynamicsCompressor();
    // modulation block
    const dry = g(),
      chDelay = ctx.createDelay(0.1),
      chFb = g(0),
      chPan = ctx.createStereoPanner(),
      phPan = ctx.createStereoPanner(),
      modTone = bq("lowpass", 12000),
      chWet = g(0),
      phWet = g(0),
      trem = g(1);
    const aps = [0, 1, 2, 3].map(() => bq("allpass", 800));
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.8;
    const lfoCh = g(0),
      lfoPh = g(0),
      lfoTr = g(0);
    lfo.connect(lfoCh).connect(chDelay.delayTime);
    lfo.connect(lfoPh);
    aps.forEach((a) => lfoPh.connect(a.frequency));
    lfo.connect(lfoTr).connect(trem.gain);
    lfo.start();
    const gain = g(),
      pan = ctx.createStereoPanner(),
      dryOutput = g();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = SPECTRUM_FFT_SIZE;
    analyser.smoothingTimeConstant = 0.82;
    analyser.minDecibels = -100;
    analyser.maxDecibels = 0;
    const send = g(0),
      revPre = ctx.createDelay(0.25),
      revTone = bq("lowpass", 12000),
      earlyDelay = ctx.createDelay(0.1),
      earlyTone = bq("lowpass", 12000),
      earlySend = g(0);
    input.connect(hp).connect(lp).connect(low).connect(mid).connect(consoleHighMid).connect(high);
    let eqOutput: AudioNode = high;
    for (const band of parametricBands) eqOutput = eqOutput.connect(band);
    eqOutput
      .connect(fx)
      .connect(cabHp)
      .connect(cabLp)
      .connect(ampLow)
      .connect(ampMid)
      .connect(ampHigh)
      .connect(ampOut);
    ampOut.connect(comp).connect(compMakeup).connect(compWet).connect(compSum);
    ampOut.connect(compDry).connect(compSum);
    compSum.connect(dry).connect(trem);
    compSum.connect(chDelay).connect(chPan).connect(modTone).connect(chWet).connect(trem);
    chDelay.connect(chFb).connect(chDelay);
    compSum.connect(aps[0]!);
    aps[0]!
      .connect(aps[1]!)
      .connect(aps[2]!)
      .connect(aps[3]!)
      .connect(phWet)
      .connect(phPan)
      .connect(modTone)
      .connect(trem);
    const output = g();
    trem.connect(gain).connect(pan).connect(analyser);
    pan.connect(dryOutput).connect(output);
    pan.connect(revPre).connect(revTone).connect(send).connect(this.reverbIn);
    pan.connect(earlyDelay).connect(earlyTone).connect(earlySend).connect(this.reverbIn);
    // delay block
    const dSend = g(0),
      dL = ctx.createDelay(2),
      dR = ctx.createDelay(2),
      dFilt = bq("lowpass", 18000);
    const dSelf = g(0),
      dCross = g(0),
      dBack = g(0),
      pL = ctx.createStereoPanner(),
      pR = ctx.createStereoPanner();
    pan.connect(dSend).connect(dL);
    dL.connect(dFilt);
    dFilt.connect(dSelf).connect(dL);
    dFilt.connect(dCross).connect(dR);
    dR.connect(dBack).connect(dL);
    dL.connect(pL).connect(output);
    dR.connect(pR).connect(output);
    const all: AudioNode[] = [
      input,
      hp,
      lp,
      low,
      mid,
      consoleHighMid,
      high,
      ...parametricBands,
      fx,
      cabHp,
      cabLp,
      ampLow,
      ampMid,
      ampHigh,
      ampOut,
      comp,
      compDry,
      compWet,
      compMakeup,
      compSum,
      dry,
      chDelay,
      chFb,
      chPan,
      phPan,
      modTone,
      chWet,
      ...aps,
      phWet,
      trem,
      lfo,
      lfoCh,
      lfoPh,
      lfoTr,
      gain,
      pan,
      dryOutput,
      analyser,
      send,
      revPre,
      revTone,
      earlyDelay,
      earlyTone,
      earlySend,
      dSend,
      dL,
      dR,
      dFilt,
      dSelf,
      dCross,
      dBack,
      pL,
      pR,
      output,
    ];
    this.nodes.set(id, {
      input,
      hp,
      lp,
      low,
      mid,
      consoleHighMid,
      high,
      parametricBands,
      fx,
      cabHp,
      cabLp,
      ampLow,
      ampMid,
      ampHigh,
      ampOut,
      comp,
      compDry,
      compWet,
      compMakeup,
      compSum,
      dry,
      chDelay,
      chFb,
      chPan,
      phPan,
      modTone,
      chWet,
      aps,
      phWet,
      trem,
      lfo,
      lfoCh,
      lfoPh,
      lfoTr,
      gain,
      pan,
      dryOutput,
      analyser,
      send,
      revPre,
      revTone,
      earlyDelay,
      earlyTone,
      earlySend,
      dSend,
      dL,
      dR,
      dFilt,
      dSelf,
      dCross,
      dBack,
      pL,
      pR,
      output,
      routeGains: new Map(),
      all,
    });
  }

  removeTrack(id: string) {
    const s = this.sources.get(id);
    if (s) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* stopped */
      }
    }
    this.sources.delete(id);
    this.riderLevels.delete(id);
    this.pitchReadouts.delete(id);
    this.dynamicEqReductions.delete(id);
    if (this.masterBusId === id) {
      this.reverbReturn.disconnect();
      this.reverbReturn.connect(this.master);
      this.masterBusId = null;
    }
    const n = this.nodes.get(id);
    if (n) {
      n.lfo.stop();
      for (const routeGain of n.routeGains.values()) routeGain.disconnect();
      n.all.forEach((node) => node.disconnect());
    }
    this.nodes.delete(id);
  }

  update(tracks: TrackState[]) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, 0.015);
    const anySolo = tracks.some((x) => x.solo);
    const masterBus = tracks.find((track) => track.busRole === "master");
    if (this.masterBusId !== (masterBus?.id ?? null)) {
      this.reverbReturn.disconnect();
      this.reverbReturn.connect((masterBus && this.nodes.get(masterBus.id)?.input) ?? this.master);
      this.masterBusId = masterBus?.id ?? null;
    }
    for (const tr of tracks) {
      const n = this.nodes.get(tr.id);
      if (!n) continue;
      const f = tr.fx;
      const bypassed = (family: string) => tr.pluginBypass[family] === true;
      const parametricEqBypassed = bypassed("parametricEq");
      if (parametricEqBypassed || !tr.fx.eqBands.some((band) => band.enabled && band.dynamic)) {
        this.dynamicEqReductions.set(tr.id, Array(8).fill(0));
      }
      const consoleEqBypassed = bypassed("consoleEq");
      const compressorBypassed = bypassed("compressor");
      const gateBypassed = bypassed("gate");
      const smoothenBypassed = bypassed("smoothen");
      const pitchBypassed = bypassed("pitchCorrection");
      const saturationBypassed = bypassed("saturation");
      const ampBypassed = bypassed("amp");
      const modulationBypassed = bypassed("modulation");
      const delayBypassed = bypassed("delay");
      const reverbBypassed = bypassed("reverb");
      const utilityBypassed = bypassed("utility");
      const imagerBypassed = bypassed("imager");
      const audible = !tr.mute && (!anySolo || tr.solo || tr.kind === "bus");
      set(n.gain.gain, audible ? dbToGain(tr.volume) : 0);
      set(n.dryOutput.gain, tr.returnOnly ? 0 : 1);
      set(n.pan.pan, utilityBypassed ? 0 : tr.pan);
      set(n.hp.frequency, !consoleEqBypassed && f.hpOn ? f.hpFreq : 10);
      set(n.lp.frequency, !consoleEqBypassed && f.lpOn ? f.lpFreq : 22000);
      set(n.low.gain, consoleEqBypassed ? 0 : f.eqLow);
      set(n.mid.gain, consoleEqBypassed ? 0 : f.eqMid);
      set(n.mid.frequency, f.eqMidFreq);
      set(n.mid.Q, f.eqMidQ);
      set(n.consoleHighMid.gain, consoleEqBypassed ? 0 : f.eqHighMid);
      set(n.consoleHighMid.frequency, f.eqHighMidFreq);
      set(n.consoleHighMid.Q, f.eqHighMidQ);
      set(n.high.gain, consoleEqBypassed ? 0 : f.eqHigh);
      const bandTypes: Record<EqBandType, BiquadFilterType> = {
        bell: "peaking",
        lowShelf: "lowshelf",
        highShelf: "highshelf",
        lowPass: "lowpass",
        highPass: "highpass",
        notch: "notch",
      };
      n.parametricBands.forEach((node, index) => {
        const band = f.eqBands[index];
        node.type = !parametricEqBypassed && band?.enabled ? bandTypes[band.type] : "peaking";
        set(node.frequency, band?.frequency ?? 1000);
        set(node.Q, band?.q ?? 1);
        set(node.gain, !parametricEqBypassed && band?.enabled ? band.gain : 0);
      });
      const P = (k: string, v: number) => {
        const p = n.fx.parameters.get(k);
        if (p) p.value = v;
      };
      P("dynMode", gateBypassed ? 0 : f.dynMode);
      P("dynThresh", f.dynThreshold);
      P("dynAttack", f.dynAttack);
      P("dynRelease", f.dynRelease);
      P("dynRange", f.dynRange);
      P("dynHysteresis", f.dynHysteresis);
      P("smoothenOn", !smoothenBypassed && f.smoothenOn ? 1 : 0);
      P("smoothenTarget", f.smoothenTarget);
      P("smoothenRange", f.smoothenRange);
      P("smoothenFloor", f.smoothenFloor);
      P("smoothenSpeed", f.smoothenSpeed);
      P("smoothenMix", f.smoothenMix);
      P("pitchOn", !pitchBypassed && f.pitchOn ? 1 : 0);
      P("pitchKey", f.pitchKey);
      P("pitchScale", f.pitchScale);
      P("pitchSpeed", f.pitchSpeed);
      P("pitchHumanize", f.pitchHumanize);
      P("pitchFloor", f.pitchFloor);
      P("pitchMix", f.pitchMix);
      P("pitchReference", f.pitchReference);
      P("pitchTranspose", f.pitchTranspose);
      P("pitchRangeLow", f.pitchRangeLow);
      P("pitchRangeHigh", f.pitchRangeHigh);
      P("deEssOn", !bypassed("deEsser") && f.deEssOn ? 1 : 0);
      P("deEssFrequency", f.deEssFrequency);
      P("deEssThreshold", f.deEssThreshold);
      P("deEssRange", f.deEssRange);
      P("deEssAttack", f.deEssAttack);
      P("deEssRelease", f.deEssRelease);
      P("deEssMix", f.deEssMix);
      n.parametricBands.forEach((_, index) => {
        const band = f.eqBands[index];
        const prefix = `eqDyn${index}`;
        P(`${prefix}Enabled`, !parametricEqBypassed && band?.enabled && band.dynamic ? 1 : 0);
        P(`${prefix}Frequency`, band?.frequency ?? 1000);
        P(`${prefix}Gain`, band?.gain ?? 0);
        P(`${prefix}Q`, band?.q ?? 1);
        P(`${prefix}Threshold`, band?.thresholdDb ?? -24);
        P(`${prefix}Range`, band?.rangeDb ?? 6);
        P(`${prefix}Attack`, band?.attack ?? 0.01);
        P(`${prefix}Release`, band?.release ?? 0.16);
      });
      P("satMode", saturationBypassed ? 0 : f.satMode);
      P("drive", f.drive);
      P("satMix", f.satMix);
      P("satBias", f.satBias);
      P("satOutput", f.satOutput);
      P("ampModel", ampBypassed ? 0 : f.ampModel);
      P("ampDrive", f.ampDrive);
      P("ampBias", f.ampBias);
      P("ampSag", f.ampSag);
      P("ampPresence", f.ampPresence);
      P("width", utilityBypassed && imagerBypassed ? 1 : f.width);
      P("phase", utilityBypassed ? 0 : f.phase ? 1 : 0);
      P("imagerBalance", imagerBypassed ? 0 : f.imagerBalance);
      P("imagerRotation", imagerBypassed ? 0 : f.imagerRotation);
      P("imagerMono", imagerBypassed ? 0 : f.imagerMono);
      n.comp.threshold.value = !compressorBypassed && f.compOn ? f.compThreshold : 0;
      const safeRatio = tr.inserts.includes("Fast Limiter")
        ? f.compRatio
        : Math.min(4, f.compRatio);
      n.comp.ratio.value = !compressorBypassed && f.compOn ? safeRatio : 1;
      n.comp.attack.value = f.compAttack;
      n.comp.release.value = f.compRelease;
      n.comp.knee.value = !compressorBypassed && f.compOn ? f.compKnee : 0;
      set(n.compMakeup.gain, dbToGain(compressorBypassed ? 0 : f.compMakeup));
      set(n.compDry.gain, !compressorBypassed && f.compOn ? 1 - f.compMix : 1);
      set(n.compWet.gain, !compressorBypassed && f.compOn ? f.compMix : 0);
      set(n.ampOut.gain, dbToGain(ampBypassed ? 0 : f.ampOutput));
      const ampOn = !ampBypassed && f.ampModel !== 0;
      set(n.cabHp.frequency, ampOn && f.cabOn ? 70 : 10);
      set(n.cabLp.frequency, ampOn && f.cabOn ? (f.ampModel === 4 ? 5200 : 6500) : 22000);
      set(n.ampLow.gain, ampOn ? f.ampBass : 0);
      set(n.ampMid.gain, ampOn ? f.ampMid : 0);
      set(n.ampHigh.gain, ampOn ? f.ampTreble : 0);
      // modulation
      n.lfo.frequency.value = f.modType === "flanger" ? f.modRate * 0.3 : f.modRate;
      const m = modulationBypassed ? "off" : f.modType,
        d = f.modDepth;
      n.lfo.type = f.modWaveform;
      set(n.chWet.gain, m === "chorus" || m === "flanger" ? f.modMix : 0);
      set(n.chDelay.delayTime, m === "flanger" ? 0.004 : 0.02);
      set(n.lfoCh.gain, m === "chorus" ? 0.005 * d : m === "flanger" ? 0.0035 * d : 0);
      set(n.chFb.gain, m === "flanger" ? f.modFeedback : m === "chorus" ? f.modFeedback * 0.5 : 0);
      set(n.chPan.pan, f.modPan);
      set(n.phPan.pan, f.modPan);
      set(n.modTone.frequency, f.modTone);
      set(n.phWet.gain, m === "phaser" ? f.modMix : 0);
      set(n.lfoPh.gain, m === "phaser" ? 700 * d : 0);
      set(n.dry.gain, m === "tremolo" || m === "off" ? 1 : 1 - f.modMix * 0.5);
      n.trem.gain.value = m === "tremolo" ? 1 - (d * f.modMix) / 2 : 1;
      set(n.lfoTr.gain, m === "tremolo" ? (d * f.modMix) / 2 : 0);
      // delay
      const dt = delayBypassed ? "off" : f.delayType,
        on = dt !== "off";
      set(n.dSend.gain, on ? f.delayMix : 0);
      set(n.dL.delayTime, f.delayTime);
      set(n.dR.delayTime, f.delayTime);
      set(n.dFilt.frequency, dt === "tape" ? Math.min(f.delayTone, 4500) : f.delayTone);
      set(n.dSelf.gain, on && dt !== "pingpong" ? f.delayFeedback : 0);
      set(n.dCross.gain, dt === "pingpong" ? 1 : 0);
      set(n.dBack.gain, dt === "pingpong" ? f.delayFeedback : 0);
      n.pL.pan.value = dt === "pingpong" ? -1 : 0;
      n.pR.pan.value = dt === "pingpong" ? 1 : 0;
      set(n.send.gain, reverbBypassed ? 0 : f.reverb);
      set(n.revPre.delayTime, f.reverbPreDelay);
      set(n.revTone.frequency, f.reverbTone);
      set(n.earlyDelay.delayTime, 0.004 + f.reverbSize * 0.06);
      set(n.earlyTone.frequency, f.reverbTone);
      set(n.earlySend.gain, reverbBypassed ? 0 : f.reverb * f.reverbSize * 0.15);
      n.output.disconnect();
      const outputBus = tr.busRole === "master" ? "master" : (tr.routing?.outputBus ?? "master");
      const outputTarget =
        tr.busRole === "master"
          ? this.master
          : outputBus === "master"
            ? ((masterBus && this.nodes.get(masterBus.id)?.input) ?? this.master)
            : this.nodes.get(outputBus)?.input;
      n.output.connect(outputTarget ?? this.master);
      const sends = Object.fromEntries(
        (tr.sendSlots ?? [])
          .filter((slot): slot is BusSendSlot => Boolean(slot))
          .map((slot) => [slot.targetId, slot.level]),
      );
      Object.assign(sends, tr.routing?.sends ?? {});
      for (const [targetId, routeGain] of n.routeGains) {
        if (!Object.hasOwn(sends, targetId)) {
          routeGain.disconnect();
          n.routeGains.delete(targetId);
        }
      }
      for (const [targetId, level] of Object.entries(sends)) {
        if (targetId === tr.id) continue;
        const target = this.nodes.get(targetId);
        if (!target) continue;
        const routeGain = n.routeGains.get(targetId) ?? this.ctx.createGain();
        if (!n.routeGains.has(targetId)) {
          n.routeGains.set(targetId, routeGain);
          routeGain.connect(target.input);
          n.output.connect(routeGain);
        }
        set(routeGain.gain, audible ? dbToGain(level) : 0);
      }
    }
  }

  private stopSources() {
    this.sources.forEach((s) => {
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    });
    this.sources.clear();
  }

  async play(tracks: TrackState[], from = this.offset) {
    const ctx = await this.init();
    if (ctx.state === "suspended") await ctx.resume();
    this.stopSources();
    const now = ctx.currentTime;
    for (const tr of tracks) {
      const n = this.nodes.get(tr.id);
      const rel = from - tr.start;
      if (!n || rel >= tr.buffer.duration) continue;
      const src = ctx.createBufferSource();
      src.buffer = tr.buffer;
      src.connect(n.input);
      if (rel >= 0) src.start(now, rel);
      else src.start(now - rel, 0);
      this.sources.set(tr.id, src);
    }
    this.startedAt = now - from;
    this.playing = true;
  }

  pause() {
    this.offset = this.time();
    this.stopSources();
    this.playing = false;
  }
  stop() {
    this.stopSources();
    this.offset = 0;
    this.playing = false;
  }
  time() {
    return this.playing && this.ctx ? this.ctx.currentTime - this.startedAt : this.offset;
  }
  seek(t: number, tracks: TrackState[]) {
    if (this.playing) void this.play(tracks, t);
    else this.offset = t;
  }

  private measure(a: AnalyserNode | undefined) {
    if (!a) return { rms: -90, peak: -90 };
    const b = this.buf.subarray(0, a.fftSize);
    a.getFloatTimeDomainData(b);
    let sum = 0,
      pk = 0;
    for (let i = 0; i < b.length; i++) {
      const v = b[i] ?? 0;
      sum += v * v;
      pk = Math.max(pk, Math.abs(v));
    }
    const rms = Math.sqrt(sum / b.length);
    return { rms: rms > 0 ? 20 * Math.log10(rms) : -90, peak: pk > 0 ? 20 * Math.log10(pk) : -90 };
  }
  level(id: string) {
    return this.measure(this.nodes.get(id)?.analyser);
  }
  riderGainDb(id: string) {
    return this.riderLevels.get(id) ?? 0;
  }
  pitchReadout(id: string) {
    return this.pitchReadouts.get(id) ?? null;
  }
  compressorReduction(id: string) {
    const reduction = this.nodes.get(id)?.comp.reduction ?? 0;
    return Number.isFinite(reduction) ? Math.max(0, -reduction) : 0;
  }
  readSpectrum(id: string, data: Float32Array<ArrayBuffer>) {
    const analyser = this.nodes.get(id)?.analyser;
    if (analyser) analyser.getFloatFrequencyData(data);
    else data.fill(Number.NEGATIVE_INFINITY);
  }
  dynamicEqReduction(id: string) {
    return this.dynamicEqReductions.get(id) ?? [];
  }
  masterLevel() {
    return this.measure(this.ctx ? this.masterAnalyser : undefined);
  }
}

export const engine = new Engine();

export function computePeaks(buffer: AudioBuffer, count = 600) {
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / count));
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    let m = 0;
    for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j++)
      m = Math.max(m, Math.abs(data[j] ?? 0));
    peaks.push(m);
  }
  return peaks;
}

export function sliceBuffer(ctx: BaseAudioContext, b: AudioBuffer, from: number, to: number) {
  const out = ctx.createBuffer(b.numberOfChannels, Math.max(1, to - from), b.sampleRate);
  for (let c = 0; c < b.numberOfChannels; c++)
    out.copyToChannel(b.getChannelData(c).subarray(from, to), c);
  return out;
}

export type BufferAnalysis = {
  peakDb: number;
  truePeakDb: number;
  rmsDb: number;
  crest: number;
  clips: number;
  dc: number;
  duration: number;
  sampleRate: number;
  channels: number;
};

const bufferAnalysisCache = new WeakMap<AudioBuffer, BufferAnalysis>();

export function analyzeBuffer(b: AudioBuffer): BufferAnalysis {
  const cached = bufferAnalysisCache.get(b);
  if (cached) return cached;
  let peak = 0,
    truePeak = 0,
    sum = 0,
    clips = 0,
    dc = 0,
    n = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = d[i] ?? 0,
        a = Math.abs(v);
      if (a > peak) peak = a;
      if (a > truePeak) truePeak = a;
      if (i > 0 && i < d.length - 1) {
        const previous = d[i - 1] ?? 0;
        const next = d[i + 1] ?? 0;
        for (const fraction of [0.25, 0.5, 0.75]) {
          const interpolated = previous + (next - previous) * fraction;
          truePeak = Math.max(truePeak, Math.abs(interpolated));
        }
      }
      if (a >= 0.999) clips++;
      sum += v * v;
      dc += v;
      n++;
    }
  }
  const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -90);
  const rms = Math.sqrt(sum / Math.max(1, n));
  const analysis = {
    peakDb: db(peak),
    truePeakDb: db(truePeak),
    rmsDb: db(rms),
    crest: db(peak) - db(rms),
    clips,
    dc: dc / Math.max(1, n),
    duration: b.duration,
    sampleRate: b.sampleRate,
    channels: b.numberOfChannels,
  };
  bufferAnalysisCache.set(b, analysis);
  return analysis;
}

export function formatTime(s: number) {
  const f = Math.floor((s % 1) * 30);
  const sec = Math.floor(s) % 60,
    min = Math.floor(s / 60) % 60,
    h = Math.floor(s / 3600);
  return [h, min, sec, f].map((n) => String(n).padStart(2, "0")).join(":");
}
