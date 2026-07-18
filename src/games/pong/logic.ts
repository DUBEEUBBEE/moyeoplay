import type { GamePhase } from '../../core/game-controller';

export const PONG_WIDTH = 960;
export const PONG_HEIGHT = 540;
export const PONG_BALL_RADIUS = 12;
export const PONG_PADDLE_WIDTH = 18;
export const PONG_PADDLE_HEIGHT = 116;
export const PONG_BASE_SPEED = 390;
export const PONG_MAX_SPEED = 780;
export const PONG_MAX_BOUNCE_ANGLE = (62 * Math.PI) / 180;

const PADDLE_MARGIN = 42;
const PADDLE_MAX_SPEED = 470;
const PADDLE_ACCELERATION = 2_700;
const PADDLE_DECELERATION = 3_300;
const RALLY_SPEED_GAIN = 1.045;

export interface PongPaddle {
  x: number;
  y: number;
  velocityY: number;
  width: number;
  height: number;
}

export interface PongBall {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
}

export interface PongPoint {
  x: number;
  y: number;
}

export interface PongInput {
  readonly player1Axis: number;
  readonly player2Axis: number;
}

export interface PongState {
  phase: GamePhase;
  pausedFrom: Exclude<GamePhase, 'paused'>;
  targetScore: 5 | 7 | 11;
  scores: [number, number];
  paddles: [PongPaddle, PongPaddle];
  ball: PongBall;
  trail: PongPoint[];
  countdownRemaining: number;
  roundOverRemaining: number;
  countdownSerial: number;
  serveIndex: number;
  rallyHits: number;
  scoreLatched: boolean;
  flashPlayer: 0 | 1 | 2;
  flashRemaining: number;
  winner: 0 | 1 | 2;
}

export interface PongUpdateEvent {
  scoredBy?: 1 | 2;
  paddleHit?: 1 | 2;
  countdown?: 0 | 1 | 2 | 3;
  matchWinner?: 1 | 2;
}

function paddle(player: 1 | 2): PongPaddle {
  return {
    x: player === 1 ? PADDLE_MARGIN : PONG_WIDTH - PADDLE_MARGIN - PONG_PADDLE_WIDTH,
    y: (PONG_HEIGHT - PONG_PADDLE_HEIGHT) / 2,
    velocityY: 0,
    width: PONG_PADDLE_WIDTH,
    height: PONG_PADDLE_HEIGHT,
  };
}

function stoppedBall(): PongBall {
  return {
    x: PONG_WIDTH / 2,
    y: PONG_HEIGHT / 2,
    velocityX: 0,
    velocityY: 0,
    radius: PONG_BALL_RADIUS,
  };
}

export function createPongState(targetScore: 5 | 7 | 11 = 7): PongState {
  return {
    phase: 'idle',
    pausedFrom: 'idle',
    targetScore,
    scores: [0, 0],
    paddles: [paddle(1), paddle(2)],
    ball: stoppedBall(),
    trail: [],
    countdownRemaining: 0,
    roundOverRemaining: 0,
    countdownSerial: 0,
    serveIndex: 0,
    rallyHits: 0,
    scoreLatched: false,
    flashPlayer: 0,
    flashRemaining: 0,
    winner: 0,
  };
}

export function resetPongState(state: PongState, preserveMatchScore = false): void {
  if (!preserveMatchScore) state.scores = [0, 0];
  state.phase = 'idle';
  state.pausedFrom = 'idle';
  state.paddles = [paddle(1), paddle(2)];
  state.ball = stoppedBall();
  state.trail = [];
  state.countdownRemaining = 0;
  state.roundOverRemaining = 0;
  state.countdownSerial = 0;
  state.rallyHits = 0;
  state.scoreLatched = false;
  state.flashPlayer = 0;
  state.flashRemaining = 0;
  state.winner = 0;
  if (!preserveMatchScore) state.serveIndex = 0;
}

export function startPongMatch(state: PongState): void {
  state.scores = [0, 0];
  state.serveIndex = 0;
  state.winner = 0;
  prepareServe(state, 3.15);
}

export function prepareServe(state: PongState, countdownSeconds = 1.35): void {
  state.paddles = [paddle(1), paddle(2)];
  state.ball = stoppedBall();
  state.trail = [];
  state.rallyHits = 0;
  state.scoreLatched = false;
  state.countdownRemaining = Math.max(0, countdownSeconds);
  state.countdownSerial = Math.ceil(state.countdownRemaining);
  state.roundOverRemaining = 0;
  state.phase = 'countdown';
}

export function cappedRallySpeed(currentSpeed: number): number {
  return Math.min(Math.max(currentSpeed, PONG_BASE_SPEED) * RALLY_SPEED_GAIN, PONG_MAX_SPEED);
}

