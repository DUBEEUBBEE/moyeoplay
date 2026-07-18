import { describe, expect, it } from 'vitest';

import {
  countTap,
  playerForTapKey,
  registerPointerDown,
  releasePointer,
  remainingMilliseconds,
  resolveTapBattle,
  tapGaugePercent,
  tapsPerSecond,
} from './logic';

describe('tap battle scoring', () => {
  it('counts each player independently and resolves the exact score', () => {
    let counts = countTap([0, 0], 1);
    counts = countTap(counts, 2);
    counts = countTap(counts, 1);

    expect(counts).toEqual([2, 1]);
    expect(resolveTapBattle(counts, 10)).toEqual({
      winner: 1,
      counts: [2, 1],
      total: 3,
      margin: 1,
      durationSeconds: 10,
      tapsPerSecond: [0.2, 0.1],
    });
  });

  it('reports an exact draw without inventing a winner', () => {
    const outcome = resolveTapBattle([37, 37], 5);
    expect(outcome.winner).toBe(0);
    expect(outcome.margin).toBe(0);
    expect(outcome.tapsPerSecond).toEqual([7.4, 7.4]);
  });

  it('calculates live time, rates, and gauge boundaries', () => {
    expect(remainingMilliseconds(10, 9_999.5)).toBe(0.5);
    expect(remainingMilliseconds(10, 10_001)).toBe(0);
    expect(tapsPerSecond(12, 1_500)).toBe(8);
    expect(tapsPerSecond(0, 0)).toBe(0);
    expect(tapGaugePercent([0, 0])).toBe(50);
    expect(tapGaugePercent([3, 1])).toBe(75);
    expect(tapGaugePercent([0, 8])).toBe(0);
  });
});

describe('tap input de-duplication', () => {
  it('ignores keyboard auto-repeat and unrelated keys', () => {
    expect(playerForTapKey('KeyF', false)).toBe(1);
    expect(playerForTapKey('KeyJ', false)).toBe(2);
    expect(playerForTapKey('KeyF', true)).toBeNull();
    expect(playerForTapKey('Space', false)).toBeNull();
  });

  it('counts a pointer id once until that pointer is released', () => {
    const first = registerPointerDown(new Set(), 41);
    expect(first.accepted).toBe(true);

    const duplicate = registerPointerDown(first.activePointerIds, 41);
    expect(duplicate.accepted).toBe(false);

    const simultaneous = registerPointerDown(duplicate.activePointerIds, 42);
    expect(simultaneous.accepted).toBe(true);
    expect([...simultaneous.activePointerIds]).toEqual([41, 42]);

    const released = releasePointer(simultaneous.activePointerIds, 41);
    expect(registerPointerDown(released, 41).accepted).toBe(true);
  });
});
