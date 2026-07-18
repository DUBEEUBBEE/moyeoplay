export const TAP_DURATION_OPTIONS = [5, 10, 15] as const;
export const DEFAULT_TAP_DURATION_SECONDS = 10;

export type TapDurationSeconds = (typeof TAP_DURATION_OPTIONS)[number];
export type TapPlayer = 1 | 2;
export type TapCounts = readonly [number, number];

export interface TapBattleOutcome {
  readonly winner: 0 | TapPlayer;
  readonly counts: TapCounts;
  readonly total: number;
  readonly margin: number;
  readonly durationSeconds: TapDurationSeconds;
  readonly tapsPerSecond: readonly [number, number];
}

export interface PointerRegistration {
  readonly accepted: boolean;
  readonly activePointerIds: ReadonlySet<number>;
}

function assertCounts(counts: TapCounts): void {
  if (counts.some((count) => !Number.isSafeInteger(count) || count < 0)) {
    throw new RangeError('tap counts must be non-negative safe integers');
  }
}

export function isTapDuration(value: number): value is TapDurationSeconds {
  return (TAP_DURATION_OPTIONS as readonly number[]).includes(value);
}

export function countTap(counts: TapCounts, player: TapPlayer): TapCounts {
  assertCounts(counts);
  if (counts[player - 1] === Number.MAX_SAFE_INTEGER) {
    throw new RangeError('tap count cannot exceed Number.MAX_SAFE_INTEGER');
  }
  if (player === 1) return [counts[0] + 1, counts[1]];
  return [counts[0], counts[1] + 1];
}

export function tapsPerSecond(count: number, elapsedMilliseconds: number): number {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('count must be a non-negative safe integer');
  }
  if (!Number.isFinite(elapsedMilliseconds) || elapsedMilliseconds < 0) {
    throw new RangeError('elapsedMilliseconds must be a finite non-negative number');
  }
  if (elapsedMilliseconds === 0) return 0;
  return count / (elapsedMilliseconds / 1_000);
}

export function remainingMilliseconds(
  durationSeconds: TapDurationSeconds,
  elapsedMilliseconds: number,
): number {
  if (!isTapDuration(durationSeconds)) throw new RangeError('unsupported tap duration');
  if (!Number.isFinite(elapsedMilliseconds) || elapsedMilliseconds < 0) {
    throw new RangeError('elapsedMilliseconds must be a finite non-negative number');
  }
  return Math.max(0, durationSeconds * 1_000 - elapsedMilliseconds);
}

/** P1's share of the combined taps, expressed from 0 through 100. */
export function tapGaugePercent(counts: TapCounts): number {
  assertCounts(counts);
  const total = counts[0] + counts[1];
  return total === 0 ? 50 : (counts[0] / total) * 100;
}

export function resolveTapBattle(
  counts: TapCounts,
  durationSeconds: TapDurationSeconds,
): TapBattleOutcome {
  assertCounts(counts);
  if (!isTapDuration(durationSeconds)) throw new RangeError('unsupported tap duration');
  const winner = counts[0] === counts[1] ? 0 : counts[0] > counts[1] ? 1 : 2;
  return {
    winner,
    counts: [...counts],
    total: counts[0] + counts[1],
    margin: Math.abs(counts[0] - counts[1]),
    durationSeconds,
    tapsPerSecond: [
      tapsPerSecond(counts[0], durationSeconds * 1_000),
      tapsPerSecond(counts[1], durationSeconds * 1_000),
    ],
  };
}

/** Maps only fresh F/J key presses to players. Browser auto-repeat is rejected. */
export function playerForTapKey(code: string, repeat: boolean): TapPlayer | null {
  if (repeat) return null;
  if (code === 'KeyF') return 1;
  if (code === 'KeyJ') return 2;
  return null;
}

/**
 * Returns a new pointer-id set and accepts a pointer only once until release.
 * This keeps compatibility mouse/touch streams from double-counting a press.
 */
export function registerPointerDown(
  activePointerIds: ReadonlySet<number>,
  pointerId: number,
): PointerRegistration {
  if (!Number.isInteger(pointerId) || activePointerIds.has(pointerId)) {
    return { accepted: false, activePointerIds };
  }
  const next = new Set(activePointerIds);
  next.add(pointerId);
  return { accepted: true, activePointerIds: next };
}

export function releasePointer(
  activePointerIds: ReadonlySet<number>,
  pointerId: number,
): ReadonlySet<number> {
  if (!activePointerIds.has(pointerId)) return activePointerIds;
  const next = new Set(activePointerIds);
  next.delete(pointerId);
  return next;
}
