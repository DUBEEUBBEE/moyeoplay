import { describe, expect, it } from 'vitest';
import {
  VOLLEYBALL_NET_X,
  VOLLEYBALL_NET_WIDTH,
  VOLLEYBALL_PLAYER_RADIUS,
  createVolleyballState,
  resolveBallNetCollision,
  resolveBallPlayerCollision,
  scoreVolleyballPoint,
  updateVolleyball,
} from './logic';

describe('volleyball logic', () => {
  it('counts the first floor contact only once', () => {
    const state = createVolleyballState(7);
    state.phase = 'playing';
    state.ball.x = 200;
    state.ball.y = 470;
    state.ball.velocityY = 500;

    updateVolleyball(
      state,
      { player1Axis: 0, player1Jump: false, player2Axis: 0, player2Jump: false },
      1 / 60,
    );
    expect(state.scores).toEqual([0, 1]);
    expect(scoreVolleyballPoint(state, 2)).toBe(false);
    expect(state.scores).toEqual([0, 1]);
  });

  it('separates a ball from a player with finite velocity', () => {
    const state = createVolleyballState();
    state.ball.x = state.players[0].x;
    state.ball.y = state.players[0].y - 20;
    state.ball.velocityY = 400;
    expect(resolveBallPlayerCollision(state.ball, state.players[0])).toBe(true);
    expect(
      Math.hypot(state.ball.x - state.players[0].x, state.ball.y - state.players[0].y),
    ).toBeGreaterThanOrEqual(state.ball.radius + VOLLEYBALL_PLAYER_RADIUS);
    expect(Number.isFinite(state.ball.velocityX)).toBe(true);
    expect(Number.isFinite(state.ball.velocityY)).toBe(true);
  });

  it('ejects a ball from the net and preserves court ownership limits', () => {
    const state = createVolleyballState();
    state.ball.x = VOLLEYBALL_NET_X;
    state.ball.y = 300;
    state.ball.velocityX = 300;
    expect(resolveBallNetCollision(state.ball)).toBe(true);
    expect(
      state.ball.x + state.ball.radius <= VOLLEYBALL_NET_X - VOLLEYBALL_NET_WIDTH / 2 ||
        state.ball.x - state.ball.radius >= VOLLEYBALL_NET_X + VOLLEYBALL_NET_WIDTH / 2 ||
        state.ball.y + state.ball.radius <= 258,
    ).toBe(true);

    state.phase = 'playing';
    updateVolleyball(
      state,
      { player1Axis: 1, player1Jump: false, player2Axis: -1, player2Jump: false },
      0.1,
    );
    expect(state.players[0].x + state.players[0].radius).toBeLessThanOrEqual(
      VOLLEYBALL_NET_X - VOLLEYBALL_NET_WIDTH / 2,
    );
    expect(state.players[1].x - state.players[1].radius).toBeGreaterThanOrEqual(
      VOLLEYBALL_NET_X + VOLLEYBALL_NET_WIDTH / 2,
    );
  });
});
