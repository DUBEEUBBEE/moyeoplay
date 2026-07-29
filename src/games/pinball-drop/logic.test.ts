import { describe, expect, it } from 'vitest';
import {
  PINBALL_BOOSTS_PER_ROUND,
  PINBALL_TIE_TOLERANCE,
  PINBALL_WIDTH,
  applyPinballBoost,
  createPinballRoundSetup,
  createPinballState,
  generateMirroredPegs,
  judgePinballRound,
  recordPinballLanding,
  resolvePinballRound,
  startPinballMatch,
  updatePinball,
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

  it('alternates seeded launch variation and tie-break priority between players', () => {
    const first = createPinballRoundSetup(12_345, 1);
    const repeated = createPinballRoundSetup(12_345, 1);
    const second = createPinballRoundSetup(12_345, 2);
    const third = createPinballRoundSetup(12_345, 3);

    expect(repeated).toEqual(first);
    expect(second.variationPlayer).not.toBe(first.variationPlayer);
    expect(second.tieBreaker).not.toBe(first.tieBreaker);
    expect(third.variationPlayer).toBe(first.variationPlayer);
    expect(third.tieBreaker).toBe(first.tieBreaker);
    expect(Math.abs(first.launchVelocityX[0])).not.toBe(Math.abs(first.launchVelocityX[1]));
    expect(first.launchVelocityY[0]).not.toBe(first.launchVelocityY[1]);
  });

  it('resolves an exact or near tie with the round tie-break player', () => {
    expect(resolvePinballRound(4, 4, 2)).toEqual({
      winner: 2,
      times: [4, 4],
      difference: 0,
      decidedByTieBreaker: true,
    });
    expect(resolvePinballRound(4.04, 4, 1)).toMatchObject({
      winner: 1,
      decidedByTieBreaker: true,
    });
    expect(resolvePinballRound(4.051, 4, 1)).toMatchObject({
      winner: 1,
      decidedByTieBreaker: false,
    });
  });

  it('finishes a no-input match instead of repeating mirrored draws forever', () => {
    const state = createPinballState('no-input-match');
    startPinballMatch(state);

    for (let step = 0; step < 20_000 && state.phase !== 'matchOver'; step += 1) {
      updatePinball(state, 1 / 120);
    }

    expect(state.phase).toBe('matchOver');
    expect(state.roundNumber).toBeLessThanOrEqual(3);
    expect(state.winner).not.toBe(0);
    expect(state.roundWins[state.winner - 1]).toBe(2);
    expect(state.lastResult?.winner).toBe(state.winner);
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
