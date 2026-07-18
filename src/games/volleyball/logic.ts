import type { GamePhase } from '../../core/game-controller';

export const VOLLEYBALL_WIDTH = 960;
export const VOLLEYBALL_HEIGHT = 540;
export const VOLLEYBALL_FLOOR_Y = 478;
export const VOLLEYBALL_NET_X = VOLLEYBALL_WIDTH / 2;
export const VOLLEYBALL_NET_WIDTH = 18;
export const VOLLEYBALL_NET_TOP = 258;
export const VOLLEYBALL_PLAYER_RADIUS = 38;
export const VOLLEYBALL_BALL_RADIUS = 20;

const PLAYER_ACCELERATION = 1_900;
const PLAYER_DECELERATION = 2_500;
const PLAYER_MAX_SPEED = 330;
const PLAYER_JUMP_SPEED = 665;
const PLAYER_GRAVITY = 1_650;
const BALL_GRAVITY = 980;
const BALL_MAX_SPEED = 1_150;
// Alternating player/net projections converge at their shared rounded corner.
// Keep enough bounded passes to clear the final sub-pixel overlap there.
const MAX_COLLISION_PASSES = 12;

export interface VolleyballPlayer {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  onGround: boolean;
}

export interface VolleyballBall {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  spin: number;
  rotation: number;
}

export interface VolleyballPoint {
  x: number;
  y: number;
}

export interface VolleyballInput {
  readonly player1Axis: number;
  readonly player1Jump: boolean;
  readonly player2Axis: number;
  readonly player2Jump: boolean;
}

export interface VolleyballState {
  phase: GamePhase;
  pausedFrom: Exclude<GamePhase, 'paused'>;
  targetScore: 5 | 7 | 11;
  scores: [number, number];
  players: [VolleyballPlayer, VolleyballPlayer];
  ball: VolleyballBall;
  trail: VolleyballPoint[];
  previousJump: [boolean, boolean];
  serveIndex: number;
  countdownRemaining: number;
  roundOverRemaining: number;
  floorLatched: boolean;
  winner: 0 | 1 | 2;
  impactFlash: number;
}

export interface VolleyballUpdateEvent {
  scoredBy?: 1 | 2;
  playerHit?: 1 | 2;
  netHit?: boolean;
  countdown?: 0 | 1 | 2 | 3;
  matchWinner?: 1 | 2;
}

function player(playerNumber: 1 | 2): VolleyballPlayer {
  return {
    x: playerNumber === 1 ? 220 : VOLLEYBALL_WIDTH - 220,
    y: VOLLEYBALL_FLOOR_Y - VOLLEYBALL_PLAYER_RADIUS,
    velocityX: 0,
    velocityY: 0,
    radius: VOLLEYBALL_PLAYER_RADIUS,
    onGround: true,
  };
}

function waitingBall(serveIndex: number): VolleyballBall {
  const onLeft = serveIndex % 2 === 0;
  return {
    x: onLeft ? 330 : VOLLEYBALL_WIDTH - 330,
    y: 142,
    velocityX: 0,
    velocityY: 0,
    radius: VOLLEYBALL_BALL_RADIUS,
    spin: 0,
    rotation: 0,
  };
}

export function createVolleyballState(targetScore: 5 | 7 | 11 = 7): VolleyballState {
  return {
    phase: 'idle',
    pausedFrom: 'idle',
    targetScore,
    scores: [0, 0],
    players: [player(1), player(2)],
    ball: waitingBall(0),
    trail: [],
    previousJump: [false, false],
    serveIndex: 0,
    countdownRemaining: 0,
    roundOverRemaining: 0,
    floorLatched: false,
    winner: 0,
    impactFlash: 0,
  };
}

export function resetVolleyballState(state: VolleyballState, preserveMatchScore = false): void {
  if (!preserveMatchScore) state.scores = [0, 0];
  state.phase = 'idle';
  state.pausedFrom = 'idle';
  state.players = [player(1), player(2)];
  state.ball = waitingBall(state.serveIndex);
  state.trail = [];
  state.previousJump = [false, false];
  state.countdownRemaining = 0;
  state.roundOverRemaining = 0;
  state.floorLatched = false;
  state.winner = 0;
  state.impactFlash = 0;
  if (!preserveMatchScore) state.serveIndex = 0;
}

