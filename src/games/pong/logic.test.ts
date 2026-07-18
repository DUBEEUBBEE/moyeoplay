import { describe, expect, it } from 'vitest';
import {
  PONG_MAX_BOUNCE_ANGLE,
  PONG_MAX_SPEED,
  calculatePaddleBounce,
  cappedRallySpeed,
  createPongState,
  scorePongPoint,
  updatePong,
} from './logic';

describe('pong logic', () => {
  it('latches a point so it is scored only once', () => {
    const state = createPongState(7);
    state.phase = 'playing';
    state.ball.x = -30;
    state.ball.velocityX = -500;

    updatePong(state, { player1Axis: 0, player2Axis: 0 }, 1 / 60);
    expect(state.scores).toEqual([0, 1]);
    expect(scorePongPoint(state, 2)).toBe(false);
    expect(state.scores).toEqual([0, 1]);
  });

  it('keeps paddle reflection inside the playable angle range', () => {
    for (const hit of [-2, -1, -0.5, 0, 0.5, 1, 2]) {
      for (const motion of [-1_000, 0, 1_000]) {
        const bounce = calculatePaddleBounce(hit, motion, 1, 500);
        expect(Math.abs(bounce.angle)).toBeLessThanOrEqual(PONG_MAX_BOUNCE_ANGLE);
        expect(bounce.velocityX).toBeGreaterThan(0);
      }
    }
  });

  it('caps speed during arbitrarily long rallies', () => {
    let speed = 390;
    for (let hit = 0; hit < 1_000; hit += 1) speed = cappedRallySpeed(speed);
    expect(speed).toBe(PONG_MAX_SPEED);
  });
});
