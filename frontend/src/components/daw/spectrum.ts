const DISPLAY_FLOOR_DB = -96;
const DISPLAY_CEILING_DB = -6;
const DB_SPAN = DISPLAY_CEILING_DB - DISPLAY_FLOOR_DB;

export function smoothedSpectrumLevel(
  spectrum: Float32Array,
  frequency: number,
  sampleRate: number,
  fftSize: number,
) {
  if (!spectrum.length || !Number.isFinite(frequency) || frequency <= 0) return 0;

  const nyquist = sampleRate / 2;
  const samples = 5;
  let totalDb = 0;
  for (let sample = 0; sample < samples; sample++) {
    const octaveOffset = (sample / (samples - 1) - 0.5) * 0.08;
    const sampleFrequency = Math.max(0, Math.min(nyquist, frequency * 2 ** octaveOffset));
    const bin = Math.min(spectrum.length - 1, (sampleFrequency * fftSize) / sampleRate);
    const lowerBin = Math.floor(bin);
    const upperBin = Math.min(spectrum.length - 1, lowerBin + 1);
    const fraction = bin - lowerBin;
    const lowerDb = Number.isFinite(spectrum[lowerBin]!) ? spectrum[lowerBin]! : DISPLAY_FLOOR_DB;
    const upperDb = Number.isFinite(spectrum[upperBin]!) ? spectrum[upperBin]! : DISPLAY_FLOOR_DB;
    totalDb += lowerDb + (upperDb - lowerDb) * fraction;
  }

  const averageDb = totalDb / samples;
  return Math.max(0, Math.min(1, (averageDb - DISPLAY_FLOOR_DB) / DB_SPAN));
}
