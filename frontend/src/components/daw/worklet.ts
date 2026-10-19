// AudioWorklet processor: dynamics, saturation, circuit-inspired amp voicings and stereo utility.
export const WORKLET_CODE = `
function sat(x, m) {
  if (m === 1) return Math.tanh(x);
  if (m === 2) return x / (1 + Math.abs(x));
  if (m === 3) return Math.tanh(x + 0.25) - Math.tanh(0.25);
  if (m === 4) return 0.7 * Math.tanh(x) + 0.3 * Math.max(-1, Math.min(1, x));
  return x;
}
function cleanSat(x, m) {
  // Average two nearby nonlinear evaluations to reduce staircase aliasing on bright material.
  return 0.5 * (sat(x * 0.82, m) + sat(x * 1.18, m));
}
function ampCurve(x, model) {
  if (model === 1) return Math.tanh(x * 1.15);
  if (model === 2) {
    return Math.tanh(x * (x >= 0 ? 1.35 : 0.82));
  }
  if (model === 3) {
    return 0.76 * Math.tanh(x * 1.7) + 0.16 * Math.tanh(x * 4.2);
  }
  return Math.tanh(x * 2.4);
}
function amp(x, model, drive, bias) {
  const offset = bias * drive;
  const input = x * (1 + drive * 17) + offset;
  return ampCurve(input, model) - ampCurve(offset, model);
}
function cleanAmp(x, model, drive, bias) {
  return 0.5 * (amp(x * 0.82, model, drive, bias) + amp(x * 1.18, model, drive, bias));
}
const PITCH_SCALES = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  [0, 2, 4, 5, 7, 9, 11],
  [0, 2, 3, 5, 7, 8, 10],
  [0, 2, 4, 7, 9],
  [0, 3, 5, 7, 10],
];
function quantizeMidi(midi, key, scale, low, high) {
  const notes = PITCH_SCALES[Math.max(0, Math.min(4, scale))];
  let best = Math.max(low, Math.min(high, Math.round(midi)));
  let distance = Infinity;
  for (let note = Math.floor(midi) - 12; note <= Math.ceil(midi) + 12; note++) {
    if (note < low || note > high) continue;
    const pitchClass = ((note - key) % 12 + 12) % 12;
    if (!notes.includes(pitchClass)) continue;
    const error = Math.abs(note - midi);
    if (error < distance) { best = note; distance = error; }
  }
  return best;
}
function detectPitch(ring, writeIndex, rate, floor) {
  const ringSize = ring.length, halfWindow = 512, maxLag = Math.min(400, Math.floor(rate / 130));
  const minLag = Math.max(12, Math.floor(rate / 2400));
  const comparisonLength = halfWindow - maxLag;
  const start = (writeIndex - 1024 + ringSize) % ringSize;
  let energy = 0;
  for (let index = 0; index < halfWindow; index += 4) {
    const value = ring[(start + index * 2) % ringSize];
    energy += value * value;
  }
  if (Math.sqrt(energy / (halfWindow / 4)) < floor) return 0;
  let bestLag = 0, bestScore = 0;
  const scoreAt = (lag) => {
    let correlation = 0, energyA = 0, energyB = 0;
    for (let index = 0; index < comparisonLength; index += 2) {
      const a = ring[(start + index * 2) % ringSize];
      const b = ring[(start + (index + lag) * 2) % ringSize];
      correlation += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    const divisor = Math.sqrt(energyA * energyB);
    return divisor > 0 ? correlation / divisor : 0;
  };
  let previousScore = scoreAt(minLag);
  let score = scoreAt(minLag + 1);
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    const nextScore = scoreAt(lag + 1);
    if (score > bestScore) { bestScore = score; bestLag = lag; }
    if (score >= 0.55 && score >= previousScore && score >= nextScore) {
      bestLag = lag;
      bestScore = score;
      break;
    }
    previousScore = score;
    score = nextScore;
  }
  if (bestScore < 0.5 || !bestLag) return 0;
  const before = scoreAt(bestLag - 1), after = scoreAt(bestLag + 1);
  const curvature = before - 2 * bestScore + after;
  const offset = curvature ? Math.max(-0.5, Math.min(0.5, 0.5 * (before - after) / curvature)) : 0;
  return rate / (2 * (bestLag + offset));
}
function readPitchSample(ring, writeIndex, delay) {
  const position = (writeIndex - delay + ring.length) % ring.length;
  const first = Math.floor(position), fraction = position - first;
  const at = (offset) => ring[(first + offset + ring.length) % ring.length];
  const y0 = at(-1), y1 = at(0), y2 = at(1), y3 = at(2);
  const a = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
  const b = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const c = -0.5 * y0 + 0.5 * y2;
  return ((a * fraction + b) * fraction + c) * fraction + y1;
}
class KreativeFx extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const standard = [
      { name: 'dynMode', defaultValue: 0 }, { name: 'dynThresh', defaultValue: -40 },
      { name: 'satMode', defaultValue: 0 }, { name: 'drive', defaultValue: 0 },
      { name: 'dynAttack', defaultValue: 0.01 }, { name: 'dynRelease', defaultValue: 0.12 },
      { name: 'dynRange', defaultValue: -60 }, { name: 'dynHysteresis', defaultValue: 4 },
      { name: 'satMix', defaultValue: 1 }, { name: 'satBias', defaultValue: 0 },
      { name: 'satOutput', defaultValue: 0 },
      { name: 'smoothenOn', defaultValue: 0 }, { name: 'smoothenTarget', defaultValue: -18 },
      { name: 'smoothenRange', defaultValue: 9 }, { name: 'smoothenFloor', defaultValue: -54 },
      { name: 'smoothenSpeed', defaultValue: 0.25 }, { name: 'smoothenMix', defaultValue: 1 },
      { name: 'pitchOn', defaultValue: 0 }, { name: 'pitchKey', defaultValue: 0 },
      { name: 'pitchScale', defaultValue: 1 }, { name: 'pitchSpeed', defaultValue: 0.08 },
      { name: 'pitchHumanize', defaultValue: 0.25 }, { name: 'pitchFloor', defaultValue: -54 },
      { name: 'pitchMix', defaultValue: 1 }, { name: 'pitchReference', defaultValue: 440 },
      { name: 'pitchTranspose', defaultValue: 0 }, { name: 'pitchRangeLow', defaultValue: 40 },
      { name: 'pitchRangeHigh', defaultValue: 88 },
      { name: 'deEssOn', defaultValue: 0 }, { name: 'deEssFrequency', defaultValue: 6500 },
      { name: 'deEssThreshold', defaultValue: -28 }, { name: 'deEssRange', defaultValue: 6 },
      { name: 'deEssAttack', defaultValue: 0.002 }, { name: 'deEssRelease', defaultValue: 0.08 },
      { name: 'deEssMix', defaultValue: 1 },
      { name: 'ampModel', defaultValue: 0 }, { name: 'ampDrive', defaultValue: 0.35 },
      { name: 'ampBias', defaultValue: 0 }, { name: 'ampSag', defaultValue: 0.25 },
      { name: 'ampPresence', defaultValue: 0.45 },
      { name: 'width', defaultValue: 1 }, { name: 'phase', defaultValue: 0 },
      { name: 'imagerBalance', defaultValue: 0 }, { name: 'imagerRotation', defaultValue: 0 },
      { name: 'imagerMono', defaultValue: 0 },
    ];
    const dynamicEq = Array.from({ length: 8 }, (_, index) => {
      const prefix = 'eqDyn' + index;
      return [
        { name: prefix + 'Enabled', defaultValue: 0 },
        { name: prefix + 'Frequency', defaultValue: 1000 },
        { name: prefix + 'Gain', defaultValue: 0 },
        { name: prefix + 'Q', defaultValue: 1 },
        { name: prefix + 'Threshold', defaultValue: -24 },
        { name: prefix + 'Range', defaultValue: 6 },
        { name: prefix + 'Attack', defaultValue: 0.01 },
        { name: prefix + 'Release', defaultValue: 0.16 },
      ];
    }).flat();
    return [...standard, ...dynamicEq];
  }
  constructor() {
    super();
    this.env = 0; this.g = 1; this.presL = 0; this.presR = 0;
    this.riderEnv = 0; this.riderGain = 1; this.reportFrames = 0;
    this.eqReportFrames = 0;
    this.pitchLeft = new Float32Array(4096); this.pitchRight = new Float32Array(4096);
    this.pitchWrite = 0; this.pitchSamples = 0; this.pitchHop = 0;
    this.pitchMidi = 0; this.pitchTargetMidi = 0; this.pitchRatio = 1;
    this.pitchTargetRatio = 1; this.pitchPhase = 0; this.pitchReportFrames = 0;
    this.deEssEnv = 0; this.deEssLowL = 0; this.deEssLowR = 0;
    this.deEssHighL = 0; this.deEssHighR = 0;
    this.eqDynamic = Array.from({ length: 8 }, () => ({
      detectorEnv: 0, reductionDb: 0,
      detectorL: { x1: 0, x2: 0, y1: 0, y2: 0 },
      detectorR: { x1: 0, x2: 0, y1: 0, y2: 0 },
      filterL: { z1: 0, z2: 0 },
      filterR: { z1: 0, z2: 0 },
    }));
  }
  process(inputs, outputs, p) {
    const i = inputs[0], o = outputs[0];
    if (!i || !i.length) return true;
    const L = i[0], R = i[1] || i[0], oL = o[0], oR = o[1];
    const dm = Math.round(p.dynMode[0]), th = Math.pow(10, p.dynThresh[0] / 20);
    const sm = Math.round(p.satMode[0]), dr = 1 + p.drive[0] * 9, comp = 1 / Math.sqrt(dr);
    const atk = 1 - Math.exp(-1 / (Math.max(0.001, p.dynAttack[0]) * sampleRate));
    const rel = 1 - Math.exp(-1 / (Math.max(0.005, p.dynRelease[0]) * sampleRate));
    const minGain = Math.pow(10, p.dynRange[0] / 20);
    const closeTh = th * Math.pow(10, -p.dynHysteresis[0] / 20);
    const satOffset = p.satBias[0] * p.drive[0];
    const satOutput = Math.pow(10, p.satOutput[0] / 20);
    const smoothOn = p.smoothenOn[0] > 0.5;
    const smoothTarget = Math.pow(10, p.smoothenTarget[0] / 20);
    const smoothFloor = Math.pow(10, p.smoothenFloor[0] / 20);
    const smoothRange = Math.min(6, Math.max(0, p.smoothenRange[0]));
    const smoothMin = Math.pow(10, -smoothRange / 20);
    const smoothMax = Math.pow(10, smoothRange / 20);
    const smoothAlpha = 1 - Math.exp(-1 / (Math.max(0.02, p.smoothenSpeed[0]) * sampleRate));
    const riderAtk = 1 - Math.exp(-1 / (0.045 * sampleRate));
    const riderRel = 1 - Math.exp(-1 / (0.28 * sampleRate));
    const pitchOn = p.pitchOn[0] > 0.5;
    const deEssOn = (p.deEssOn?.[0] ?? 0) > 0.5;
    const deEssThreshold = Math.pow(10, (p.deEssThreshold?.[0] ?? -28) / 20);
    const deEssRange = Math.max(0, Math.min(18, p.deEssRange?.[0] ?? 6));
    const deEssAttack = 1 - Math.exp(-1 / (Math.max(0.001, p.deEssAttack?.[0] ?? 0.002) * sampleRate));
    const deEssRelease = 1 - Math.exp(-1 / (Math.max(0.01, p.deEssRelease?.[0] ?? 0.08) * sampleRate));
    const deEssFrequency = p.deEssFrequency?.[0] ?? 6500;
    const deEssLowCut = Math.max(800, deEssFrequency * 0.55);
    const deEssHighCut = Math.min(sampleRate * 0.45, deEssFrequency * 1.8);
    const deEssLowAlpha = 1 - Math.exp(-2 * Math.PI * deEssLowCut / sampleRate);
    const deEssHighAlpha = 1 - Math.exp(-2 * Math.PI * deEssHighCut / sampleRate);
    const pitchFloor = Math.pow(10, p.pitchFloor[0] / 20);
    const pitchResponse = Math.max(0.005, p.pitchSpeed[0] + p.pitchHumanize[0] * 0.25);
    const pitchAlpha = 1 - Math.exp(-1 / (pitchResponse * sampleRate));
    const dynamicBands = this.eqDynamic.map((state, index) => {
      const prefix = 'eqDyn' + index;
      const enabled = p[prefix + 'Enabled'][0] > 0.5;
      if (!enabled) {
        state.reductionDb += (0 - state.reductionDb) * (1 - Math.exp(-L.length / (0.18 * sampleRate)));
        return null;
      }
      const frequency = Math.max(20, Math.min(sampleRate * 0.45, p[prefix + 'Frequency'][0]));
      const q = Math.max(0.1, p[prefix + 'Q'][0]);
      const omega = 2 * Math.PI * frequency / sampleRate;
      const cosine = Math.cos(omega);
      const alpha = Math.sin(omega) / (2 * q);
      const detectorA0 = 1 + alpha;
      const threshold = p[prefix + 'Threshold'][0];
      const thresholdLevel = Math.pow(10, threshold / 20);
      const range = Math.max(0, p[prefix + 'Range'][0]);
      const attack = Math.max(0.001, p[prefix + 'Attack'][0]);
      const release = Math.max(0.005, p[prefix + 'Release'][0]);
      const b0 = alpha / detectorA0, b1 = 0, b2 = -alpha / detectorA0;
      const a1 = -2 * cosine / detectorA0, a2 = (1 - alpha) / detectorA0;
      const detector = (input, memory) => {
        const output = b0 * input + b1 * memory.x1 + b2 * memory.x2 - a1 * memory.y1 - a2 * memory.y2;
        memory.x2 = memory.x1; memory.x1 = input; memory.y2 = memory.y1; memory.y1 = output;
        return output;
      };
      const envelopeAttack = 1 - Math.exp(-1 / (attack * sampleRate));
      const envelopeRelease = 1 - Math.exp(-1 / (release * sampleRate));
      const filterA = Math.pow(10, -state.reductionDb / 40);
      const filterA0 = 1 + alpha / filterA;
      return {
        state, thresholdLevel, range, detector, envelopeAttack, envelopeRelease,
        filter: {
          b0: (1 + alpha * filterA) / filterA0,
          b1: (-2 * cosine) / filterA0,
          b2: (1 - alpha * filterA) / filterA0,
          a1: (-2 * cosine) / filterA0,
          a2: (1 - alpha / filterA) / filterA0,
        },
      };
    });
    const runFilter = (input, memory, coefficients) => {
      const output = coefficients.b0 * input + memory.z1;
      memory.z1 = coefficients.b1 * input - coefficients.a1 * output + memory.z2;
      memory.z2 = coefficients.b2 * input - coefficients.a2 * output;
      return output;
    };
    const w = p.width[0], ph = p.phase[0] > 0.5 ? -1 : 1;
    for (let n = 0; n < L.length; n++) {
      let l = L[n], r = R[n];
      for (let bandIndex = 0; bandIndex < dynamicBands.length; bandIndex++) {
        const band = dynamicBands[bandIndex];
        if (!band) continue;
        const state = band.state;
        const detectorLevel = Math.max(
          Math.abs(band.detector(l, state.detectorL)),
          Math.abs(band.detector(r, state.detectorR)),
        );
        const coefficient = detectorLevel > state.detectorEnv
          ? band.envelopeAttack : band.envelopeRelease;
        state.detectorEnv += coefficient * (detectorLevel - state.detectorEnv);
        const over = Math.max(
          0,
          Math.min(1, (state.detectorEnv - band.thresholdLevel) / (band.thresholdLevel * 2.98)),
        );
        const targetReduction = band.range * over;
        const reductionCoefficient = targetReduction > state.reductionDb
          ? band.envelopeAttack : band.envelopeRelease;
        state.reductionDb += reductionCoefficient * (targetReduction - state.reductionDb);
        l = runFilter(l, state.filterL, band.filter);
        r = runFilter(r, state.filterR, band.filter);
      }
      const balance = Math.max(-1, Math.min(1, p.imagerBalance[0]));
      if (balance < 0) r *= 1 + balance;
      else l *= 1 - balance;
      const rotation = p.imagerRotation[0] * Math.PI / 180;
      if (Math.abs(rotation) > 0.0001) {
        const rotatedL = l * Math.cos(rotation) - r * Math.sin(rotation);
        const rotatedR = l * Math.sin(rotation) + r * Math.cos(rotation);
        l = rotatedL;
        r = rotatedR;
      }
      const mono = Math.max(0, Math.min(1, p.imagerMono[0]));
      if (mono > 0) {
        const center = (l + r) * 0.5;
        l += (center - l) * mono;
        r += (center - r) * mono;
      }
      const a = Math.max(Math.abs(l), Math.abs(r));
      this.env += (a > this.env ? atk : rel) * (a - this.env);
      let tg = 1;
      if (dm === 1) {
        const gateOpen = this.g > minGain + 0.01 ? this.env >= closeTh : this.env >= th;
        tg = gateOpen ? 1 : minGain;
      } else if (dm === 2 && this.env < th) tg = Math.max(minGain, this.env / th);
      this.g += (tg > this.g ? atk : rel) * (tg - this.g);
      l *= this.g; r *= this.g;
      const riderInput = (Math.abs(l) + Math.abs(r)) * 0.5;
      this.riderEnv += (riderInput > this.riderEnv ? riderAtk : riderRel) * (riderInput - this.riderEnv);
      let riderTarget = 1;
      if (smoothOn && this.riderEnv >= smoothFloor) {
        riderTarget = Math.max(smoothMin, Math.min(smoothMax, smoothTarget / Math.max(this.riderEnv, 0.00001)));
      }
      this.riderGain += (riderTarget - this.riderGain) * smoothAlpha;
      const riderMix = 1 + (this.riderGain - 1) * p.smoothenMix[0];
      l *= riderMix; r *= riderMix;
      if (deEssOn) {
        this.deEssLowL += (l - this.deEssLowL) * deEssLowAlpha;
        this.deEssLowR += (r - this.deEssLowR) * deEssLowAlpha;
        this.deEssHighL += (l - this.deEssHighL) * deEssHighAlpha;
        this.deEssHighR += (r - this.deEssHighR) * deEssHighAlpha;
        const bandL = this.deEssHighL - this.deEssLowL;
        const bandR = this.deEssHighR - this.deEssLowR;
        const detector = Math.max(Math.abs(bandL), Math.abs(bandR));
        const detectorCoefficient = detector > this.deEssEnv ? deEssAttack : deEssRelease;
        this.deEssEnv += (detector - this.deEssEnv) * detectorCoefficient;
        const over = Math.max(0, Math.min(1, (this.deEssEnv - deEssThreshold) / Math.max(deEssThreshold, 0.00001)));
        const reduction = Math.pow(10, -(deEssRange * over) / 20);
        const mix = Math.max(0, Math.min(1, p.deEssMix?.[0] ?? 1));
        l -= bandL * (1 - reduction) * mix;
        r -= bandR * (1 - reduction) * mix;
      } else {
        this.deEssEnv *= 0.995;
      }
      if (pitchOn) {
        this.pitchLeft[this.pitchWrite] = l;
        this.pitchRight[this.pitchWrite] = r;
        this.pitchWrite = (this.pitchWrite + 1) & 4095;
        this.pitchSamples = Math.min(4096, this.pitchSamples + 1);
        this.pitchHop++;
        if (this.pitchHop >= 256 && this.pitchSamples >= 1200) {
          this.pitchHop = 0;
          const frequency = detectPitch(this.pitchLeft, this.pitchWrite, sampleRate, pitchFloor);
          if (frequency > 0) {
            const midi = 69 + 12 * Math.log2(frequency / Math.max(400, p.pitchReference[0]));
            const low = Math.round(p.pitchRangeLow[0]);
            const high = Math.max(low + 1, Math.round(p.pitchRangeHigh[0]));
            const target = quantizeMidi(midi, Math.round(p.pitchKey[0]), Math.round(p.pitchScale[0]), low, high);
            this.pitchMidi = midi;
            this.pitchTargetMidi = target + p.pitchTranspose[0];
            const correction = this.pitchTargetMidi - midi;
            const preserved = Math.sign(correction) * Math.max(0, Math.abs(correction) - p.pitchHumanize[0] * 0.45);
            this.pitchTargetRatio = Math.pow(2, preserved / 12);
          } else {
            this.pitchMidi = 0;
            this.pitchTargetMidi = 0;
            this.pitchTargetRatio = 1;
          }
        }
        this.pitchRatio += (this.pitchTargetRatio - this.pitchRatio) * pitchAlpha;
        if (this.pitchSamples >= 1600) {
          const depth = 512, baseDelay = 1024;
          const ratioOffset = this.pitchRatio - 1;
          if (Math.abs(ratioOffset) > 0.001) {
            const step = Math.min(0.02, Math.abs(ratioOffset) / depth);
            this.pitchPhase = (this.pitchPhase + (ratioOffset > 0 ? -step : step) + 1) % 1;
          }
          const phaseA = this.pitchPhase, phaseB = (phaseA + 0.5) % 1;
          const delayA = baseDelay + phaseA * depth, delayB = baseDelay + phaseB * depth;
          const blendA = 0.5 - 0.5 * Math.cos(phaseA * Math.PI * 2);
          const pitchL = readPitchSample(this.pitchLeft, this.pitchWrite, delayA) * blendA +
            readPitchSample(this.pitchLeft, this.pitchWrite, delayB) * (1 - blendA);
          const pitchR = readPitchSample(this.pitchRight, this.pitchWrite, delayA) * blendA +
            readPitchSample(this.pitchRight, this.pitchWrite, delayB) * (1 - blendA);
          l += (pitchL - l) * p.pitchMix[0];
          r += (pitchR - r) * p.pitchMix[0];
        }
      } else {
        this.pitchTargetRatio = 1;
        this.pitchRatio += (1 - this.pitchRatio) * pitchAlpha;
      }
        const model = Math.round(p.ampModel[0]);
        if (model > 0) {
          const sag = 1 - p.ampSag[0] * Math.min(0.28, this.env * 0.9);
          l = cleanAmp(l * sag, model, p.ampDrive[0], p.ampBias[0]);
          r = cleanAmp(r * sag, model, p.ampDrive[0], p.ampBias[0]);
          this.presL += 0.12 * (l - this.presL);
          this.presR += 0.12 * (r - this.presR);
          l += (l - this.presL) * p.ampPresence[0] * 0.8;
          r += (r - this.presR) * p.ampPresence[0] * 0.8;
        }
      if (sm > 0) {
        const dryL = l, dryR = r;
        const wetL = cleanSat(l * dr + satOffset, sm) - cleanSat(satOffset, sm);
        const wetR = cleanSat(r * dr + satOffset, sm) - cleanSat(satOffset, sm);
        l = (dryL + (wetL * comp - dryL) * p.satMix[0]) * satOutput;
        r = (dryR + (wetR * comp - dryR) * p.satMix[0]) * satOutput;
      }
      const m = (l + r) * 0.5, s = (l - r) * 0.5 * w;
      const outL = (m + s) * ph;
      const outR = (m - s) * ph;
      oL[n] = outL / (1 + Math.max(0, Math.abs(outL) - 0.98) * 3);
      if (oR) oR[n] = outR / (1 + Math.max(0, Math.abs(outR) - 0.98) * 3);
    }
    if (smoothOn) {
      this.reportFrames += L.length;
      if (this.reportFrames >= 2048) {
        this.reportFrames = 0;
        this.port.postMessage({ type: 'smoothen-meter', gainDb: 20 * Math.log10(Math.max(0.001, this.riderGain)) });
      }
    }
    if (pitchOn) {
      this.pitchReportFrames += L.length;
      if (this.pitchReportFrames >= 2048) {
        this.pitchReportFrames = 0;
        this.port.postMessage({
          type: 'pitch-meter',
          detectedMidi: this.pitchMidi,
          targetMidi: this.pitchTargetMidi,
          cents: this.pitchMidi > 0 ? (this.pitchTargetMidi - this.pitchMidi) * 100 : 0,
        });
      }
    }
    this.eqReportFrames += L.length;
    if (this.eqReportFrames >= sampleRate / 30) {
      this.eqReportFrames = 0;
      if (dynamicBands.some(Boolean)) {
        this.port.postMessage({
          type: 'eq-dynamic-meter',
          reductionsDb: this.eqDynamic.map((state) => state.reductionDb),
        });
      }
    }
    return true;
  }
}
registerProcessor('kreative-fx', KreativeFx);
`;
