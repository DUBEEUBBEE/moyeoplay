import { describe, expect, it } from 'vitest';

import {
  MAX_PARTICIPANTS,
  MIN_PARTICIPANTS,
  calculateMapping,
  generateLadder,
  hasRungInEveryGap,
  isPermutation,
  isValidRungLayout,
  normalizeEntries,
  traceLadder,
} from './logic';

describe('generateLadder', () => {
  it('creates valid, dense, complete permutations for every supported size', () => {
    for (let count = MIN_PARTICIPANTS; count <= MAX_PARTICIPANTS; count += 1) {
      for (let sample = 0; sample < 40; sample += 1) {
        const ladder = generateLadder(count, `size-${String(count)}-sample-${String(sample)}`);
        expect(isValidRungLayout(count, ladder.rowCount, ladder.rungs)).toBe(true);
        expect(hasRungInEveryGap(count, ladder.rungs)).toBe(true);
        expect(ladder.rungs.length).toBeGreaterThanOrEqual(count * 2);
        expect(isPermutation(ladder.mapping, count)).toBe(true);
        expect(ladder.mapping.every((end, start) => end !== start)).toBe(true);
        expect(ladder.mapping).toEqual(calculateMapping(count, ladder.rowCount, ladder.rungs));
      }
    }
  });

  it('never places adjacent rungs on the same row', () => {
    const ladder = generateLadder(8, 'adjacency-check');
    for (const rung of ladder.rungs) {
      expect(
        ladder.rungs.some(
          (candidate) => candidate.row === rung.row && candidate.left === rung.left + 1,
        ),
      ).toBe(false);
    }
  });

  it('is exactly reproducible from its seed', () => {
    const first = generateLadder(7, 'party-night-42');
    const second = generateLadder(7, 'party-night-42');
    const different = generateLadder(7, 'party-night-43');

    expect(second).toEqual(first);
    expect(different.rungs).not.toEqual(first.rungs);
  });

  it('rejects participant counts outside 2 through 8', () => {
    expect(() => generateLadder(1, 'low')).toThrow(RangeError);
    expect(() => generateLadder(9, 'high')).toThrow(RangeError);
  });
});

describe('ladder traversal', () => {
  it('follows swaps from top to bottom and reports each row', () => {
    const rungs = [
      { row: 0, left: 0 },
      { row: 1, left: 1 },
      { row: 2, left: 0 },
    ] as const;

    const trace = traceLadder(0, 3, 3, rungs);
    expect(trace.steps).toEqual([
      { row: 0, from: 0, to: 1 },
      { row: 1, from: 1, to: 2 },
      { row: 2, from: 2, to: 2 },
    ]);
    expect(trace.end).toBe(2);
    expect(calculateMapping(3, 3, rungs)).toEqual([2, 1, 0]);
  });

  it('detects malformed or overlapping rung layouts', () => {
    expect(
      isValidRungLayout(4, 3, [
        { row: 0, left: 0 },
        { row: 0, left: 1 },
      ]),
    ).toBe(false);
    expect(isValidRungLayout(4, 3, [{ row: 3, left: 0 }])).toBe(false);
  });
});

describe('normalizeEntries', () => {
  it('trims values and safely replaces blank entries', () => {
    expect(
      normalizeEntries(['  민지  ', '   '], 2, (index) => `친구 ${String(index + 1)}`),
    ).toEqual(['민지', '친구 2']);
  });
});
