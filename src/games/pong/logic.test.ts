import { describe, expect, it } from 'vitest';
import {
  PONG_HEIGHT,
  PONG_MAX_BOUNCE_ANGLE,
  PONG_MAX_SPEED,
  PONG_WIDTH,
  calculatePaddleBounce,
  cappedRallySpeed,
  createPongState,
  scorePongPoint,
  updatePong,
} from './logic';

describe('pong logic', () => {
  const noInput = { player1Axis: 0, player2Axis: 0 } as const;

  function makeFullHeightPaddles(): ReturnType<typeof createPongState> {
    const state = createPongState(11);
    state.phase = 'playing';
    for (const paddle of state.paddles) {
      paddle.y = 0;
      paddle.height = PONG_HEIGHT;
      paddle.velocityY = 0;
    }
    return state;
  }

  function simulateTrajectory(delta: number): ReturnType<typeof createPongState> {
    const state = makeFullHeightPaddles();
    state.ball.x = PONG_WIDTH / 2;
    state.ball.y = 100;
    state.ball.velocityX = 700;
    state.ball.velocityY = 300;
    const duration = 1.2;
    for (let elapsed = 0; elapsed < duration - 1e-9; elapsed += delta) {
      updatePong(state, noInput, Math.min(delta, duration - elapsed));
    }
    return state;
  }

  it('latches a point so it is scored only once', () => {
    const state = createPongState(7);
    state.phase = 'playing';
    state.ball.x = -30;
    state.ball.velocityX = -500;

    updatePong(state, noInput, 1 / 60);
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

  it('preserves an equivalent trajectory across supported update deltas', () => {
    const baseline = simulateTrajectory(1 / 120);
    for (const delta of [1 / 60, 1 / 30, 0.1]) {
      const candidate = simulateTrajectory(delta);
      expect(candidate.ball.x).toBeCloseTo(baseline.ball.x, 5);
      expect(candidate.ball.y).toBeCloseTo(baseline.ball.y, 5);
      expect(candidate.ball.velocityX).toBeCloseTo(baseline.ball.velocityX, 5);
      expect(candidate.ball.velocityY).toBeCloseTo(baseline.ball.velocityY, 5);
      expect(candidate.rallyHits).toBe(baseline.rallyHits);
    }
  });

  it.each([
    ['center', 0],
    ['end', 0.95],
    ['corner', 0.995],
  ])('does not tunnel through a paddle at maximum speed near its %s', (_label, normalizedHit) => {
    const state = createPongState();
    state.phase = 'playing';
    const paddle = state.paddles[1];
    const face = paddle.x - state.ball.radius;
    const halfContactHeight = paddle.height / 2 + state.ball.radius;
    state.ball.x = face - 24;
    state.ball.y = paddle.y + paddle.height / 2 + normalizedHit * halfContactHeight;
    state.ball.velocityX = PONG_MAX_SPEED;
    state.ball.velocityY = 0;

    const event = updatePong(state, noInput, 0.1);

    expect(event.paddleHit).toBe(2);
    expect(state.ball.velocityX).toBeLessThan(0);
    expect(state.ball.x).toBeLessThan(face);
    expect(Number.isFinite(state.ball.x)).toBe(true);
    expect(Number.isFinite(state.ball.y)).toBe(true);
  });

  it('ejects a ball that starts embedded in a paddle and sends it toward the opponent', () => {
    const state = createPongState();
    state.phase = 'playing';
    const paddle = state.paddles[1];
    const face = paddle.x - state.ball.radius;
    state.ball.x = paddle.x;
    state.ball.y = paddle.y + paddle.height / 2;
    state.ball.velocityX = PONG_MAX_SPEED;
    state.ball.velocityY = 0;

    updatePong(state, noInput, 1 / 120);

    expect(state.ball.velocityX).toBeLessThan(0);
    expect(state.ball.x).toBeLessThan(face);
  });

  it('keeps a long maximum-speed rally finite and under the speed cap', () => {
    const state = makeFullHeightPaddles();
    state.ball.x = PONG_WIDTH / 2;
    state.ball.y = PONG_HEIGHT / 2;
    state.ball.velocityX = PONG_MAX_SPEED;
    state.ball.velocityY = 0;

    for (let step = 0; step < 2_400; step += 1) updatePong(state, noInput, 1 / 120);

    expect(state.phase).toBe('playing');
    expect(state.rallyHits).toBeGreaterThan(10);
    expect(Number.isFinite(state.ball.x)).toBe(true);
    expect(Number.isFinite(state.ball.y)).toBe(true);
    expect(Number.isFinite(state.ball.velocityX)).toBe(true);
    expect(Number.isFinite(state.ball.velocityY)).toBe(true);
    expect(Math.hypot(state.ball.velocityX, state.ball.velocityY)).toBeLessThanOrEqual(
      PONG_MAX_SPEED + 1e-9,
    );
  });
});
