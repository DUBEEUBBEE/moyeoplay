import { describe, expect, it } from 'vitest';
import {
  VOLLEYBALL_FLOOR_Y,
  VOLLEYBALL_NET_X,
  VOLLEYBALL_NET_TOP,
  VOLLEYBALL_NET_WIDTH,
  VOLLEYBALL_PLAYER_RADIUS,
  createVolleyballState,
  resetVolleyballState,
  resolveBallNetCollision,
  resolveBallPlayerCollision,
  scoreVolleyballPoint,
  updateVolleyball,
} from './logic';

describe('volleyball logic', () => {
  const noInput = {
    player1Axis: 0,
    player1Jump: false,
    player2Axis: 0,
    player2Jump: false,
  } as const;

  function distanceFromNet(state: ReturnType<typeof createVolleyballState>): number {
    const left = VOLLEYBALL_NET_X - VOLLEYBALL_NET_WIDTH / 2;
    const right = VOLLEYBALL_NET_X + VOLLEYBALL_NET_WIDTH / 2;
    const closestX = Math.max(left, Math.min(right, state.ball.x));
    const closestY = Math.max(VOLLEYBALL_NET_TOP, Math.min(VOLLEYBALL_FLOOR_Y, state.ball.y));
    return Math.hypot(state.ball.x - closestX, state.ball.y - closestY);
  }

  it('counts the first floor contact only once', () => {
    const state = createVolleyballState(7);
    state.phase = 'playing';
    state.ball.x = 200;
    state.ball.y = 470;
    state.ball.velocityY = 500;

    updateVolleyball(state, noInput, 1 / 60);
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

  it('deterministically ejects a ball placed at the exact player center', () => {
    const state = createVolleyballState();
    const player = state.players[0];
    state.ball.x = player.x;
    state.ball.y = player.y;
    state.ball.velocityX = 0;
    state.ball.velocityY = 400;

    expect(resolveBallPlayerCollision(state.ball, player)).toBe(true);
    expect(Math.hypot(state.ball.x - player.x, state.ball.y - player.y)).toBeGreaterThanOrEqual(
      state.ball.radius + player.radius,
    );
    expect(state.ball.y).toBeLessThan(player.y);
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
    updateVolleyball(state, { ...noInput, player1Axis: 1, player2Axis: -1 }, 0.1);
    expect(state.players[0].x + state.players[0].radius).toBeLessThanOrEqual(
      VOLLEYBALL_NET_X - VOLLEYBALL_NET_WIDTH / 2,
    );
    expect(state.players[1].x - state.players[1].radius).toBeGreaterThanOrEqual(
      VOLLEYBALL_NET_X + VOLLEYBALL_NET_WIDTH / 2,
    );
  });

  it('separates a ball touching a player and the net corner in the same update', () => {
    const state = createVolleyballState();
    state.phase = 'playing';
    const player = state.players[0];
    player.x = VOLLEYBALL_NET_X - VOLLEYBALL_NET_WIDTH / 2 - player.radius;
    player.y = VOLLEYBALL_NET_TOP + 27;
    player.onGround = false;
    player.velocityX = 0;
    player.velocityY = 0;
    state.ball.x = 430;
    state.ball.y = 210;
    state.ball.velocityX = 900;
    state.ball.velocityY = 900;

    const event = updateVolleyball(state, noInput, 0.05);

    expect(event.netHit).toBe(true);
    expect(event.playerHit).toBe(1);
    expect(distanceFromNet(state)).toBeGreaterThanOrEqual(state.ball.radius - 0.1);
    expect(Math.hypot(state.ball.x - player.x, state.ball.y - player.y)).toBeGreaterThanOrEqual(
      state.ball.radius + player.radius - 0.1,
    );
    expect(Number.isFinite(state.ball.velocityX)).toBe(true);
    expect(Number.isFinite(state.ball.velocityY)).toBe(true);
  });

  it('fully separates forced ball positions around the narrow player-net corner', () => {
    const overlaps: string[] = [];
    for (let playerY = 210; playerY <= 350; playerY += 20) {
      for (let ballX = 410; ballX <= 510; ballX += 8) {
        for (let ballY = playerY - 64; ballY <= playerY + 64; ballY += 8) {
          const state = createVolleyballState();
          state.phase = 'playing';
          const player = state.players[0];
          player.x = VOLLEYBALL_NET_X - VOLLEYBALL_NET_WIDTH / 2 - player.radius;
          player.y = playerY;
          player.velocityX = 0;
          player.velocityY = 0;
          player.onGround = false;
          state.ball.x = ballX;
          state.ball.y = ballY;
          state.ball.velocityX = 0;
          state.ball.velocityY = 0;

          updateVolleyball(state, noInput, 1 / 120);
          const netDistance = distanceFromNet(state);
          const playerDistance = Math.hypot(state.ball.x - player.x, state.ball.y - player.y);
          if (
            netDistance < state.ball.radius - 0.1 ||
            playerDistance < state.ball.radius + player.radius - 0.1
          ) {
            overlaps.push(
              `playerY=${String(playerY)},ball=${String(ballX)}/${String(ballY)},net=${String(netDistance)},player=${String(playerDistance)}`,
            );
            if (overlaps.length >= 5) break;
          }
        }
        if (overlaps.length >= 5) break;
      }
      if (overlaps.length >= 5) break;
    }
    expect(overlaps).toEqual([]);
  });

  it('catches a maximum-speed floor crossing at the maximum accepted delta', () => {
    const state = createVolleyballState(7);
    state.phase = 'playing';
    state.ball.x = 100;
    state.ball.y = 350;
    state.ball.velocityX = 0;
    state.ball.velocityY = 1_150;

    const event = updateVolleyball(state, noInput, 0.1);

    expect(event.scoredBy).toBe(2);
    expect(state.scores).toEqual([0, 1]);
    expect(state.ball.y).toBe(VOLLEYBALL_FLOOR_Y - state.ball.radius);
    expect(scoreVolleyballPoint(state, 2)).toBe(false);
  });

  it('keeps inward-moving players on their own sides of the net', () => {
    const state = createVolleyballState();
    state.phase = 'playing';
    state.players[0].x =
      VOLLEYBALL_NET_X - VOLLEYBALL_NET_WIDTH / 2 - state.players[0].radius - 0.01;
    state.players[1].x =
      VOLLEYBALL_NET_X + VOLLEYBALL_NET_WIDTH / 2 + state.players[1].radius + 0.01;

    for (let step = 0; step < 30; step += 1) {
      updateVolleyball(state, { ...noInput, player1Axis: 1, player2Axis: -1 }, 1 / 120);
    }

    expect(state.players[0].x + state.players[0].radius).toBeLessThanOrEqual(
      VOLLEYBALL_NET_X - VOLLEYBALL_NET_WIDTH / 2,
    );
    expect(state.players[1].x - state.players[1].radius).toBeGreaterThanOrEqual(
      VOLLEYBALL_NET_X + VOLLEYBALL_NET_WIDTH / 2,
    );
  });

  it('does not advance while paused and reset clears an in-flight jump edge', () => {
    const state = createVolleyballState();
    state.phase = 'paused';
    state.pausedFrom = 'playing';
    state.players[0].y -= 100;
    state.players[0].velocityY = -200;
    state.players[0].onGround = false;
    state.previousJump = [true, true];
    const pausedY = state.players[0].y;

    updateVolleyball(state, { ...noInput, player1Jump: true, player2Jump: true }, 0.1);
    expect(state.players[0].y).toBe(pausedY);

    resetVolleyballState(state);
    expect(state.previousJump).toEqual([false, false]);
    expect(state.players.every((player) => player.onGround)).toBe(true);
  });
});