export function prepareVolleyballServe(state: VolleyballState, countdownSeconds = 1.55): void {
  state.players = [player(1), player(2)];
  state.ball = waitingBall(state.serveIndex);
  state.trail = [];
  state.previousJump = [false, false];
  state.countdownRemaining = countdownSeconds;
  state.roundOverRemaining = 0;
  state.floorLatched = false;
  state.impactFlash = 0;
  state.phase = 'countdown';
}

export function startVolleyballMatch(state: VolleyballState): void {
  state.scores = [0, 0];
  state.serveIndex = 0;
  state.winner = 0;
  prepareVolleyballServe(state, 3.15);
}

function launchServe(state: VolleyballState): void {
  const towardRight = state.serveIndex % 2 === 0;
  state.ball.velocityX = towardRight ? 125 : -125;
  state.ball.velocityY = -75;
  state.serveIndex += 1;
  state.countdownRemaining = 0;
  state.phase = 'playing';
}

function approach(current: number, target: number, amount: number): number {
  if (current < target) return Math.min(current + amount, target);
  return Math.max(current - amount, target);
}

function updatePlayer(
  gamePlayer: VolleyballPlayer,
  playerNumber: 1 | 2,
  axis: number,
  jump: boolean,
  jumpWasHeld: boolean,
  seconds: number,
): void {
  const normalizedAxis = Math.max(-1, Math.min(1, axis));
  const target = normalizedAxis * PLAYER_MAX_SPEED;
  gamePlayer.velocityX = approach(
    gamePlayer.velocityX,
    target,
    (normalizedAxis === 0 ? PLAYER_DECELERATION : PLAYER_ACCELERATION) * seconds,
  );
  if (jump && !jumpWasHeld && gamePlayer.onGround) {
    gamePlayer.velocityY = -PLAYER_JUMP_SPEED;
    gamePlayer.onGround = false;
  }
  gamePlayer.velocityY += PLAYER_GRAVITY * seconds;
  gamePlayer.x += gamePlayer.velocityX * seconds;
  gamePlayer.y += gamePlayer.velocityY * seconds;

  const netHalf = VOLLEYBALL_NET_WIDTH / 2;
  const minimumX =
    playerNumber === 1 ? gamePlayer.radius : VOLLEYBALL_NET_X + netHalf + gamePlayer.radius;
  const maximumX =
    playerNumber === 1
      ? VOLLEYBALL_NET_X - netHalf - gamePlayer.radius
      : VOLLEYBALL_WIDTH - gamePlayer.radius;
  if (gamePlayer.x < minimumX) {
    gamePlayer.x = minimumX;
    gamePlayer.velocityX = Math.max(0, gamePlayer.velocityX);
  } else if (gamePlayer.x > maximumX) {
    gamePlayer.x = maximumX;
    gamePlayer.velocityX = Math.min(0, gamePlayer.velocityX);
  }

  const floorCenter = VOLLEYBALL_FLOOR_Y - gamePlayer.radius;
  if (gamePlayer.y >= floorCenter) {
    gamePlayer.y = floorCenter;
    gamePlayer.velocityY = 0;
    gamePlayer.onGround = true;
  } else {
    gamePlayer.onGround = false;
  }
}

function clampBallSpeed(ball: VolleyballBall): void {
  const speed = Math.hypot(ball.velocityX, ball.velocityY);
  if (speed <= BALL_MAX_SPEED) return;
  const scale = BALL_MAX_SPEED / speed;
  ball.velocityX *= scale;
  ball.velocityY *= scale;
}

