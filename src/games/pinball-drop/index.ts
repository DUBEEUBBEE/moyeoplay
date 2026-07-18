import { createCanvasSurface, type CanvasSurface } from '../../core/canvas-scaler';
import type { GamePhase, GameServices, MiniGameController } from '../../core/game-controller';
import { FixedStepLoop } from '../../core/game-loop';
import { InputManager } from '../../core/input-manager';
import {
  PINBALL_FLOOR_Y,
  PINBALL_HEIGHT,
  PINBALL_LEFT_INNER_WALL,
  PINBALL_LEFT_WALL,
  PINBALL_RIGHT_INNER_WALL,
  PINBALL_RIGHT_WALL,
  PINBALL_WIDTH,
  applyPinballBoost,
  createPinballState,
  resetPinballState,
  startPinballMatch,
  updatePinball,
  type PinballBall,
  type PinballState,
} from './logic';

function seconds(value: number | null): string {
  return value === null ? '진행 중' : `${value.toFixed(2)}초`;
}

function statusMessage(state: PinballState, playerName: (player: 1 | 2) => string): string {
  switch (state.phase) {
    case 'idle':
      return 'START를 누르면 두 공이 동시에 출발합니다.';
    case 'countdown':
      return `${String(state.roundNumber)}라운드 · ${String(Math.max(1, Math.ceil(state.countdownRemaining)))}초 후 출발`;
    case 'playing':
      return `${state.elapsed.toFixed(1)}초 경과`;
    case 'paused':
      return '일시정지됨';
    case 'roundOver': {
      const result = state.lastResult;
      if (!result) return '라운드 종료';
      if (result.winner === 0) return `무승부 · 차이 ${result.difference.toFixed(3)}초`;
      return `${playerName(result.winner)} 라운드 승리 · 차이 ${result.difference.toFixed(2)}초`;
    }
    case 'matchOver':
      return `${playerName(state.winner === 1 ? 1 : 2)} 매치 승리`;
  }
}

function makeBoostButton(name: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'touch-control pinball-boost';
  button.setAttribute('aria-label', `${name} 부스터 사용`);
  return button;
}

