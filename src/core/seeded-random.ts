export type RandomSource = () => number;

export function hashSeed(value: string | number): number {
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed: string | number): RandomSource {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function randomInt(random: RandomSource, maxExclusive: number): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError('maxExclusive must be a positive safe integer');
  }
  return Math.min(Math.floor(random() * maxExclusive), maxExclusive - 1);
}

export function shuffle<T>(values: readonly T[], random: RandomSource): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = randomInt(random, index + 1);
    [copy[index], copy[target]] = [copy[target] as T, copy[index] as T];
  }
  return copy;
}

export function secureRandomIndex(length: number): number {
  if (!Number.isSafeInteger(length) || length <= 0) throw new RangeError('length must be positive');
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    return randomInt(Math.random, length);
  }
  const range = 0x1_0000_0000;
  const ceiling = range - (range % length);
  const sample = new Uint32Array(1);
  do crypto.getRandomValues(sample);
  while ((sample[0] ?? range) >= ceiling);
  return (sample[0] ?? 0) % length;
}