export function calculatePaddleBounce(
  hitPosition: number,
  paddleVelocity: number,
  outgoingDirection: -1 | 1,
  speed: number,
): { velocityX: number; velocityY: number; angle: number; speed: number } {
  const normalizedHit = Math.max(-1, Math.min(1, hitPosition));
  const motionInfluence = Math.max(-1, Math.min(1, paddleVelocity / PADDLE_MAX_SPEED)) * 0.2;
  const normalizedAngle = Math.max(-1, Math.min(1, normalizedHit + motionInfluence));
  const angle = normalizedAngle * PONG_MAX_BOUNCE_ANGLE;
  const safeSpeed = Math.min(Math.max(speed, PONG_BASE_SPEED), PONG_MAX_SPEED);
  return {
    velocityX: outgoingDirection * Math.cos(angle) * safeSpeed,
    velocityY: Math.sin(angle) * safeSpeed,
    angle,
    speed: safeSpeed,
  };
}

function launchServe(state: PongState): void {
  const direction: -1 | 1 = state.serveIndex % 2 === 0 ? 1 : -1;
  const angles = [-0.24, 0.18, 0.29, -0.16] as const;
  const angle = angles[Math.floor(state.serveIndex / 2) % angles.length] ?? 0;
  state.ball.velocityX = direction * Math.cos(angle) * PONG_BASE_SPEED;
  state.ball.velocityY = Math.sin(angle) * PONG_BASE_SPEED;
  state.serveIndex += 1;
  state.phase = 'playing';
  state.countdownRemaining = 0;
  state.countdownSerial = 0;
}

function approach(current: number, target: number, amount: number): number {
  if (current < target) return Math.min(current + amount, target);
  return Math.max(current - amount, target);
}

function updatePaddle(pongPaddle: PongPaddle, axis: number, seconds: number): void {
  const normalizedAxis = Math.max(-1, Math.min(1, axis));
  const targetVelocity = normalizedAxis * PADDLE_MAX_SPEED;
  const acceleration = normalizedAxis === 0 ? PADDLE_DECELERATION : PADDLE_ACCELERATION;
  pongPaddle.velocityY = approach(pongPaddle.velocityY, targetVelocity, acceleration * seconds);
  pongPaddle.y += pongPaddle.velocityY * seconds;
  const maxY = PONG_HEIGHT - pongPaddle.height;
  if (pongPaddle.y <= 0) {
    pongPaddle.y = 0;
    pongPaddle.velocityY = Math.max(0, pongPaddle.velocityY);
  } else if (pongPaddle.y >= maxY) {
    pongPaddle.y = maxY;
    pongPaddle.velocityY = Math.min(0, pongPaddle.velocityY);
  }
}

function currentBallSpeed(ball: PongBall): number {
  return Math.hypot(ball.velocityX, ball.velocityY);
}

function collidePaddle(
  state: PongState,
  pongPaddle: PongPaddle,
  player: 1 | 2,
  previousX: number,
  previousY: number,
  nextX: number,
  nextY: number,
): boolean {
  const movingToward = player === 1 ? state.ball.velocityX < 0 : state.ball.velocityX > 0;
  if (!movingToward) return false;

  const face =
    player === 1
      ? pongPaddle.x + pongPaddle.width + state.ball.radius
      : pongPaddle.x - state.ball.radius;
  const crossed =
    player === 1 ? previousX >= face && nextX <= face : previousX <= face && nextX >= face;
  if (!crossed) return false;

  const denominator = nextX - previousX;
  const time = denominator === 0 ? 0 : Math.max(0, Math.min(1, (face - previousX) / denominator));
  const impactY = previousY + (nextY - previousY) * time;
  const paddleTop = pongPaddle.y - state.ball.radius;
  const paddleBottom = pongPaddle.y + pongPaddle.height + state.ball.radius;
  if (impactY < paddleTop || impactY > paddleBottom) return false;

  const contact =
    (impactY - (pongPaddle.y + pongPaddle.height / 2)) /
    (pongPaddle.height / 2 + state.ball.radius);
  const speed = cappedRallySpeed(currentBallSpeed(state.ball));
  const bounce = calculatePaddleBounce(contact, pongPaddle.velocityY, player === 1 ? 1 : -1, speed);
  state.ball.x = face;
  state.ball.y = impactY;
  state.ball.velocityX = bounce.velocityX;
  state.ball.velocityY = bounce.velocityY;
  state.rallyHits += 1;
  return true;
}