export function resolveBallPlayerCollision(
  ball: VolleyballBall,
  gamePlayer: VolleyballPlayer,
): boolean {
  const deltaX = ball.x - gamePlayer.x;
  const deltaY = ball.y - gamePlayer.y;
  const distance = Math.hypot(deltaX, deltaY);
  const minimumDistance = ball.radius + gamePlayer.radius;
  if (distance >= minimumDistance) return false;
  const normalX = distance < 0.0001 ? 0 : deltaX / distance;
  const normalY = distance < 0.0001 ? -1 : deltaY / distance;
  const penetration = minimumDistance - distance;
  ball.x += normalX * (penetration + 0.05);
  ball.y += normalY * (penetration + 0.05);

  const relativeX = ball.velocityX - gamePlayer.velocityX;
  const relativeY = ball.velocityY - gamePlayer.velocityY;
  const normalVelocity = relativeX * normalX + relativeY * normalY;
  if (normalVelocity < 0) {
    const impulse = -(1 + 0.86) * normalVelocity;
    ball.velocityX += impulse * normalX + gamePlayer.velocityX * 0.08;
    ball.velocityY += impulse * normalY + gamePlayer.velocityY * 0.05;
  }
  const tangentVelocity = -relativeX * normalY + relativeY * normalX;
  ball.spin += tangentVelocity * 0.012;
  clampBallSpeed(ball);
  return true;
}

export function resolveBallNetCollision(ball: VolleyballBall): boolean {
  const left = VOLLEYBALL_NET_X - VOLLEYBALL_NET_WIDTH / 2;
  const right = VOLLEYBALL_NET_X + VOLLEYBALL_NET_WIDTH / 2;
  const top = VOLLEYBALL_NET_TOP;
  const bottom = VOLLEYBALL_FLOOR_Y;
  const closestX = Math.max(left, Math.min(right, ball.x));
  const closestY = Math.max(top, Math.min(bottom, ball.y));
  let deltaX = ball.x - closestX;
  let deltaY = ball.y - closestY;
  let distance = Math.hypot(deltaX, deltaY);
  if (distance >= ball.radius) return false;

  if (distance < 0.0001) {
    const distances = [
      {
        distance: Math.abs(ball.x - left),
        x: -1,
        y: 0,
        targetX: left - ball.radius,
        targetY: ball.y,
      },
      {
        distance: Math.abs(right - ball.x),
        x: 1,
        y: 0,
        targetX: right + ball.radius,
        targetY: ball.y,
      },
      {
        distance: Math.abs(ball.y - top),
        x: 0,
        y: -1,
        targetX: ball.x,
        targetY: top - ball.radius,
      },
    ];
    distances.sort((first, second) => first.distance - second.distance);
    const normal = distances[0] ?? {
      x: 0,
      y: -1,
      targetX: ball.x,
      targetY: top - ball.radius,
    };
    deltaX = normal.x;
    deltaY = normal.y;
    distance = 1;
    ball.x = normal.targetX;
    ball.y = normal.targetY;
  } else {
    const normalX = deltaX / distance;
    const normalY = deltaY / distance;
    ball.x += normalX * (ball.radius - distance + 0.05);
    ball.y += normalY * (ball.radius - distance + 0.05);
  }
  const normalX = deltaX / distance;
  const normalY = deltaY / distance;
  const normalVelocity = ball.velocityX * normalX + ball.velocityY * normalY;
  if (normalVelocity < 0) {
    ball.velocityX -= (1 + 0.78) * normalVelocity * normalX;
    ball.velocityY -= (1 + 0.78) * normalVelocity * normalY;
  }
  ball.spin *= 0.88;
  clampBallSpeed(ball);
  return true;
}

export function scoreVolleyballPoint(state: VolleyballState, playerNumber: 1 | 2): boolean {
  if (state.phase !== 'playing' || state.floorLatched) return false;
  state.floorLatched = true;
  if (playerNumber === 1) state.scores[0] += 1;
  else state.scores[1] += 1;
  state.ball.velocityX = 0;
  state.ball.velocityY = 0;
  const playerScore = playerNumber === 1 ? state.scores[0] : state.scores[1];
  if (playerScore >= state.targetScore) {
    state.winner = playerNumber;
    state.phase = 'matchOver';
  } else {
    state.roundOverRemaining = 0.85;
    state.phase = 'roundOver';
  }
  return true;
}

