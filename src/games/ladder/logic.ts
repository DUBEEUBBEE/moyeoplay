import { secureRandomIndex } from '../../core/seeded-random';

export const MIN_PARTICIPANTS = 2;
export const MAX_PARTICIPANTS = 8;

export type RandomIndexSource = (maxExclusive: number) => number;

export interface LadderRung {
  readonly row: number;
  /** The zero-based column on the left side of this rung. */
  readonly left: number;
}

export interface LadderStep {
  readonly row: number;
  readonly from: number;
  readonly to: number;
}

export interface LadderTrace {
  readonly start: number;
  readonly end: number;
  readonly steps: readonly LadderStep[];
}

export interface LadderLayout {
  readonly participantCount: number;
  readonly rowCount: number;
  readonly rungs: readonly LadderRung[];
  /** The uniformly selected target permutation, expressed as start -> end. */
  readonly mapping: readonly number[];
}

export interface LadderFromPermutationOptions {
  readonly rowCount?: number;
}

function assertParticipantCount(participantCount: number): void {
  if (
    !Number.isInteger(participantCount) ||
    participantCount < MIN_PARTICIPANTS ||
    participantCount > MAX_PARTICIPANTS
  ) {
    throw new RangeError('participantCount must be an integer from 2 to 8');
  }
}

function assertRowCount(rowCount: number, participantCount: number): void {
  if (!Number.isInteger(rowCount) || rowCount < participantCount - 1) {
    throw new RangeError('rowCount must be an integer large enough to cover every gap');
  }
}

function swap(values: unknown[], left: number, right: number): void {
  [values[left], values[right]] = [values[right], values[left]];
}

export function defaultRowCount(participantCount: number): number {
  assertParticipantCount(participantCount);
  return Math.max(14, participantCount * 4);
}

export function isValidRungLayout(
  participantCount: number,
  rowCount: number,
  rungs: readonly LadderRung[],
): boolean {
  if (
    !Number.isInteger(participantCount) ||
    participantCount < MIN_PARTICIPANTS ||
    participantCount > MAX_PARTICIPANTS ||
    !Number.isInteger(rowCount) ||
    rowCount < 1
  ) {
    return false;
  }

  const occupied = new Set<string>();
  for (const rung of rungs) {
    if (
      !Number.isInteger(rung.row) ||
      !Number.isInteger(rung.left) ||
      rung.row < 0 ||
      rung.row >= rowCount ||
      rung.left < 0 ||
      rung.left >= participantCount - 1
    ) {
      return false;
    }

    const key = `${String(rung.row)}:${String(rung.left)}`;
    if (
      occupied.has(key) ||
      occupied.has(`${String(rung.row)}:${String(rung.left - 1)}`) ||
      occupied.has(`${String(rung.row)}:${String(rung.left + 1)}`)
    ) {
      return false;
    }
    occupied.add(key);
  }
  return true;
}

export function hasRungInEveryGap(participantCount: number, rungs: readonly LadderRung[]): boolean {
  if (!Number.isInteger(participantCount) || participantCount < MIN_PARTICIPANTS) return false;
  const gaps = new Set(rungs.map((rung) => rung.left));
  return Array.from({ length: participantCount - 1 }, (_, gap) => gap).every((gap) =>
    gaps.has(gap),
  );
}

export function traceLadder(
  start: number,
  participantCount: number,
  rowCount: number,
  rungs: readonly LadderRung[],
): LadderTrace {
  assertParticipantCount(participantCount);
  assertRowCount(rowCount, participantCount);
  if (!Number.isInteger(start) || start < 0 || start >= participantCount) {
    throw new RangeError('start must be a valid zero-based participant index');
  }
  if (!isValidRungLayout(participantCount, rowCount, rungs)) {
    throw new Error('Cannot trace an invalid ladder layout');
  }

  const byRow = new Map<number, Set<number>>();
  for (const rung of rungs) {
    const row = byRow.get(rung.row) ?? new Set<number>();
    row.add(rung.left);
    byRow.set(rung.row, row);
  }

  let column = start;
  const steps: LadderStep[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    const rowRungs = byRow.get(row);
    let next = column;
    if (rowRungs?.has(column)) next = column + 1;
    else if (rowRungs?.has(column - 1)) next = column - 1;
    steps.push({ row, from: column, to: next });
    column = next;
  }

  return { start, end: column, steps };
}