export function createGame(services: GameServices): MiniGameController {
  let state = createPinballState(Date.now());
  let surface: CanvasSurface | null = null;
  let root: HTMLElement | null = null;
  let scoreElement: HTMLElement | null = null;
  let statusElement: HTMLElement | null = null;
  let timeElement: HTMLElement | null = null;
  let boostButtons: [HTMLButtonElement, HTMLButtonElement] | null = null;
  let mounted = false;
  let completed = false;
  let reportedPhase: GamePhase | null = null;
  let hitSoundCooldown = 0;
  const input = new InputManager();
  const playerName = (player: 1 | 2): string => services.getPlayerName(player);

  const updateStatus = (): void => {
    if (scoreElement) {
      const score = `${services.getPlayerName(1)} ${String(state.roundWins[0])} : ${String(state.roundWins[1])} ${services.getPlayerName(2)}`;
      if (scoreElement.textContent !== score) scoreElement.textContent = score;
    }
    if (statusElement) {
      const status = statusMessage(state, playerName);
      if (statusElement.textContent !== status) statusElement.textContent = status;
    }
    if (timeElement) {
      const times = `착지 시간 · ${seconds(state.balls[0].landedAt)} / ${seconds(state.balls[1].landedAt)}`;
      if (timeElement.textContent !== times) timeElement.textContent = times;
    }
    if (boostButtons) {
      for (let index = 0; index < boostButtons.length; index += 1) {
        const button = boostButtons[index];
        const gameBall = state.balls[index];
        if (!button || !gameBall) continue;
        const cooldown =
          gameBall.boostCooldown > 0 ? ` · ${gameBall.boostCooldown.toFixed(1)}초` : '';
        const player = (index + 1) as 1 | 2;
        const playerName = services.getPlayerName(player);
        const label = `${playerName} BOOST ×${String(gameBall.boostsRemaining)}${cooldown}`;
        if (button.textContent !== label) button.textContent = label;
        const ariaLabel = `${playerName} 부스터 사용, ${String(gameBall.boostsRemaining)}회 남음${cooldown}`;
        if (button.getAttribute('aria-label') !== ariaLabel)
          button.setAttribute('aria-label', ariaLabel);
        button.disabled =
          state.phase !== 'playing' ||
          gameBall.landedAt !== null ||
          gameBall.boostsRemaining === 0 ||
          gameBall.boostCooldown > 0;
      }
    }
  };

  const reportPhase = (): void => {
    if (reportedPhase === state.phase) return;
    reportedPhase = state.phase;
    services.setPhase(state.phase, statusMessage(state, playerName));
  };

  const useBoost = (player: 1 | 2): void => {
    if (!applyPinballBoost(state, player)) return;
    services.audio.hit(0.9);
    const boostedBall = player === 1 ? state.balls[0] : state.balls[1];
    services.announce(
      `${services.getPlayerName(player)} 부스터, ${String(boostedBall.boostsRemaining)}회 남음`,
    );
    updateStatus();
  };

  const update = (stepSeconds: number): void => {
    hitSoundCooldown = Math.max(0, hitSoundCooldown - stepSeconds);
    const event = updatePinball(state, stepSeconds);
    if (event.countdown !== undefined) services.audio.countdown(event.countdown);
    if (event.pegHit && hitSoundCooldown === 0) {
      hitSoundCooldown = 0.045;
      services.audio.hit(0.3);
    }
    if (event.roundResult) {
      if (event.roundResult.winner === 0) {
        services.announce(`라운드 무승부, 차이 ${event.roundResult.difference.toFixed(3)}초`);
      } else {
        services.audio.score(event.roundResult.winner);
        services.announce(`${services.getPlayerName(event.roundResult.winner)} 라운드 승리`);
      }
    }
    if (event.matchWinner && !completed) {
      completed = true;
      const result = state.lastResult;
      const detail = result
        ? `${result.times[0].toFixed(2)}초 : ${result.times[1].toFixed(2)}초 · 차이 ${result.difference.toFixed(2)}초`
        : `${String(state.roundWins[0])} : ${String(state.roundWins[1])}`;
      services.complete({
        winner: event.matchWinner,
        headline: `${services.getPlayerName(event.matchWinner)} 승리!`,
        detail,
        score: [state.roundWins[0], state.roundWins[1]],
      });
    }
    reportPhase();
    updateStatus();
    if (state.phase === 'matchOver') loop.pause();
  };

  const drawBall = (
    context: CanvasRenderingContext2D,
    gameBall: PinballBall,
    color: string,
    reducedMotion: boolean,
  ): void => {
    if (!reducedMotion) {
      for (let index = gameBall.trail.length - 1; index >= 0; index -= 1) {
        const point = gameBall.trail[index];
        if (!point) continue;
        const alpha = 0.02 + (gameBall.trail.length - index) * 0.012;
        context.fillStyle =
          color === '#45e4e0'
            ? `rgba(69,228,224,${String(alpha)})`
            : `rgba(255,93,158,${String(alpha)})`;
        context.beginPath();
        context.arc(point.x, point.y, Math.max(2, gameBall.radius - index * 0.9), 0, Math.PI * 2);
        context.fill();
      }
    }
    context.shadowColor = color;
    context.shadowBlur = reducedMotion ? 0 : 18;
    context.fillStyle = color;
    context.beginPath();
    context.arc(gameBall.x, gameBall.y, gameBall.radius, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    context.strokeStyle = '#ffffff';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(gameBall.x - 4, gameBall.y - 4, gameBall.radius * 0.35, Math.PI, Math.PI * 1.6);
    context.stroke();
  };

  const render = (): void => {
    if (!surface) return;
    const context = surface.context;
    const reducedMotion = services.isReducedMotion();
    context.save();
    context.clearRect(0, 0, PINBALL_WIDTH, PINBALL_HEIGHT);
    const background = context.createLinearGradient(0, 0, 0, PINBALL_HEIGHT);
    background.addColorStop(0, '#171431');
    background.addColorStop(1, '#080d1d');
    context.fillStyle = background;
    context.fillRect(0, 0, PINBALL_WIDTH, PINBALL_HEIGHT);

    context.fillStyle = 'rgba(69,228,224,0.035)';
    context.fillRect(
      PINBALL_LEFT_WALL,
      20,
      PINBALL_LEFT_INNER_WALL - PINBALL_LEFT_WALL,
      PINBALL_FLOOR_Y - 20,
    );
    context.fillStyle = 'rgba(255,93,158,0.035)';
    context.fillRect(
      PINBALL_RIGHT_INNER_WALL,
      20,
      PINBALL_RIGHT_WALL - PINBALL_RIGHT_INNER_WALL,
      PINBALL_FLOOR_Y - 20,
    );

    context.strokeStyle = 'rgba(255,255,255,0.35)';
    context.lineWidth = 4;
    for (const x of [
      PINBALL_LEFT_WALL,
      PINBALL_LEFT_INNER_WALL,
      PINBALL_RIGHT_INNER_WALL,
      PINBALL_RIGHT_WALL,
    ]) {
      context.beginPath();
      context.moveTo(x, 20);
      context.lineTo(x, PINBALL_FLOOR_Y);
      context.stroke();
    }
    context.strokeStyle = '#ffd447';
    context.lineWidth = 5;
    context.setLineDash([16, 9]);
    context.beginPath();
    context.moveTo(PINBALL_LEFT_WALL, PINBALL_FLOOR_Y);
    context.lineTo(PINBALL_LEFT_INNER_WALL, PINBALL_FLOOR_Y);
    context.moveTo(PINBALL_RIGHT_INNER_WALL, PINBALL_FLOOR_Y);
    context.lineTo(PINBALL_RIGHT_WALL, PINBALL_FLOOR_Y);
    context.stroke();
    context.setLineDash([]);

    const pegGroups = [state.pegs.left, state.pegs.right] as const;
    const colors = ['#45e4e0', '#ff5d9e'] as const;
    for (const [groupIndex, pegs] of pegGroups.entries()) {
      const color = colors[groupIndex] ?? '#ffffff';
      for (const peg of pegs) {
        context.fillStyle = color;
        context.globalAlpha = 0.74;
        context.beginPath();
        context.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
        context.strokeStyle = 'rgba(255,255,255,0.8)';
        context.lineWidth = 2;
        context.stroke();
      }
    }

    drawBall(context, state.balls[0], colors[0], reducedMotion);
    drawBall(context, state.balls[1], colors[1], reducedMotion);

    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = 'rgba(255,255,255,0.92)';
    context.font = '800 28px system-ui, sans-serif';
    context.fillText(services.getPlayerName(1), 245, 34);
    context.fillText(services.getPlayerName(2), PINBALL_WIDTH - 245, 34);
    context.font = '800 22px system-ui, sans-serif';
    context.fillText(`BOOST ×${String(state.balls[0].boostsRemaining)}`, 245, 72);
    context.fillText(`BOOST ×${String(state.balls[1].boostsRemaining)}`, PINBALL_WIDTH - 245, 72);
    context.fillStyle = '#ffd447';
    context.font = '900 30px ui-monospace, monospace';
    context.fillText(`${state.elapsed.toFixed(2)}s`, PINBALL_WIDTH / 2, 35);

    if (state.phase === 'countdown') {
      context.fillStyle = '#ffd447';
      context.font = '900 108px system-ui, sans-serif';
      context.fillText(
        String(Math.max(1, Math.ceil(state.countdownRemaining))),
        PINBALL_WIDTH / 2,
        255,
      );
    } else if (state.phase === 'idle' || state.phase === 'paused') {
      context.fillStyle = 'rgba(5,8,22,0.67)';
      context.fillRect(0, 0, PINBALL_WIDTH, PINBALL_HEIGHT);
      context.fillStyle = '#ffffff';
      context.font = '800 42px system-ui, sans-serif';
      context.fillText(
        state.phase === 'paused' ? '일시정지' : 'START를 눌러 시작',
        PINBALL_WIDTH / 2,
        PINBALL_HEIGHT / 2,
      );
    } else if (state.phase === 'roundOver' && state.lastResult) {
      context.fillStyle = 'rgba(5,8,22,0.72)';
      context.fillRect(155, 220, PINBALL_WIDTH - 310, 150);
      context.fillStyle = '#ffffff';
      context.font = '900 36px system-ui, sans-serif';
      const headline =
        state.lastResult.winner === 0
          ? '무승부!'
          : `${services.getPlayerName(state.lastResult.winner)} 승리`;
      context.fillText(headline, PINBALL_WIDTH / 2, 267);
      context.font = '700 25px system-ui, sans-serif';
      context.fillText(
        `${state.lastResult.times[0].toFixed(2)}초 : ${state.lastResult.times[1].toFixed(2)}초 · Δ ${state.lastResult.difference.toFixed(3)}초`,
        PINBALL_WIDTH / 2,
        323,
      );
    }
    context.restore();
  };

  const loop = new FixedStepLoop({ update, render }, { stepSeconds: 1 / 120, maxSubSteps: 12 });

  const pause = (): void => {
    if (state.phase !== 'playing' && state.phase !== 'countdown' && state.phase !== 'roundOver')
      return;
    state.pausedFrom = state.phase;
    state.phase = 'paused';
    loop.pause();
    reportPhase();
    updateStatus();
    render();
  };

  const resume = (): void => {
    if (state.phase !== 'paused') return;
    state.phase = state.pausedFrom;
    reportPhase();
    updateStatus();
    loop.resume();
  };

  return {
    mount(container: HTMLElement): void {
      if (mounted) return;
      mounted = true;
      root = document.createElement('section');
      root.className = 'canvas-game pinball-game';
      root.dataset.game = 'pinball-drop';

      const info = document.createElement('div');
      info.className = 'game-local-hud';
      scoreElement = document.createElement('strong');
      scoreElement.className = 'game-local-score';
      statusElement = document.createElement('span');
      statusElement.className = 'game-local-status';
      statusElement.setAttribute('aria-live', 'polite');
      timeElement = document.createElement('span');
      timeElement.className = 'pinball-times';
      info.append(scoreElement, statusElement, timeElement);

      const canvas = document.createElement('canvas');
      canvas.className = 'game-canvas';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', '대칭 핀볼 드롭 경기장');
      canvas.tabIndex = 0;
      canvas.style.width = '100%';
      canvas.style.maxWidth = `${String(PINBALL_WIDTH)}px`;
      canvas.style.display = 'block';
      canvas.style.touchAction = 'none';
      surface = createCanvasSurface(canvas, PINBALL_WIDTH, PINBALL_HEIGHT);

      const controls = document.createElement('div');
      controls.className = 'touch-controls touch-controls--split';
      const p1Button = makeBoostButton(services.getPlayerName(1));
      const p2Button = makeBoostButton(services.getPlayerName(2));
      boostButtons = [p1Button, p2Button];
      controls.append(p1Button, p2Button);
      root.append(info, canvas, controls);
      container.append(root);

      input.listen(p1Button, 'click', () => useBoost(1));
      input.listen(p2Button, 'click', () => useBoost(2));
      input.listen(window, 'keydown', (event) => {
        if (event.repeat) return;
        if (event.code === 'KeyA') {
          if (state.phase === 'playing') event.preventDefault();
          useBoost(1);
        } else if (event.code === 'KeyL') {
          if (state.phase === 'playing') event.preventDefault();
          useBoost(2);
        }
      });
      input.listen(window, 'resize', () => surface?.resize());
      document.addEventListener('visibilitychange', () => document.hidden && pause(), {
        signal: input.signal,
      });
      updateStatus();
      render();
    },

    enter(): void {
      if (!mounted) return;
      reportedPhase = null;
      reportPhase();
      updateStatus();
      render();
    },

    start(): void {
      if (!mounted) return;
      if (state.phase === 'paused') {
        resume();
        return;
      }
      if (state.phase === 'roundOver') {
        state.roundOverRemaining = 0;
        updatePinball(state, 0);
        reportPhase();
        updateStatus();
        loop.start();
        return;
      }
      if (state.phase !== 'idle' && state.phase !== 'matchOver') return;
      completed = false;
      startPinballMatch(state);
      services.audio.countdown(3);
      reportPhase();
      updateStatus();
      loop.start();
    },

    pause,
    resume,

    reset(options): void {
      resetPinballState(state, options?.preserveMatchScore ?? false);
      completed = false;
      reportedPhase = null;
      reportPhase();
      updateStatus();
      loop.pause();
      render();
    },

    destroy(): void {
      loop.stop();
      input.destroy();
      root?.remove();
      root = null;
      surface = null;
      scoreElement = null;
      statusElement = null;
      timeElement = null;
      boostButtons = null;
      mounted = false;
      state = createPinballState();
    },
  };
}
