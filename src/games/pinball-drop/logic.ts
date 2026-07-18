import type { GamePhase } from '../../core/game-controller';
import { createSeededRandom, hashSeed } from '../../core/seeded-random';

export const PINBALL_WIDTH = 960;
export const PINBALL_HEIGHT = 600;
export const PINBALL_FLOOR_Y = 560;
export const PINBALL_BALL_RADIUS = 14;
export const PINBALL_LEFT_WALL = 38;
export const PINBALL_LEFT_INNER_WALL = 452;
export const PINBALL_RIGHT_INNER_WALL = PINBALL_WIDTH - PINBALL_LEFT_INNER_WALL;
export const PINBALL_RIGHT_WALL = PINBALL_WIDTH - PINBALL_LEFT_WALL;
export const PINBALL_TIE_TOLERANCE = 0.05;
export const PINBALL_BOOSTS_PER_ROUND = 3;
export const PINBALL_BOOST_COOLDOWN = 0.36;

const BALL_GRAVITY = 270;
const MAX_BALL_SPEED = 760;
const ROUND_RESULT_DELAY = 1.8;

export interface PinballPeg {
  x: number;
  y: number;
  radius: number;
  restitution: number;
}

export interface MirroredPegs {
  left: PinballPeg[];
  right: PinballPeg[];
}

export interface PinballPoint {
  x: number;
  y: number;
}

export interface PinballBall {
  player: 1 | 2;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  radius: number;
  boostsRemaining: number;
  boostCooldown: number;
  landedAt: number | null;
  stuckSeconds: number;
  trail: PinballPoint[];
}

export interface PinballRoundResult {
  winner: 0 | 1 | 2;
  times: [number, number];
  difference: number;
}

export interface PinballState {
  phase: GamePhase;
  pausedFrom: Exclude<GamePhase, 'paused'>;
  baseSeed: number;
  roundSeed: number;
  roundNumber: number;
  roundWins: [number, number];
  pegs: MirroredPegs;
  balls: [PinballBall, PinballBall];
  countdownRemaining: number;
  elapsed: number;
  roundOverRemaining: number;
  lastResult: PinballRoundResult | null;
  winner: 0 | 1 | 2;
}

export interface PinballUpdateEvent {
  countdown?: 0 | 1 | 2 | 3;
  pegHit?: 1 | 2;
  landed?: 1 | 2;
  roundResult?: PinballRoundResult;
  matchWinner?: 1 | 2;
}

export function generateMirroredPegs(seed: string | number): MirroredPegs {
  const random = createSeededRandom(seed);
  const left: PinballPeg[] = [];
  const columns = 4;
  const rows = 7;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const stagger = row % 2 === 0 ? 0 : 14;
      const baseX = 98 + column * 91 + stagger;
      const jitterX = (random() - 0.5) * 25;
      const jitterY = (random() - 0.5) * 12;
      left.push({
        x: Math.max(
          PINBALL_LEFT_WALL + 24,
          Math.min(PINBALL_LEFT_INNER_WALL - 24, baseX + jitterX),
        ),
        y: 142 + row * 53 + jitterY,
        radius: 10 + random() * 5,
        restitution: 0.72 + random() * 0.12,
      });
    }
  }
  return {
    left,
    right: left.map((peg) => ({
      x: PINBALL_WIDTH - peg.x,
      y: peg.y,
      radius: peg.radius,
      restitution: peg.restitution,
    })),
  };
}

function ball(player: 1 | 2): PinballBall {
  return {
    player,
    x: player === 1 ? 242 : PINBALL_WIDTH - 242,
    y: 68,
    velocityX: 0,
    velocityY: 0,
    radius: PINBALL_BALL_RADIUS,
    boostsRemaining: PINBALL_BOOSTS_PER_ROUND,
    boostCooldown: 0,
    landedAt: null,
    stuckSeconds: 0,
    trail: [],
  };
}

function roundSeed(baseSeed: number, roundNumber: number): number {
  return (baseSeed + Math.imul(roundNumber, 0x9e3779b1)) >>> 0;
}