export function calculateMapping(
  participantCount: number,
  rowCount: number,
  rungs: readonly LadderRung[],
): number[] {
  assertParticipantCount(participantCount);
  return Array.from(
    { length: participantCount },
    (_, start) => traceLadder(start, participantCount, rowCount, rungs).end,
  );
}

export function isPermutation(mapping: readonly number[], size = mapping.length): boolean {
  if (!Number.isInteger(size) || size < 0 || mapping.length !== size) return false;
  return (
    new Set(mapping).size === size &&
    mapping.every((value) => Number.isInteger(value) && value >= 0 && value < size)
  );
}

/** Selects each of the n! start -> end mappings with equal probability. */
export function selectTargetPermutation(
  participantCount: number,
  randomIndex: RandomIndexSource = secureRandomIndex,
): number[] {
  assertParticipantCount(participantCount);
  const permutation = Array.from({ length: participantCount }, (_, index) => index);
  for (let index = participantCount - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1);
    if (!Number.isInteger(target) || target < 0 || target > index) {
      throw new RangeError('random index source returned an out-of-range index');
    }
    swap(permutation, index, target);
  }
  return permutation;
}

/**
 * Converts a start -> end permutation to adjacent swaps. At the bottom, column
 * `end` must contain the path whose start is the inverse permutation at `end`.
 * Moving those starts into order yields at most n(n-1)/2 swaps (28 for n=8).
 * One swap per row makes same-row overlap impossible.
 */
export function createLadderForPermutation(
  targetPermutation: readonly number[],
  options: LadderFromPermutationOptions = {},
): LadderLayout {
  const participantCount = targetPermutation.length;
  assertParticipantCount(participantCount);
  if (!isPermutation(targetPermutation, participantCount)) {
    throw new RangeError('targetPermutation must be a complete permutation');
  }

  const startAtEnd = Array.from({ length: participantCount }, () => -1);
  for (let start = 0; start < participantCount; start += 1) {
    const end = targetPermutation[start];
    if (end !== undefined) startAtEnd[end] = start;
  }

  const currentOrder = Array.from({ length: participantCount }, (_, index) => index);
  const adjacentSwaps: number[] = [];
  for (let end = 0; end < participantCount; end += 1) {
    const wantedStart = startAtEnd[end];
    if (wantedStart === undefined || wantedStart < 0) {
      throw new Error('target permutation is missing a destination');
    }
    let currentColumn = currentOrder.indexOf(wantedStart);
    while (currentColumn > end) {
      const left = currentColumn - 1;
      adjacentSwaps.push(left);
      swap(currentOrder, left, currentColumn);
      currentColumn -= 1;
    }
  }

  const minimumRows = Math.max(participantCount - 1, adjacentSwaps.length);
  const rowCount = options.rowCount ?? Math.max(defaultRowCount(participantCount), minimumRows);
  assertRowCount(rowCount, participantCount);
  if (rowCount < adjacentSwaps.length) {
    throw new RangeError('rowCount must provide at least one row per adjacent swap');
  }

  const firstRow = Math.floor((rowCount - adjacentSwaps.length) / 2);
  const rungs = adjacentSwaps.map((left, index) => Object.freeze({ row: firstRow + index, left }));
  const calculatedMapping = calculateMapping(participantCount, rowCount, rungs);
  if (!calculatedMapping.every((end, start) => end === targetPermutation[start])) {
    throw new Error('generated ladder does not implement its target permutation');
  }

  return Object.freeze({
    participantCount,
    rowCount,
    rungs: Object.freeze(rungs),
    mapping: Object.freeze([...calculatedMapping]),
  });
}

export function generateLadder(
  participantCount: number,
  randomIndex: RandomIndexSource = secureRandomIndex,
): LadderLayout {
  return createLadderForPermutation(selectTargetPermutation(participantCount, randomIndex));
}

export function normalizeEntries(
  values: readonly string[],
  participantCount: number,
  fallback: (index: number) => string,
): string[] {
  assertParticipantCount(participantCount);
  return Array.from({ length: participantCount }, (_, index) => {
    const value = values[index]?.trim();
    if (!value) return fallback(index);
    return value;
  });
}

export function shuffleEntries(
  values: readonly string[],
  randomIndex: RandomIndexSource = secureRandomIndex,
): string[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1);
    if (!Number.isInteger(target) || target < 0 || target > index) {
      throw new RangeError('random index source returned an out-of-range index');
    }
    swap(shuffled, index, target);
  }
  return shuffled;
}
