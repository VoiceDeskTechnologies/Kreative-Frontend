import { describe, expect, it } from "vitest";
import { WORKLET_CODE } from "./worklet";

function createProcessor() {
  const messages: unknown[] = [];
  class WorkletStub {
    port = { postMessage: (message: unknown) => messages.push(message) };
  }
  let processorClass: new () => {
    process: (
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>,
    ) => boolean;
  };
  const registerProcessor = (_name: string, processor: typeof processorClass) => {
    processorClass = processor;
  };
  const defineProcessor = new Function(
    "AudioWorkletProcessor",
    "registerProcessor",
    "sampleRate",
    WORKLET_CODE,
  ) as (base: typeof WorkletStub, register: typeof registerProcessor, rate: number) => void;
  defineProcessor(WorkletStub, registerProcessor, 48000);
  return { processor: new processorClass!(), messages };
}

function parameters(smoothenOn: number) {
  const values: Record<string, number> = {
    dynMode: 0,
    dynThresh: -40,
    satMode: 0,
    drive: 0,
    dynAttack: 0.01,
    dynRelease: 0.12,
    dynRange: -60,
    dynHysteresis: 4,
    satMix: 1,
    satBias: 0,
    satOutput: 0,
    smoothenOn,
    smoothenTarget: -14,
    smoothenRange: 12,
    smoothenFloor: -54,
    smoothenSpeed: 0.05,
    smoothenMix: 1,
    pitchOn: 0,
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
    ampModel: 0,
    ampDrive: 0.35,
    ampBias: 0,
    ampSag: 0.25,
    ampPresence: 0.45,
    width: 1,
    phase: 0,
    imagerBalance: 0,
    imagerRotation: 0,
    imagerMono: 0,
  };
  for (let index = 0; index < 8; index++) {
    Object.assign(values, {
      [`eqDyn${index}Enabled`]: 0,
      [`eqDyn${index}Frequency`]: 1000,
      [`eqDyn${index}Gain`]: 0,
      [`eqDyn${index}Q`]: 1,
      [`eqDyn${index}Threshold`]: -24,
      [`eqDyn${index}Range`]: 6,
      [`eqDyn${index}Attack`]: 0.01,
      [`eqDyn${index}Release`]: 0.16,
    });
  }
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, Float32Array.of(value)]),
  );
}

describe("Smoothen AudioWorklet", () => {
  it("rides a steady vocal signal toward its target within the configured gain range", () => {
    const { processor } = createProcessor();
    const input = [new Float32Array(48000).fill(0.4), new Float32Array(48000).fill(0.4)];
    const output = [new Float32Array(48000), new Float32Array(48000)];

    processor.process([input], [output], parameters(1));

    expect(output[0]![47999]).toBeCloseTo(0.2, 1);
    expect(output[1]![47999]).toBeCloseTo(0.2, 1);
  });

  it("leaves the signal unchanged when bypassed", () => {
    const { processor } = createProcessor();
    const input = [new Float32Array(48000).fill(0.4), new Float32Array(48000).fill(0.4)];
    const output = [new Float32Array(48000), new Float32Array(48000)];

    processor.process([input], [output], parameters(0));

    expect(output[0]![47999]).toBeCloseTo(0.4, 5);
    expect(output[1]![47999]).toBeCloseTo(0.4, 5);
  });

  it("detects and corrects a note toward the selected scale", () => {
    const { processor, messages } = createProcessor();
    const length = 48000;
    const frequency = 261.63 * Math.pow(2, 0.3 / 12);
    const samples = new Float32Array(length);
    for (let index = 0; index < length; index++) {
      samples[index] = 0.35 * Math.sin((2 * Math.PI * frequency * index) / 48000);
    }
    const output = [new Float32Array(length), new Float32Array(length)];
    const params = parameters(0);
    Object.assign(params, {
      pitchOn: Float32Array.of(1),
      pitchScale: Float32Array.of(1),
      pitchHumanize: Float32Array.of(0),
      pitchMix: Float32Array.of(1),
    });

    processor.process([[samples, samples]], [output], params);

    const meter = messages
      .filter((message) => {
        return (
          typeof message === "object" &&
          message !== null &&
          "type" in message &&
          message.type === "pitch-meter"
        );
      })
      .at(-1) as { detectedMidi: number; targetMidi: number } | undefined;
    expect(meter?.detectedMidi).toBeCloseTo(60.3, 0);
    expect(meter?.targetMidi).toBe(60);
    expect(output[0]![length - 1]).not.toBeCloseTo(samples[length - 1]!, 4);
    const windowStart = length - 12000;
    let positiveCrossings = 0;
    for (let index = windowStart + 1; index < length; index++) {
      if ((output[0]![index - 1] ?? 0) <= 0 && (output[0]![index] ?? 0) > 0) {
        positiveCrossings += 1;
      }
    }
    const correctedFrequency = (positiveCrossings * 48000) / (length - windowStart);
    expect(Math.abs(correctedFrequency - 261.63)).toBeLessThan(10);
  });

  it("attenuates a loud frequency-selective band only when dynamic mode is enabled", () => {
    const run = (dynamic: boolean) => {
      const { processor } = createProcessor();
      const params = parameters(0);
      Object.assign(params, {
        eqDyn0Enabled: Float32Array.of(dynamic ? 1 : 0),
        eqDyn0Frequency: Float32Array.of(440),
        eqDyn0Threshold: Float32Array.of(-24),
        eqDyn0Range: Float32Array.of(12),
        eqDyn0Attack: Float32Array.of(0.005),
        eqDyn0Release: Float32Array.of(0.1),
      });
      let energy = 0;
      let count = 0;
      for (let block = 0; block < 160; block++) {
        const input = new Float32Array(128);
        const output = [new Float32Array(128), new Float32Array(128)];
        for (let index = 0; index < input.length; index++) {
          const sampleIndex = block * 128 + index;
          input[index] = 0.5 * Math.sin((2 * Math.PI * 440 * sampleIndex) / 48000);
        }
        processor.process([[input, input]], [output], params);
        if (block > 120) {
          for (const sample of output[0]!) {
            energy += sample * sample;
            count++;
          }
        }
      }
      return Math.sqrt(energy / count);
    };

    expect(run(true)).toBeLessThan(run(false) * 0.6);
  });

  it("reports changing dynamic EQ reduction for the live response display", () => {
    const { processor, messages } = createProcessor();
    const params = parameters(0);
    Object.assign(params, {
      eqDyn0Enabled: Float32Array.of(1),
      eqDyn0Frequency: Float32Array.of(440),
      eqDyn0Threshold: Float32Array.of(-24),
      eqDyn0Range: Float32Array.of(12),
      eqDyn0Attack: Float32Array.of(0.005),
      eqDyn0Release: Float32Array.of(0.1),
    });
    const input = new Float32Array(48000);
    for (let index = 0; index < input.length; index++) {
      input[index] = 0.5 * Math.sin((2 * Math.PI * 440 * index) / 48000);
    }
    processor.process(
      [[input, input]],
      [[new Float32Array(input.length), new Float32Array(input.length)]],
      params,
    );

    const meter = messages.find(
      (message): message is { type: string; reductionsDb: number[] } =>
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "eq-dynamic-meter" &&
        "reductionsDb" in message &&
        Array.isArray(message.reductionsDb),
    );
    expect(meter?.reductionsDb[0]).toBeGreaterThan(0);
  });
});
