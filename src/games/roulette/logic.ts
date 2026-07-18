import { secureRandomIndex } from '../../core/seeded-random';

export const MIN_ROULETTE_ITEMS = 2;
export const MAX_ROULETTE_ITEMS = 12;
export const MAX_ROULETTE_ITEM_CHARACTERS = 120;
export const ROULETTE_FULL_TURN = Math.PI * 2;

export type RandomIndexSource = (length: number) => number;

export interface RouletteSpinPlan {
  readonly itemCount: number;
  readonly targetIndex: number;
  readonly startRotation: number;
  readonly finalRotation: number;
}

function assertItemCount(itemCount: number): void {
  if (
    !Number.isInteger(itemCount) ||
    itemCount < MIN_ROULETTE_ITEMS ||
    itemCount > MAX_ROULETTE_ITEMS
  ) {
    throw new RangeError('roulette item count must be an integer from 2 through 12');
  }
}

export function normalizeRadians(angle: number): number {
  if (!Number.isFinite(angle)) throw new RangeError('angle must be finite');
  return ((angle % ROULETTE_FULL_TURN) + ROULETTE_FULL_TURN) % ROULETTE_FULL_TURN;
}

export function rouletteSliceAngle(itemCount: number): number {
  assertItemCount(itemCount);
  return ROULETTE_FULL_TURN / itemCount;
}

export function normalizeRouletteItems(values: readonly string[]): string[] {
  assertItemCount(values.length);
  return values.map((value, index) => {
    const trimmed = value.trim();
    if (!trimmed) return `벌칙 ${String(index + 1)}`;
    return Array.from(trimmed).slice(0, MAX_ROULETTE_ITEM_CHARACTERS).join('');
  });
}

export function truncateRouletteLabel(value: string, maxCharacters: number): string {
  if (!Number.isSafeInteger(maxCharacters) || maxCharacters < 2) {
    throw new RangeError('maxCharacters must be an integer of at least 2');
  }
  const characters = Array.from(value);
  if (characters.length <= maxCharacters) return value;
  return `${characters.slice(0, maxCharacters - 1).join('')}…`;
}

/**
 * The default source is rejection-sampled secureRandomIndex. Supplying the
 * same `(length) => index` abstraction makes selection deterministic in tests.
 */
export function selectRouletteIndex(
  itemCount: number,
  randomIndex: RandomIndexSource = secureRandomIndex,
): number {
  assertItemCount(itemCount);
  const selected = randomIndex(itemCount);
  if (!Number.isInteger(selected) || selected < 0 || selected >= itemCount) {
    throw new RangeError('random index source returned an out-of-range index');
  }
  return selected;
}

/** Returns the equal-sized slice currently centered under the fixed top pointer. */
export function rouletteIndexAtPointer(rotation: number, itemCount: number): number {
  assertItemCount(itemCount);
  const slice = rouletteSliceAngle(itemCount);
  return Math.round(normalizeRadians(-rotation) / slice) % itemCount;
}

/**
 * Builds a clockwise destination whose selected slice center lands exactly at
 * the top pointer. The non-normalized destination preserves the requested
 * number of visible full turns.
 */
export function finalRotationForIndex(
  currentRotation: number,
  targetIndex: number,
  itemCount: number,
  fullTurns = 6,
): number {
  assertItemCount(itemCount);
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= itemCount) {
    throw new RangeError('targetIndex is outside the roulette');
  }
  if (!Number.isSafeInteger(fullTurns) || fullTurns < 0) {
    throw new RangeError('fullTurns must be a non-negative safe integer');
  }

  const targetNormalized = normalizeRadians(-targetIndex * rouletteSliceAngle(itemCount));
  const forwardDelta = normalizeRadians(targetNormalized - normalizeRadians(currentRotation));
  return currentRotation + fullTurns * ROULETTE_FULL_TURN + forwardDelta;
}

/** Selects the result first, then derives the animation destination from it. */
export function createRouletteSpinPlan(
  itemCount: number,
  currentRotation: number,
  randomIndex: RandomIndexSource = secureRandomIndex,
  fullTurns = 6,
): RouletteSpinPlan {
  const targetIndex = selectRouletteIndex(itemCount, randomIndex);
  return {
    itemCount,
    targetIndex,
    startRotation: currentRotation,
    finalRotation: finalRotationForIndex(currentRotation, targetIndex, itemCount, fullTurns),
  };
}

export function rouletteRotationAtProgress(plan: RouletteSpinPlan, progress: number): number {
  if (!Number.isFinite(progress)) throw new RangeError('progress must be finite');
  if (progress <= 0) return plan.startRotation;
  if (progress >= 1) return plan.finalRotation;
  const eased = 1 - (1 - progress) ** 5;
  return plan.startRotation + (plan.finalRotation - plan.startRotation) * eased;
}
