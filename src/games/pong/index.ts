import { createCanvasSurface, type CanvasSurface } from '../../core/canvas-scaler';
import type { GamePhase, GameServices, MiniGameController } from '../../core/game-controller';
import { FixedStepLoop } from '../../core/game-loop';
import { bindHold, InputManager, type InputBinding } from '../../core/input-manager';
import {
  PONG_HEIGHT,
  PONG_WIDTH,
  createPongState,
  resetPongState,
  startPongMatch,
  updatePong,
  type PongState,
} from './logic';

interface HeldControls {
  p1Up: boolean;
  p1Down: boolean;
  p2Up: boolean;
  p2Down: boolean;
}

function makeButton(label: string, className: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.dataset.pressed = 'false';
  return button;
}

interface PongTouchGroup {
  root: HTMLFieldSetElement;
  legend: HTMLLegendElement;
  up: HTMLButtonElement;
  down: HTMLButtonElement;
}

function syncTouchGroup(group: PongTouchGroup, name: string): void {
  if (group.legend.textContent !== name) group.legend.textContent = name;
  const upLabel = `${name} 패들 위로`;
  const downLabel = `${name} 패들 아래로`;
  if (group.up.getAttribute('aria-label') !== upLabel) group.up.setAttribute('aria-label', upLabel);
  if (group.down.getAttribute('aria-label') !== downLabel)
    group.down.setAttribute('aria-label', downLabel);
}

function makeTouchGroup(name: string): PongTouchGroup {
  const root = document.createElement('fieldset');
  root.className = 'touch-control-group';
  const legend = document.createElement('legend');
  legend.textContent = name;
  const up = makeButton('위', 'touch-control touch-control--up');
  up.setAttribute('aria-label', `${name} 패들 위로`);
  const down = makeButton('아래', 'touch-control touch-control--down');
  down.setAttribute('aria-label', `${name} 패들 아래로`);
  root.append(legend, up, down);
  return { root, legend, up, down };
}

function phaseMessage(state: PongState, playerName: (player: 1 | 2) => string): string {
  switch (state.phase) {
    case 'idle':
      return '시작 버튼을 누르면 3초 카운트다운이 시작됩니다.';
    case 'countdown':
      return `${String(Math.max(1, Math.ceil(state.countdownRemaining)))}초 후 서브`;
    case 'playing':
      return `마지막 랠리 ${String(state.rallyHits)}회`;
    case 'paused':
      return '일시정지됨';
    case 'roundOver':
      return '득점! 다음 서브를 준비합니다.';
    case 'matchOver':
      return `${playerName(state.winner === 1 ? 1 : 2)} 경기 승리`;
  }
}

