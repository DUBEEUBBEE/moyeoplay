import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeededRandom, randomInt, secureRandomIndex, shuffle } from './seeded-random';

afterEach(() => vi.unstubAllGlobals());

describe('seeded random', () => {
  it('reproduces the same stream for the same seed', () => {
    const first = createSeededRandom('party');
    const second = createSeededRandom('party');
    expect(Array.from({ length: 20 }, first)).toEqual(Array.from({ length: 20 }, second));
  });

  it('creates bounded integers and reproducible shuffles', () => {
    const random = createSeededRandom(7);
    expect(
      Array.from({ length: 100 }, () => randomInt(random, 4)).every(
        (value) => value >= 0 && value < 4,
      ),
    ).toBe(true);
    expect(shuffle([1, 2, 3, 4], createSeededRandom(10))).toEqual(
      shuffle([1, 2, 3, 4], createSeededRandom(10)),
    );
  });

  it('uses rejection sampling for secure indices and never falls back to Math.random', () => {
    const samples = [0xffff_ffff, 5];
    vi.stubGlobal('crypto', {
      getRandomValues(values: Uint32Array) {
        values[0] = samples.shift() ?? 0;
        return values;
      },
    });
    expect(secureRandomIndex(3)).toBe(2);

    vi.stubGlobal('crypto', undefined);
    expect(() => secureRandomIndex(3)).toThrow('Secure random values are unavailable');
  });

  it('rejects lengths that cannot be represented by a 32-bit sample', () => {
    expect(() => secureRandomIndex(0x1_0000_0001)).toThrow(RangeError);
  });
});