export function createPinballState(seed: string | number = 20_260_718): PinballState {
  const baseSeed = hashSeed(seed);
  const firstSeed = roundSeed(baseSeed, 1);
  return {
    phase: 'idle',
    pausedFrom: 'idle',
    baseSeed,
    roundSeed: firstSeed,
    roundNumber: 1,
    roundWins: [0, 0],
    pegs: generateMirroredPegs(firstSeed),
    balls: [ball(1), ball(2)],
    countdownRemaining: 0,
    elapsed: 0,
    roundOverRemaining: 0,
    lastResult: null,
    winner: 0,
  };
}

export function resetPinballState(state: PinballState, preserveMatchScore = false): void {
  if (!preserveMatchScore) {
    state.roundWins = [0, 0];
    state.roundNumber = 1;
  }
  state.roundSeed = roundSeed(state.baseSeed, state.roundNumber);
  state.pegs = generateMirroredPegs(state.roundSeed);
  state.balls = [ball(1), ball(2)];
  state.countdownRemaining = 0;
  state.elapsed = 0;
  state.roundOverRemaining = 0;
  state.lastResult = null;
  state.winner = 0;
  state.phase = 'idle';
  state.pausedFrom = 'idle';
}

export function preparePinballRound(state: PinballState, countdownSeconds = 3.15): void {
  state.roundSeed = roundSeed(state.baseSeed, state.roundNumber);
  state.pegs = generateMirroredPegs(state.roundSeed);
  state.balls = [ball(1), ball(2)];
  state.countdownRemaining = countdownSeconds;
  state.elapsed = 0;
  state.roundOverRemaining = 0;
  state.lastResult = null;
  state.phase = 'countdown';
}

export function startPinballMatch(state: PinballState): void {
  state.roundWins = [0, 0];
  state.roundNumber = 1;
  state.winner = 0;
  preparePinballRound(state);
}

function launchBalls(state: PinballState): void {
  state.balls[0].velocityX = 24;
  state.balls[1].velocityX = -24;
  state.balls[0].velocityY = 28;
  state.balls[1].velocityY = 28;
  state.countdownRemaining = 0;
  state.phase = 'playing';
}

export function recordPinballLanding(ballToLand: PinballBall, landingTime: number): boolean {
  if (ballToLand.landedAt !== null || !Number.isFinite(landingTime) || landingTime < 0)
    return false;
  ballToLand.landedAt = landingTime;
  ballToLand.velocityX = 0;
  ballToLand.velocityY = 0;
  return true;
}

export function judgePinballRound(
  player1Time: number,
  player2Time: number,
  tolerance = PINBALL_TIE_TOLERANCE,
): 0 | 1 | 2 {
  if (Math.abs(player1Time - player2Time) <= tolerance) return 0;
  return player1Time > player2Time ? 1 : 2;
}

export function isPinballTie(
  player1Time: number,
  player2Time: number,
  tolerance = PINBALL_TIE_TOLERANCE,
): boolean {
  return judgePinballRound(player1Time, player2Time, tolerance) === 0;
}

export function applyPinballBoost(state: PinballState, player: 1 | 2): boolean {
  if (state.phase !== 'playing') return false;
  const boostedBall = player === 1 ? state.balls[0] : state.balls[1];
  if (
    boostedBall.landedAt !== null ||
    boostedBall.boostsRemaining <= 0 ||
    boostedBall.boostCooldown > 0
  ) {
    return false;
  }
  const boostIndex = PINBALL_BOOSTS_PER_ROUND - boostedBall.boostsRemaining;
  const lateralPattern = [76, -62, 44] as const;
  const lateral = lateralPattern[boostIndex] ?? 0;
  boostedBall.velocityY = Math.max(-330, boostedBall.velocityY - 245);
  boostedBall.velocityX += player === 1 ? lateral : -lateral;
  boostedBall.boostsRemaining -= 1;
  boostedBall.boostCooldown = PINBALL_BOOST_COOLDOWN;
  boostedBall.stuckSeconds = 0;
  return true;
}

export const tryUsePinballBoost = applyPinballBoost;

function clampSpeed(gameBall: PinballBall): void {
  const speed = Math.hypot(gameBall.velocityX, gameBall.velocityY);
  if (speed <= MAX_BALL_SPEED) return;
  const scale = MAX_BALL_SPEED / speed;
  gameBall.velocityX *= scale;
  gameBall.velocityY *= scale;
}