export function createGame(services: GameServices): MiniGameController {
  let state = createPongState();
  let surface: CanvasSurface | null = null;
  let root: HTMLElement | null = null;
  let scoreElement: HTMLElement | null = null;
  let statusElement: HTMLElement | null = null;
  let targetSelect: HTMLSelectElement | null = null;
  let touchGroups: [PongTouchGroup, PongTouchGroup] | null = null;
  let mounted = false;
  let completed = false;
  let reportedPhase: GamePhase | null = null;
  const input = new InputManager();
  const holdBindings: InputBinding[] = [];
  const playerName = (player: 1 | 2): string => services.getPlayerName(player);
  const controlHeld: HeldControls = {
    p1Up: false,
    p1Down: false,
    p2Up: false,
    p2Down: false,
  };
  const globalKeyHeld: HeldControls = {
    p1Up: false,
    p1Down: false,
    p2Up: false,
    p2Down: false,
  };

  const axis = (negative: boolean, positive: boolean): number =>
    Number(positive) - Number(negative);
  const isHeld = (control: keyof HeldControls): boolean =>
    controlHeld[control] || globalKeyHeld[control];

  const clearHeld = (): void => {
    for (const binding of holdBindings) binding.release();
    controlHeld.p1Up = false;
    controlHeld.p1Down = false;
    controlHeld.p2Up = false;
    controlHeld.p2Down = false;
    globalKeyHeld.p1Up = false;
    globalKeyHeld.p1Down = false;
    globalKeyHeld.p2Up = false;
    globalKeyHeld.p2Down = false;
  };

  const updateStatus = (): void => {
    if (scoreElement) {
      const p1Name = services.getPlayerName(1);
      const p2Name = services.getPlayerName(2);
      const score = `${p1Name} ${String(state.scores[0])} : ${String(state.scores[1])} ${p2Name}`;
      if (scoreElement.textContent !== score) scoreElement.textContent = score;
    }
    if (statusElement) {
      const status = phaseMessage(state, playerName);
      if (statusElement.textContent !== status) statusElement.textContent = status;
    }
    if (touchGroups) {
      syncTouchGroup(touchGroups[0], services.getPlayerName(1));
      syncTouchGroup(touchGroups[1], services.getPlayerName(2));
    }
    if (targetSelect) targetSelect.disabled = state.phase !== 'idle' && state.phase !== 'matchOver';
  };

  const reportPhase = (): void => {
    if (reportedPhase === state.phase) return;
    reportedPhase = state.phase;
    services.setPhase(state.phase, phaseMessage(state, playerName));
  };

  const update = (seconds: number): void => {
    const event = updatePong(
      state,
      {
        player1Axis: axis(isHeld('p1Up'), isHeld('p1Down')),
        player2Axis: axis(isHeld('p2Up'), isHeld('p2Down')),
      },
      seconds,
    );
    if (event.countdown !== undefined) services.audio.countdown(event.countdown);
    if (event.paddleHit) services.audio.hit(Math.min(1, 0.4 + state.rallyHits * 0.03));
    if (event.scoredBy) {
      services.audio.score(event.scoredBy);
      services.announce(`${services.getPlayerName(event.scoredBy)} 득점`);
    }
    if (event.matchWinner && !completed) {
      completed = true;
      services.complete({
        winner: event.matchWinner,
        headline: `${services.getPlayerName(event.matchWinner)} 승리!`,
        detail: `${String(state.scores[0])} : ${String(state.scores[1])} · 마지막 랠리 ${String(state.rallyHits)}회`,
        score: [state.scores[0], state.scores[1]],
      });
    }
    reportPhase();
    updateStatus();
    if (state.phase === 'matchOver') loop.pause();
  };

  const render = (): void => {
    if (!surface) return;
    const context = surface.context;
    const reducedMotion = services.isReducedMotion();
    context.save();
    context.clearRect(0, 0, PONG_WIDTH, PONG_HEIGHT);

    const background = context.createLinearGradient(0, 0, PONG_WIDTH, PONG_HEIGHT);
    background.addColorStop(0, '#fffaf0');
    background.addColorStop(1, '#e8f1ff');
    context.fillStyle = background;
    context.fillRect(0, 0, PONG_WIDTH, PONG_HEIGHT);

    context.strokeStyle = 'rgba(20, 87, 217, 0.1)';
    context.lineWidth = 1;
    for (let x = 40; x < PONG_WIDTH; x += 40) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, PONG_HEIGHT);
      context.stroke();
    }
    for (let y = 40; y < PONG_HEIGHT; y += 40) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(PONG_WIDTH, y);
      context.stroke();
    }

    context.setLineDash([10, 15]);
    context.strokeStyle = 'rgba(25,45,79,0.28)';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(PONG_WIDTH / 2, 20);
    context.lineTo(PONG_WIDTH / 2, PONG_HEIGHT - 20);
    context.stroke();
    context.setLineDash([]);

    if (state.flashRemaining > 0) {
      const alpha = Math.min(0.24, state.flashRemaining * 0.8);
      context.fillStyle =
        state.flashPlayer === 1
          ? `rgba(69,228,224,${String(alpha)})`
          : `rgba(255,93,158,${String(alpha)})`;
      context.fillRect(
        state.flashPlayer === 1 ? 0 : PONG_WIDTH / 2,
        0,
        PONG_WIDTH / 2,
        PONG_HEIGHT,
      );
    }

    if (!reducedMotion) {
      for (let index = state.trail.length - 1; index >= 0; index -= 1) {
        const point = state.trail[index];
        if (!point) continue;
        const alpha = ((state.trail.length - index) / state.trail.length) * 0.15;
        context.fillStyle = `rgba(20,87,217,${String(alpha)})`;
        context.beginPath();
        context.arc(point.x, point.y, Math.max(2, state.ball.radius - index * 0.7), 0, Math.PI * 2);
        context.fill();
      }
    }

    const paddleColors = ['#45e4e0', '#ff5d9e'] as const;
    for (let index = 0; index < state.paddles.length; index += 1) {
      const gamePaddle = state.paddles[index];
      if (!gamePaddle) continue;
      context.fillStyle = paddleColors[index] ?? '#ffffff';
      context.shadowColor = paddleColors[index] ?? '#ffffff';
      context.shadowBlur = reducedMotion ? 0 : 18;
      context.fillRect(gamePaddle.x, gamePaddle.y, gamePaddle.width, gamePaddle.height);
    }

    context.shadowColor = '#8fb8ff';
    context.shadowBlur = reducedMotion ? 0 : 22;
    context.fillStyle = '#1457d9';
    context.beginPath();
    context.arc(state.ball.x, state.ball.y, state.ball.radius, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;

    context.fillStyle = 'rgba(23,33,54,0.92)';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '700 66px system-ui, sans-serif';
    context.fillText(`${String(state.scores[0])}   ${String(state.scores[1])}`, PONG_WIDTH / 2, 62);

    if (state.phase === 'countdown') {
      context.font = '900 112px system-ui, sans-serif';
      context.fillStyle = '#1457d9';
      context.fillText(
        String(Math.max(1, Math.ceil(state.countdownRemaining))),
        PONG_WIDTH / 2,
        PONG_HEIGHT / 2,
      );
    } else if (state.phase === 'paused' || state.phase === 'idle') {
      context.fillStyle = 'rgba(255,253,248,0.84)';
      context.fillRect(0, 0, PONG_WIDTH, PONG_HEIGHT);
      context.fillStyle = '#172136';
      context.font = '800 42px system-ui, sans-serif';
      context.fillText(
        state.phase === 'paused' ? '일시정지' : 'START를 눌러 시작',
        PONG_WIDTH / 2,
        PONG_HEIGHT / 2,
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
    clearHeld();
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
      root.className = 'canvas-game pong-game';
      root.dataset.game = 'pong';

      const info = document.createElement('div');
      info.className = 'game-local-hud';
      scoreElement = document.createElement('strong');
      scoreElement.className = 'game-local-score';
      statusElement = document.createElement('span');
      statusElement.className = 'game-local-status';
      statusElement.setAttribute('aria-live', 'polite');

      const targetLabel = document.createElement('label');
      targetLabel.className = 'game-option';
      targetLabel.append(document.createTextNode('선취점 '));
      targetSelect = document.createElement('select');
      targetSelect.setAttribute('aria-label', '탁구 선취점');
      for (const score of [5, 7, 11] as const) {
        const option = document.createElement('option');
        option.value = String(score);
        option.textContent = `${String(score)}점`;
        option.selected = score === state.targetScore;
        targetSelect.append(option);
      }
      targetLabel.append(targetSelect);
      info.append(scoreElement, statusElement, targetLabel);

      const canvas = document.createElement('canvas');
      canvas.className = 'game-canvas';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', '탁구 경기장');
      canvas.style.width = '100%';
      canvas.style.maxWidth = `${String(PONG_WIDTH)}px`;
      canvas.style.display = 'block';
      canvas.style.touchAction = 'none';
      canvas.textContent = 'Canvas를 지원하는 브라우저가 필요합니다.';
      surface = createCanvasSurface(canvas, PONG_WIDTH, PONG_HEIGHT);

      const controls = document.createElement('div');
      controls.className = 'touch-controls touch-controls--split';
      const p1 = makeTouchGroup(services.getPlayerName(1));
      const p2 = makeTouchGroup(services.getPlayerName(2));
      touchGroups = [p1, p2];
      controls.append(p1.root, p2.root);
      root.append(info, canvas, controls);
      container.append(root);

      holdBindings.push(
        bindHold(p1.up, (pressed) => (controlHeld.p1Up = pressed), input.signal),
        bindHold(p1.down, (pressed) => (controlHeld.p1Down = pressed), input.signal),
        bindHold(p2.up, (pressed) => (controlHeld.p2Up = pressed), input.signal),
        bindHold(p2.down, (pressed) => (controlHeld.p2Down = pressed), input.signal),
      );

      const handleKey = (event: KeyboardEvent, pressed: boolean): void => {
        const active = state.phase === 'playing' || state.phase === 'countdown';
        switch (event.code) {
          case 'KeyW':
            globalKeyHeld.p1Up = pressed;
            break;
          case 'KeyS':
            globalKeyHeld.p1Down = pressed;
            break;
          case 'ArrowUp':
            globalKeyHeld.p2Up = pressed;
            break;
          case 'ArrowDown':
            globalKeyHeld.p2Down = pressed;
            break;
          default:
            return;
        }
        if (active) event.preventDefault();
      };
      input.listen(window, 'keydown', (event) => handleKey(event, true));
      input.listen(window, 'keyup', (event) => handleKey(event, false));
      input.listen(window, 'blur', clearHeld);
      input.listen(window, 'resize', () => surface?.resize());
      input.listen(targetSelect, 'change', () => {
        const selected = Number(targetSelect?.value);
        if (selected !== 5 && selected !== 7 && selected !== 11) return;
        state.targetScore = selected;
        resetPongState(state);
        completed = false;
        reportedPhase = null;
        reportPhase();
        updateStatus();
        render();
      });
      document.addEventListener(
        'visibilitychange',
        () => {
          if (document.hidden) pause();
        },
        { signal: input.signal },
      );
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
        updatePong(state, { player1Axis: 0, player2Axis: 0 }, 0);
        reportPhase();
        updateStatus();
        loop.start();
        return;
      }
      if (state.phase !== 'idle' && state.phase !== 'matchOver') return;
      completed = false;
      startPongMatch(state);
      services.audio.countdown(3);
      reportPhase();
      updateStatus();
      loop.start();
    },

    pause,
    resume,

    reset(options): boolean {
      resetPongState(state, options?.preserveMatchScore ?? false);
      completed = false;
      reportedPhase = null;
      clearHeld();
      reportPhase();
      updateStatus();
      loop.pause();
      render();
      return true;
    },

    destroy(): void {
      loop.stop();
      input.destroy();
      clearHeld();
      root?.remove();
      root = null;
      surface = null;
      scoreElement = null;
      statusElement = null;
      targetSelect = null;
      touchGroups = null;
      mounted = false;
      state = createPongState();
    },
  };
}
