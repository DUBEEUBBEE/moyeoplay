import type { RandomSource } from '../../core/seeded-random';

export const REACTION_TARGET_SCORE = 3;
export const REACTION_TIE_WINDOW_MS = 8;

export interface ReactionOutcome {
  winner: 0 | 1 | 2;
  p1Time: number | null;
  p2Time: number | null;
}

export function reactionWaitMs(random: RandomSource, min = 1_350, max = 3_750): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= min) {
    throw new RangeError('Invalid reaction wait range');
  }
  const unit = Math.min(Math.max(random(), 0), 0.999999999);
  const curved = 0.18 * unit + 0.82 * unit * unit;
  return Math.round(min + curved * (max - min));
}

export function isFalseStart(signalAt: number | null, pressedAt: number): boolean {
  return signalAt === null || pressedAt < signalAt;
}

export function resolveReaction(
  signalAt: number,
  p1PressedAt: number | null,
  p2PressedAt: number | null,
  tieWindowMs = REACTION_TIE_WINDOW_MS,
): ReactionOutcome {
  const p1Time = p1PressedAt === null ? null : Math.max(0, p1PressedAt - signalAt);
  const p2Time = p2PressedAt === null ? null : Math.max(0, p2PressedAt - signalAt);
  if (p1Time === null && p2Time === null) return { winner: 0, p1Time, p2Time };
  if (p1Time === null) return { winner: 2, p1Time, p2Time };
  if (p2Time === null) return { winner: 1, p1Time, p2Time };
  if (Math.abs(p1Time - p2Time) <= tieWindowMs) return { winner: 0, p1Time, p2Time };
  return { winner: p1Time < p2Time ? 1 : 2, p1Time, p2Time };
}
