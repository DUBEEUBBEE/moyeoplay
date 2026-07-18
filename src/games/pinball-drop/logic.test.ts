import { describe, expect, it } from 'vitest';
import {
  PINBALL_BOOSTS_PER_ROUND,
  PINBALL_TIE_TOLERANCE,
  PINBALL_WIDTH,
  applyPinballBoost,
  createPinballState,
  generateMirroredPegs,
  judgePinballRound,
  recordPinballLanding,
} from './logic';

describe('pinball drop logic', () => {
  it('generates an exact mirrored board from one seed', () => {
    const pegs = generateMirroredPegs('same-round');
    expect(pegs.left).toHaveLength(pegs.right.length);
    for (let index = 0; index < pegs.left.length; index += 1) {
      const left = pegs.left[index];
      const right = pegs.right[index];
      expect(right?.x).toBeCloseTo(PINBALL_WIDTH - (left?.x ?? 0), 10);
      expect(right?.y).toBe(left?.y);
      expect(right?.radius).toBe(left?.radius);
      expect(right?.restitution).toBe(left?.restitution);
    }
  });

  it('records only the first floor crossing', () => {
    const state = createPinballState();
    const ball = state.balls[0];
    expect(recordPinballLanding(ball, 3.25)).toBe(true);
    expect(recordPinballLanding(ball, 4.5)).toBe(false);
    expect(ball.landedAt).toBe(3.25);
  });

  it('uses the inclusive 0.05 second tie threshold', () => {
    expect(judgePinballRound(4, 4 + PINBALL_TIE_TOLERANCE)).toBe(0);
    expect(judgePinballRound(4, 4.051)).toBe(2);
    expect(judgePinballRound(4.051, 4)).toBe(1);
  });

  it('limits each player to three boosts per round', () => {
    const state = createPinballState();
    state.phase = 'playing';
    for (let boost = 0; boost < PINBALL_BOOSTS_PER_ROUND; boost += 1) {
      state.balls[0].boostCooldown = 0;
      expect(applyPinballBoost(state, 1)).toBe(true);
    }
    state.balls[0].boostCooldown = 0;
    expect(applyPinballBoost(state, 1)).toBe(false);
    expect(state.balls[0].boostsRemaining).toBe(0);
    expect(state.balls[1].boostsRemaining).toBe(PINBALL_BOOSTS_PER_ROUND);
  });
});
