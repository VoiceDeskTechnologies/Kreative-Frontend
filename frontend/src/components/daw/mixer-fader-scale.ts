const MIN_DB = -60;
const MAX_DB = 6;

const SCALE = [
  [-60, 0],
  [-30, 0.28],
  [-18, 0.47],
  [-12, 0.61],
  [-6, 0.76],
  [0, 0.88],
  [6, 1],
] as const;

export function dbToFaderPosition(db: number): number {
  const value = Math.max(MIN_DB, Math.min(MAX_DB, db));
  for (let index = 1; index < SCALE.length; index++) {
    const lower = SCALE[index - 1]!;
    const upper = SCALE[index]!;
    if (value <= upper[0]) {
      const t = (value - lower[0]) / (upper[0] - lower[0]);
      return lower[1] + t * (upper[1] - lower[1]);
    }
  }
  return 1;
}

export function faderPositionToDb(position: number): number {
  const value = Math.max(0, Math.min(1, position));
  for (let index = 1; index < SCALE.length; index++) {
    const lower = SCALE[index - 1]!;
    const upper = SCALE[index]!;
    if (value <= upper[1]) {
      const t = (value - lower[1]) / (upper[1] - lower[1]);
      return lower[0] + t * (upper[0] - lower[0]);
    }
  }
  return MAX_DB;
}
