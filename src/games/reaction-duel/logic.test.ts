import { describe, expect, it } from 'vitest';
import {
  isFalseStart,
  normalizeEventTimestamp,
  reactionWaitMs,
  resolveReaction,
  REACTION_RESOLVE_BUFFER_MS,
  REACTION_TIE_WINDOW_MS,
} from './logic';

describe('reaction duel logic', () => {
  it('generates bounded variable wait durations', () => {
    expect(reactionWaitMs(() => 0)).toBe(1350);
    expect(reactionWaitMs(() => 0.999999)).toBeLessThanOrEqual(3750);
    expect(reactionWaitMs(() => 0.5)).not.toBe(reactionWaitMs(() => 0.8));
  });

  it('marks every pre-signal press as a false start', () => {
    expect(isFalseStart(null, 100)).toBe(true);
    expect(isFalseStart(200, 199)).toBe(true);
    expect(isFalseStart(200, 200)).toBe(false);
  });

  it('resolves wins and near-simultaneous ties', () => {
    expect(resolveReaction(1000, 1180, 1210).winner).toBe(1);
    expect(resolveReaction(1000, 1200, 1206).winner).toBe(0);
    expect(resolveReaction(1000, null, 1300).winner).toBe(2);
  });

  it('treats exactly 8ms as a tie and a value outside the boundary as a win', () => {
    expect(resolveReaction(1000, 1200, 1200 + REACTION_TIE_WINDOW_MS).winner).toBe(0);
    expect(resolveReaction(1000, 1200, 1200 + REACTION_TIE_WINDOW_MS + 0.001).winner).toBe(1);
    expect(REACTION_RESOLVE_BUFFER_MS).toBeGreaterThan(REACTION_TIE_WINDOW_MS);
  });

  it('uses event timestamps rather than handler order to choose a winner', () => {
    const p2HandledFirstButPressedLater = 1210;
    const p1HandledSecondButPressedEarlier = 1190;
    const outcome = resolveReaction(
      1000,
      p1HandledSecondButPressedEarlier,
      p2HandledFirstButPressedLater,
    );
    expect(outcome.winner).toBe(1);
    expect(outcome.p1Time).toBe(190);
    expect(outcome.p2Time).toBe(210);
  });

  it('normalizes high-resolution and epoch-based event clocks to performance time', () => {
    const timeOrigin = 1_700_000_000_000;
    expect(normalizeEventTimestamp(180, 200, timeOrigin)).toBe(180);
    expect(normalizeEventTimestamp(timeOrigin + 180, 200, timeOrigin)).toBe(180);
    expect(normalizeEventTimestamp(Number.NaN, 200, timeOrigin)).toBe(200);
    expect(normalizeEventTimestamp(timeOrigin + 5_000, 200, timeOrigin)).toBe(200);
  });

  it('keeps reaction durations unchanged when pause time is added to the clock domain', () => {
    const beforePause = resolveReaction(1000, 1120, 1140);
    const afterPause = resolveReaction(1500, 1620, 1640);
    expect(afterPause).toEqual(beforePause);
  });
});