export function resolvePinballPegCollision(gameBall: PinballBall, peg: PinballPeg): boolean {
  let deltaX = gameBall.x - peg.x;
  let deltaY = gameBall.y - peg.y;
  let distance = Math.hypot(deltaX, deltaY);
  const minimumDistance = gameBall.radius + peg.radius;
  if (distance >= minimumDistance) return false;
  if (distance < 0.0001) {
    deltaX = 0;
    deltaY = -1;
    distance = 1;
  }
  const normalX = deltaX / distance;
  const normalY = deltaY / distance;
  const penetration = minimumDistance - distance;
  gameBall.x += normalX * (penetration + 0.04);
  gameBall.y += normalY * (penetration + 0.04);
  const normalVelocity = gameBall.velocityX * normalX + gameBall.velocityY * normalY;
  if (normalVelocity < 0) {
    gameBall.velocityX -= (1 + peg.restitution) * normalVelocity * normalX;
    gameBall.velocityY -= (1 + peg.restitution) * normalVelocity * normalY;
  }
  const tangentX = -normalY;
  const tangentY = normalX;
  const tangentVelocity = gameBall.velocityX * tangentX + gameBall.velocityY * tangentY;
  gameBall.velocityX -= tangentVelocity * tangentX * 0.025;
  gameBall.velocityY -= tangentVelocity * tangentY * 0.025;
  clampSpeed(gameBall);
  return true;
}

function collideWalls(gameBall: PinballBall): void {
  const minimumX =
    gameBall.player === 1
      ? PINBALL_LEFT_WALL + gameBall.radius
      : PINBALL_RIGHT_INNER_WALL + gameBall.radius;
  const maximumX =
    gameBall.player === 1
      ? PINBALL_LEFT_INNER_WALL - gameBall.radius
      : PINBALL_RIGHT_WALL - gameBall.radius;
  if (gameBall.x < minimumX) {
    gameBall.x = minimumX;
    gameBall.velocityX = Math.abs(gameBall.velocityX) * 0.8;
  } else if (gameBall.x > maximumX) {
    gameBall.x = maximumX;
    gameBall.velocityX = -Math.abs(gameBall.velocityX) * 0.8;
  }
  if (gameBall.y - gameBall.radius < 20) {
    gameBall.y = 20 + gameBall.radius;
    gameBall.velocityY = Math.abs(gameBall.velocityY) * 0.75;
  }
}

function integrateBall(
  gameBall: PinballBall,
  pegs: readonly PinballPeg[],
  seconds: number,
  elapsedAtStart: number,
): { pegHit: boolean; landed: boolean } {
  if (gameBall.landedAt !== null) return { pegHit: false, landed: false };
  const previousBottom = gameBall.y + gameBall.radius;
  gameBall.boostCooldown = Math.max(0, gameBall.boostCooldown - seconds);
  gameBall.velocityY += BALL_GRAVITY * seconds;
  const airDamping = Math.pow(0.999, seconds * 120);
  gameBall.velocityX *= airDamping;
  gameBall.x += gameBall.velocityX * seconds;
  gameBall.y += gameBall.velocityY * seconds;
  collideWalls(gameBall);

  let pegHit = false;
  for (const peg of pegs) {
    if (resolvePinballPegCollision(gameBall, peg)) pegHit = true;
  }
  clampSpeed(gameBall);

  const currentBottom = gameBall.y + gameBall.radius;
  if (currentBottom >= PINBALL_FLOOR_Y) {
    const distance = currentBottom - previousBottom;
    const crossing =
      previousBottom >= PINBALL_FLOOR_Y || distance <= 0
        ? 0
        : Math.max(0, Math.min(1, (PINBALL_FLOOR_Y - previousBottom) / distance));
    const landed = recordPinballLanding(gameBall, elapsedAtStart + seconds * crossing);
    gameBall.y = PINBALL_FLOOR_Y - gameBall.radius;
    return { pegHit, landed };
  }
  return { pegHit, landed: false };
}