export function scorePongPoint(state: PongState, player: 1 | 2): boolean {
  if (state.phase !== 'playing' || state.scoreLatched) return false;
  state.scoreLatched = true;
  if (player === 1) state.scores[0] += 1;
  else state.scores[1] += 1;
  state.flashPlayer = player;
  state.flashRemaining = 0.28;
  state.ball.velocityX = 0;
  state.ball.velocityY = 0;

  const playerScore = player === 1 ? state.scores[0] : state.scores[1];
  if (playerScore >= state.targetScore) {
    state.phase = 'matchOver';
    state.winner = player;
  } else {
    state.phase = 'roundOver';
    state.roundOverRemaining = 0.72;
  }
  return true;
}

function updatePlaying(state: PongState, input: PongInput, seconds: number): PongUpdateEvent {
  updatePaddle(state.paddles[0], input.player1Axis, seconds);
  updatePaddle(state.paddles[1], input.player2Axis, seconds);

  const event: PongUpdateEvent = {};
  const speed = Math.max(currentBallSpeed(state.ball), 1);
  const travel = speed * seconds;
  const subSteps = Math.max(1, Math.min(24, Math.ceil(travel / (state.ball.radius * 0.55))));
  const subStep = seconds / subSteps;

  for (let index = 0; index < subSteps && state.phase === 'playing'; index += 1) {
    const previousX = state.ball.x;
    const previousY = state.ball.y;
    let nextX = previousX + state.ball.velocityX * subStep;
    let nextY = previousY + state.ball.velocityY * subStep;

    if (nextY - state.ball.radius < 0 && state.ball.velocityY < 0) {
      nextY = state.ball.radius + (state.ball.radius - nextY);
      state.ball.velocityY = Math.abs(state.ball.velocityY);
    } else if (nextY + state.ball.radius > PONG_HEIGHT && state.ball.velocityY > 0) {
      nextY = PONG_HEIGHT - state.ball.radius - (nextY + state.ball.radius - PONG_HEIGHT);
      state.ball.velocityY = -Math.abs(state.ball.velocityY);
    }

    const hitLeft = collidePaddle(state, state.paddles[0], 1, previousX, previousY, nextX, nextY);
    const hitRight =
      !hitLeft && collidePaddle(state, state.paddles[1], 2, previousX, previousY, nextX, nextY);
    if (hitLeft || hitRight) {
      event.paddleHit = hitLeft ? 1 : 2;
      nextX = state.ball.x + state.ball.velocityX * subStep * (1 / subSteps);
      nextY = state.ball.y + state.ball.velocityY * subStep * (1 / subSteps);
    }

    state.ball.x = nextX;
    state.ball.y = nextY;

    if (state.ball.x + state.ball.radius < 0) {
      if (scorePongPoint(state, 2)) event.scoredBy = 2;
    } else if (state.ball.x - state.ball.radius > PONG_WIDTH) {
      if (scorePongPoint(state, 1)) event.scoredBy = 1;
    }
  }

  if (event.scoredBy && state.phase === 'matchOver') event.matchWinner = state.winner || undefined;
  if (state.phase === 'playing') {
    state.trail.unshift({ x: state.ball.x, y: state.ball.y });
    if (state.trail.length > 12) state.trail.length = 12;
  }
  return event;
}

export function updatePong(state: PongState, input: PongInput, seconds: number): PongUpdateEvent {
  if (!Number.isFinite(seconds) || seconds <= 0) return {};
  const safeSeconds = Math.min(seconds, 0.1);
  state.flashRemaining = Math.max(0, state.flashRemaining - safeSeconds);
  if (state.flashRemaining === 0) state.flashPlayer = 0;

  if (state.phase === 'countdown') {
    updatePaddle(state.paddles[0], input.player1Axis, safeSeconds);
    updatePaddle(state.paddles[1], input.player2Axis, safeSeconds);
    const previousNumber = Math.ceil(state.countdownRemaining);
    state.countdownRemaining = Math.max(0, state.countdownRemaining - safeSeconds);
    const nextNumber = Math.ceil(state.countdownRemaining);
    if (state.countdownRemaining === 0) {
      launchServe(state);
      return { countdown: 0 };
    }
    if (nextNumber !== previousNumber && nextNumber > 0 && nextNumber <= 3) {
      state.countdownSerial = nextNumber;
      return { countdown: nextNumber as 1 | 2 | 3 };
    }
    return {};
  }

  if (state.phase === 'roundOver') {
    state.roundOverRemaining = Math.max(0, state.roundOverRemaining - safeSeconds);
    if (state.roundOverRemaining === 0) prepareServe(state);
    return {};
  }

  if (state.phase !== 'playing') return {};
  return updatePlaying(state, input, safeSeconds);
}
