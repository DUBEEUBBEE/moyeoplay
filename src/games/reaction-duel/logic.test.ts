import { describe, expect, it } from 'vitest';
import { isFalseStart, reactionWaitMs, resolveReaction } from './logic';

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
});