function recoverIfStuck(gameBall: PinballBall, seconds: number): void {
  if (gameBall.landedAt !== null) return;
  const speed = Math.hypot(gameBall.velocityX, gameBall.velocityY);
  if (gameBall.y > 100 && speed < 24) gameBall.stuckSeconds += seconds;
  else gameBall.stuckSeconds = 0;
  if (gameBall.stuckSeconds < 1.05) return;
  gameBall.velocityX = gameBall.player === 1 ? 48 : -48;
  gameBall.velocityY = 112;
  gameBall.y += 2;
  gameBall.stuckSeconds = 0;
}

function finishRound(state: PinballState): PinballRoundResult | null {
  const firstTime = state.balls[0].landedAt;
  const secondTime = state.balls[1].landedAt;
  if (firstTime === null || secondTime === null) return null;
  const winner = judgePinballRound(firstTime, secondTime);
  const result: PinballRoundResult = {
    winner,
    times: [firstTime, secondTime],
    difference: Math.abs(firstTime - secondTime),
  };
  state.lastResult = result;
  if (winner === 1) state.roundWins[0] += 1;
  else if (winner === 2) state.roundWins[1] += 1;
  const winnerScore = winner === 1 ? state.roundWins[0] : winner === 2 ? state.roundWins[1] : 0;
  if (winner !== 0 && winnerScore >= 2) {
    state.winner = winner;
    state.phase = 'matchOver';
  } else {
    state.phase = 'roundOver';
    state.roundOverRemaining = ROUND_RESULT_DELAY;
  }
  return result;
}

function updatePlaying(state: PinballState, seconds: number): PinballUpdateEvent {
  const event: PinballUpdateEvent = {};
  const maximumSpeed = Math.max(
    Math.hypot(state.balls[0].velocityX, state.balls[0].velocityY),
    Math.hypot(state.balls[1].velocityX, state.balls[1].velocityY),
    1,
  );
  const subSteps = Math.max(1, Math.min(24, Math.ceil((maximumSpeed * seconds) / 6)));
  const subStep = seconds / subSteps;

  for (let index = 0; index < subSteps && state.phase === 'playing'; index += 1) {
    const elapsedAtStart = state.elapsed;
    const left = integrateBall(state.balls[0], state.pegs.left, subStep, elapsedAtStart);
    const right = integrateBall(state.balls[1], state.pegs.right, subStep, elapsedAtStart);
    if (left.pegHit) event.pegHit = 1;
    if (right.pegHit) event.pegHit = 2;
    if (left.landed) event.landed = 1;
    if (right.landed) event.landed = 2;
    state.elapsed += subStep;
    if (state.balls[0].landedAt !== null && state.balls[1].landedAt !== null) {
      const result = finishRound(state);
      if (result) {
        event.roundResult = result;
        if (state.winner !== 0) event.matchWinner = state.winner;
      }
    }
  }

  recoverIfStuck(state.balls[0], seconds);
  recoverIfStuck(state.balls[1], seconds);
  for (const gameBall of state.balls) {
    if (gameBall.landedAt !== null) continue;
    gameBall.trail.unshift({ x: gameBall.x, y: gameBall.y });
    if (gameBall.trail.length > 11) gameBall.trail.length = 11;
  }
  return event;
}

export function updatePinball(state: PinballState, seconds: number): PinballUpdateEvent {
  if (!Number.isFinite(seconds) || seconds <= 0) return {};
  const safeSeconds = Math.min(seconds, 0.1);
  if (state.phase === 'countdown') {
    const previous = Math.ceil(state.countdownRemaining);
    state.countdownRemaining = Math.max(0, state.countdownRemaining - safeSeconds);
    const next = Math.ceil(state.countdownRemaining);
    if (state.countdownRemaining === 0) {
      launchBalls(state);
      return { countdown: 0 };
    }
    if (next !== previous && next > 0 && next <= 3) return { countdown: next as 1 | 2 | 3 };
    return {};
  }
  if (state.phase === 'roundOver') {
    state.roundOverRemaining = Math.max(0, state.roundOverRemaining - safeSeconds);
    if (state.roundOverRemaining === 0) {
      state.roundNumber += 1;
      preparePinballRound(state);
    }
    return {};
  }
  if (state.phase !== 'playing') return {};
  return updatePlaying(state, safeSeconds);
}
