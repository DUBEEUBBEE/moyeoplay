import { describe, expect, it } from 'vitest';

import {
  MAX_PARTICIPANTS,
  MIN_PARTICIPANTS,
  calculateMapping,
  createLadderForPermutation,
  generateLadder,
  isPermutation,
  isValidRungLayout,
  normalizeEntries,
  selectTargetPermutation,
  shuffleEntries,
  traceLadder,
  type RandomIndexSource,
} from './logic';

function deterministicIndexSource(values: readonly number[]): RandomIndexSource {
  let cursor = 0;
  return (maxExclusive) => {
    const value = values[cursor] ?? maxExclusive - 1;
    cursor += 1;
    return value;
  };
}

function targetFixtures(size: number): number[][] {
  const identity = Array.from({ length: size }, (_, index) => index);
  const candidates = [
    identity,
    [...identity].reverse(),
    Array.from({ length: size }, (_, index) => (index + 1) % size),
    Array.from({ length: size }, (_, index) => (index + size - 1) % size),
    size > 2 ? [1, 0, ...identity.slice(2)] : [1, 0],
    size > 3 ? [0, 2, 1, ...identity.slice(3)] : identity,
  ];
  return [...new Map(candidates.map((value) => [value.join(','), value])).values()];
}

describe('uniform ladder target selection', () => {
  it('can select both identity and swap for two participants', () => {
    expect(selectTargetPermutation(2, () => 1)).toEqual([0, 1]);
    expect(selectTargetPermutation(2, () => 0)).toEqual([1, 0]);
    expect(generateLadder(2, () => 1).mapping).toEqual([0, 1]);
    expect(generateLadder(2, () => 0).mapping).toEqual([1, 0]);
  });

  it('uses Fisher-Yates bounds and is reproducible with a deterministic source', () => {
    const calls: number[] = [];
    const values = [3, 1, 4, 0, 1, 0, 0];
    const source = (maxExclusive: number): number => {
      calls.push(maxExclusive);
      return values[calls.length - 1] ?? 0;
    };
    const first = selectTargetPermutation(8, source);
    const second = selectTargetPermutation(8, deterministicIndexSource(values));

    expect(calls).toEqual([8, 7, 6, 5, 4, 3, 2]);
    expect(second).toEqual(first);
    expect(isPermutation(first, 8)).toBe(true);
  });

  it('rejects invalid participant counts and invalid injected indices', () => {
    expect(() => selectTargetPermutation(1, () => 0)).toThrow(RangeError);
    expect(() => selectTargetPermutation(9, () => 0)).toThrow(RangeError);
    expect(() => selectTargetPermutation(4, () => -1)).toThrow(RangeError);
    expect(() => selectTargetPermutation(4, (maxExclusive) => maxExclusive)).toThrow(RangeError);
    expect(() => selectTargetPermutation(4, () => 0.5)).toThrow(RangeError);
  });
});

describe('target permutation to ladder conversion', () => {
  it('implements every representative target from 3 through 8 exactly', () => {
    for (let count = 3; count <= MAX_PARTICIPANTS; count += 1) {
      for (const target of targetFixtures(count)) {
        const ladder = createLadderForPermutation(target);
        expect(isValidRungLayout(count, ladder.rowCount, ladder.rungs)).toBe(true);
        expect(isPermutation(ladder.mapping, count)).toBe(true);
        expect(ladder.mapping).toEqual(target);
        expect(calculateMapping(count, ladder.rowCount, ladder.rungs)).toEqual(target);
      }
    }
  });

  it('allows fixed points, including a completely unchanged result', () => {
    for (let count = MIN_PARTICIPANTS; count <= MAX_PARTICIPANTS; count += 1) {
      const identity = Array.from({ length: count }, (_, index) => index);
      const ladder = createLadderForPermutation(identity);
      expect(ladder.mapping).toEqual(identity);
      expect(ladder.rungs).toEqual([]);
    }
  });

  it('never creates duplicate or adjacent rungs on a row', () => {
    const ladder = createLadderForPermutation([7, 6, 5, 4, 3, 2, 1, 0]);
    const byRow = new Map<number, number[]>();
    for (const rung of ladder.rungs) {
      const row = byRow.get(rung.row) ?? [];
      row.push(rung.left);
      byRow.set(rung.row, row);
    }

    expect(ladder.rungs).toHaveLength(28);
    for (const columns of byRow.values()) {
      expect(new Set(columns).size).toBe(columns.length);
      for (const left of columns) {
        expect(columns).not.toContain(left + 1);
      }
    }
  });

  it('keeps every traced step inside the valid column range', () => {
    for (let count = MIN_PARTICIPANTS; count <= MAX_PARTICIPANTS; count += 1) {
      const target = Array.from({ length: count }, (_, index) => count - index - 1);
      const ladder = createLadderForPermutation(target);
      for (let start = 0; start < count; start += 1) {
        const trace = traceLadder(start, count, ladder.rowCount, ladder.rungs);
        expect(trace.end).toBe(target[start]);
        expect(
          trace.steps.every(
            (step) => step.from >= 0 && step.from < count && step.to >= 0 && step.to < count,
          ),
        ).toBe(true);
      }
    }
  });

  it('rejects malformed targets and row counts too short for their swaps', () => {
    expect(() => createLadderForPermutation([0, 0])).toThrow(RangeError);
    expect(() => createLadderForPermutation([0, 1.5])).toThrow(RangeError);
    expect(() => createLadderForPermutation([0, 2])).toThrow(RangeError);
    expect(() => createLadderForPermutation([7, 6, 5, 4, 3, 2, 1, 0], { rowCount: 7 })).toThrow(
      RangeError,
    );
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

  it('detects malformed or overlapping rung layouts and non-integer mappings', () => {
    expect(
      isValidRungLayout(4, 3, [
        { row: 0, left: 0 },
        { row: 0, left: 1 },
      ]),
    ).toBe(false);
    expect(isValidRungLayout(4, 3, [{ row: 3, left: 0 }])).toBe(false);
    expect(isPermutation([0.5, 1.5], 2)).toBe(false);
  });
});

describe('normalizeEntries', () => {
  it('trims values and safely replaces blank entries', () => {
    expect(
      normalizeEntries(['  민지  ', '   '], 2, (index) => `친구 ${String(index + 1)}`),
    ).toEqual(['민지', '친구 2']);
  });
});

describe('visible result shuffle', () => {
  it('shuffles the visible result order with bounded unbiased index draws', () => {
    const bounds: number[] = [];
    const shuffled = shuffleEntries(['A', 'B', 'C', 'D'], (maxExclusive) => {
      bounds.push(maxExclusive);
      return 0;
    });

    expect(bounds).toEqual([4, 3, 2]);
    expect(shuffled).toEqual(['B', 'C', 'D', 'A']);
  });
});
