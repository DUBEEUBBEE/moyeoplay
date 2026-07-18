import { describe, expect, it } from 'vitest';
import { createSeededRandom, randomInt, shuffle } from './seeded-random';

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
});
