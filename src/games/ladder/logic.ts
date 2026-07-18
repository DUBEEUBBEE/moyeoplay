import { createSeededRandom, shuffle } from '../../core/seeded-random';

export const MIN_PARTICIPANTS = 2;
export const MAX_PARTICIPANTS = 8;

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
  readonly seed: string;
  readonly rungs: readonly LadderRung[];
  readonly mapping: readonly number[];
}

export interface GenerateLadderOptions {
  readonly rowCount?: number;
  readonly density?: number;
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

function buildRungs(
  participantCount: number,
  rowCount: number,
  density: number,
  seed: string,
): LadderRung[] {
  const random = createSeededRandom(seed);
  const matrix = Array.from({ length: rowCount }, () =>
    Array.from({ length: participantCount - 1 }, () => false),
  );

  // First give every gap a rung on its own row. This prevents a visually dead
  // lane even for an unlucky seed and also establishes a useful baseline path.
  const coverageRows = shuffle(
    Array.from({ length: rowCount }, (_, row) => row),
    random,
  );
  for (let gap = 0; gap < participantCount - 1; gap += 1) {
    const row = coverageRows[gap];
    const rowData = row === undefined ? undefined : matrix[row];
    if (rowData) rowData[gap] = true;
  }

  const capacity = rowCount * Math.ceil((participantCount - 1) / 2);
  let target = Math.min(
    capacity,
    Math.max(participantCount * 2, Math.round(rowCount * (participantCount - 1) * density)),
  );
  // With two lanes an even number of swaps is the identity. Prefer a real
  // choice while keeping the requested density.
  if (participantCount === 2 && target % 2 === 0) target = Math.min(capacity, target + 1);

  const candidates = shuffle(
    Array.from({ length: rowCount * (participantCount - 1) }, (_, index) => ({
      row: Math.floor(index / (participantCount - 1)),
      left: index % (participantCount - 1),
    })),
    random,
  );

  let rungCount = participantCount - 1;
  for (const candidate of candidates) {
    if (rungCount >= target) break;
    const row = matrix[candidate.row];
    if (
      row === undefined ||
      row[candidate.left] ||
      row[candidate.left - 1] ||
      row[candidate.left + 1]
    ) {
      continue;
    }
    row[candidate.left] = true;
    rungCount += 1;
  }

  const rungs: LadderRung[] = [];
  for (let row = 0; row < matrix.length; row += 1) {
    for (let left = 0; left < participantCount - 1; left += 1) {
      if (matrix[row]?.[left]) rungs.push({ row, left });
    }
  }
  return rungs;
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
  return new Set(mapping).size === size && mapping.every((value) => value >= 0 && value < size);
}

export function generateLadder(
  participantCount: number,
  seed: string | number,
  options: GenerateLadderOptions = {},
): LadderLayout {
  assertParticipantCount(participantCount);
  const rowCount = options.rowCount ?? defaultRowCount(participantCount);
  assertRowCount(rowCount, participantCount);
  const density = options.density ?? 0.3;
  if (!Number.isFinite(density) || density < 0.15 || density > 0.7) {
    throw new RangeError('density must be between 0.15 and 0.7');
  }

  const normalizedSeed = String(seed);
  let selectedRungs: LadderRung[] = [];
  let selectedMapping: number[] = [];

  // A denser ladder can still cancel back to its starting column. Try a few
  // deterministic variants so every lane usually travels to a different end.
  // The last valid layout remains a safe fallback because every rung is a swap,
  // which always produces a complete one-to-one permutation.
  for (let attempt = 0; attempt < 24; attempt += 1) {
    selectedRungs = buildRungs(
      participantCount,
      rowCount,
      density,
      `${normalizedSeed}:${String(attempt)}`,
    );
    selectedMapping = calculateMapping(participantCount, rowCount, selectedRungs);
    if (selectedMapping.every((end, start) => end !== start)) break;
  }

  return {
    participantCount,
    rowCount,
    seed: normalizedSeed,
    rungs: selectedRungs,
    mapping: selectedMapping,
  };
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

export function shuffleEntries(values: readonly string[], seed: string | number): string[] {
  return shuffle(values, createSeededRandom(seed));
}