function updateBall(state: VolleyballState, seconds: number): VolleyballUpdateEvent {
  const event: VolleyballUpdateEvent = {};
  const estimatedSpeed =
    Math.hypot(state.ball.velocityX, state.ball.velocityY) + BALL_GRAVITY * seconds;
  const subSteps = Math.max(1, Math.min(20, Math.ceil((estimatedSpeed * seconds) / 7)));
  const subStep = seconds / subSteps;

  for (let index = 0; index < subSteps && state.phase === 'playing'; index += 1) {
    const ball = state.ball;
    ball.velocityY = Math.min(ball.velocityY + BALL_GRAVITY * subStep, BALL_MAX_SPEED);
    ball.velocityX += ball.spin * 0.018 * subStep;
    ball.spin *= Math.pow(0.995, subStep * 120);
    ball.rotation += ball.spin * subStep;
    ball.x += ball.velocityX * subStep;
    ball.y += ball.velocityY * subStep;

    if (ball.x - ball.radius < 0) {
      ball.x = ball.radius;
      ball.velocityX = Math.abs(ball.velocityX) * 0.84;
      ball.spin *= -0.75;
    } else if (ball.x + ball.radius > VOLLEYBALL_WIDTH) {
      ball.x = VOLLEYBALL_WIDTH - ball.radius;
      ball.velocityX = -Math.abs(ball.velocityX) * 0.84;
      ball.spin *= -0.75;
    }
    if (ball.y - ball.radius < 0) {
      ball.y = ball.radius;
      ball.velocityY = Math.abs(ball.velocityY) * 0.82;
    }

    for (let pass = 0; pass < MAX_COLLISION_PASSES; pass += 1) {
      let collided = false;
      if (resolveBallNetCollision(ball)) {
        event.netHit = true;
        collided = true;
      }
      if (resolveBallPlayerCollision(ball, state.players[0])) {
        event.playerHit = 1;
        collided = true;
      }
      if (resolveBallPlayerCollision(ball, state.players[1])) {
        event.playerHit = 2;
        collided = true;
      }
      clampBallSpeed(ball);
      if (!collided) break;
    }

    if (ball.y + ball.radius >= VOLLEYBALL_FLOOR_Y) {
      ball.y = VOLLEYBALL_FLOOR_Y - ball.radius;
      const scorer: 1 | 2 = ball.x < VOLLEYBALL_NET_X ? 2 : 1;
      if (scoreVolleyballPoint(state, scorer)) {
        event.scoredBy = scorer;
        if (state.winner === scorer) event.matchWinner = scorer;
      }
    }
  }

  if (event.playerHit || event.netHit) state.impactFlash = 0.14;
  if (state.phase === 'playing') {
    state.trail.unshift({ x: state.ball.x, y: state.ball.y });
    if (state.trail.length > 10) state.trail.length = 10;
  }
  return event;
}

export function updateVolleyball(
  state: VolleyballState,
  input: VolleyballInput,
  seconds: number,
): VolleyballUpdateEvent {
  if (!Number.isFinite(seconds) || seconds <= 0) return {};
  const safeSeconds = Math.min(seconds, 0.1);
  state.impactFlash = Math.max(0, state.impactFlash - safeSeconds);

  if (state.phase === 'countdown' || state.phase === 'playing') {
    updatePlayer(
      state.players[0],
      1,
      input.player1Axis,
      input.player1Jump,
      state.previousJump[0],
      safeSeconds,
    );
    updatePlayer(
      state.players[1],
      2,
      input.player2Axis,
      input.player2Jump,
      state.previousJump[1],
      safeSeconds,
    );
    state.previousJump = [input.player1Jump, input.player2Jump];
  }

  if (state.phase === 'countdown') {
    const previous = Math.ceil(state.countdownRemaining);
    state.countdownRemaining = Math.max(0, state.countdownRemaining - safeSeconds);
    const next = Math.ceil(state.countdownRemaining);
    if (state.countdownRemaining === 0) {
      launchServe(state);
      return { countdown: 0 };
    }
    if (next !== previous && next > 0 && next <= 3) return { countdown: next as 1 | 2 | 3 };
    return {};
  }

  if (state.phase === 'roundOver') {
    state.roundOverRemaining = Math.max(0, state.roundOverRemaining - safeSeconds);
    if (state.roundOverRemaining === 0) prepareVolleyballServe(state);
    return {};
  }

  if (state.phase !== 'playing') return {};
  return updateBall(state, safeSeconds);
}
