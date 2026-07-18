import { createCanvasSurface, type CanvasSurface } from '../../core/canvas-scaler';
import type { GamePhase, GameServices, MiniGameController } from '../../core/game-controller';
import { FixedStepLoop } from '../../core/game-loop';
import { bindHold, InputManager } from '../../core/input-manager';
import {
  VOLLEYBALL_FLOOR_Y,
  VOLLEYBALL_HEIGHT,
  VOLLEYBALL_NET_TOP,
  VOLLEYBALL_NET_WIDTH,
  VOLLEYBALL_NET_X,
  VOLLEYBALL_WIDTH,
  createVolleyballState,
  resetVolleyballState,
  startVolleyballMatch,
  updateVolleyball,
  type VolleyballState,
} from './logic';

interface HeldControls {
  p1Left: boolean;
  p1Right: boolean;
  p1Jump: boolean;
  p2Left: boolean;
  p2Right: boolean;
  p2Jump: boolean;
}

function controlButton(label: string, ariaLabel: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'touch-control';
  button.textContent = label;
  button.setAttribute('aria-label', ariaLabel);
  button.dataset.pressed = 'false';
  return button;
}

interface VolleyballTouchGroup {
  root: HTMLFieldSetElement;
  legend: HTMLLegendElement;
  left: HTMLButtonElement;
  jump: HTMLButtonElement;
  right: HTMLButtonElement;
}

function syncTouchGroup(group: VolleyballTouchGroup, name: string): void {
  if (group.legend.textContent !== name) group.legend.textContent = name;
  for (const [button, action] of [
    [group.left, '왼쪽 이동'],
    [group.jump, '점프'],
    [group.right, '오른쪽 이동'],
  ] as const) {
    const label = `${name} ${action}`;
    if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
  }
}

function touchGroup(name: string): VolleyballTouchGroup {
  const root = document.createElement('fieldset');
  root.className = 'touch-control-group touch-control-group--three';
  const legend = document.createElement('legend');
  legend.textContent = name;
  const left = controlButton('왼쪽', `${name} 왼쪽 이동`);
  const jump = controlButton('점프', `${name} 점프`);
  jump.classList.add('touch-control--accent');
  const right = controlButton('오른쪽', `${name} 오른쪽 이동`);
  root.append(legend, left, jump, right);
  return { root, legend, left, jump, right };
}

function statusMessage(state: VolleyballState, playerName: (player: 1 | 2) => string): string {
  switch (state.phase) {
    case 'idle':
      return '시작 버튼을 누르면 경기가 시작됩니다.';
    case 'countdown':
      return `${String(Math.max(1, Math.ceil(state.countdownRemaining)))}초 후 서브`;
    case 'playing':
      return '공을 상대 코트 바닥에 떨어뜨리세요.';
    case 'paused':
      return '일시정지됨';
    case 'roundOver':
      return '득점! 코트를 다시 정리합니다.';
    case 'matchOver':
      return `${playerName(state.winner === 1 ? 1 : 2)} 경기 승리`;
  }
}

export function createGame(services: GameServices): MiniGameController {
  let state = createVolleyballState();
  let surface: CanvasSurface | null = null;
  let root: HTMLElement | null = null;
  let scoreElement: HTMLElement | null = null;
  let statusElement: HTMLElement | null = null;
  let targetSelect: HTMLSelectElement | null = null;
  let touchGroups: [VolleyballTouchGroup, VolleyballTouchGroup] | null = null;
  let mounted = false;
  let completed = false;
  let reportedPhase: GamePhase | null = null;
  const input = new InputManager();
  const playerName = (player: 1 | 2): string => services.getPlayerName(player);
  const held: HeldControls = {
    p1Left: false,
    p1Right: false,
    p1Jump: false,
    p2Left: false,
    p2Right: false,
    p2Jump: false,
  };

  const clearHeld = (): void => {
    held.p1Left = false;
    held.p1Right = false;
    held.p1Jump = false;
    held.p2Left = false;
    held.p2Right = false;
    held.p2Jump = false;
  };

  const axis = (left: boolean, right: boolean): number => Number(right) - Number(left);

  const updateStatus = (): void => {
    if (scoreElement) {
      const score = `${services.getPlayerName(1)} ${String(state.scores[0])} : ${String(state.scores[1])} ${services.getPlayerName(2)}`;
      if (scoreElement.textContent !== score) scoreElement.textContent = score;
    }
    if (statusElement) {
      const status = statusMessage(state, playerName);
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
    services.setPhase(state.phase, statusMessage(state, playerName));
  };

  const update = (seconds: number): void => {
    const event = updateVolleyball(
      state,
      {
        player1Axis: axis(held.p1Left, held.p1Right),
        player1Jump: held.p1Jump,
        player2Axis: axis(held.p2Left, held.p2Right),
        player2Jump: held.p2Jump,
      },
      seconds,
    );
    if (event.countdown !== undefined) services.audio.countdown(event.countdown);
    if (event.playerHit) services.audio.hit(0.72);
    else if (event.netHit) services.audio.hit(0.35);
    if (event.scoredBy) {
      services.audio.score(event.scoredBy);
      services.announce(`${services.getPlayerName(event.scoredBy)} 득점`);
    }
    if (event.matchWinner && !completed) {
      completed = true;
      services.complete({
        winner: event.matchWinner,
        headline: `${services.getPlayerName(event.matchWinner)} 승리!`,
        detail: `통통 배구 ${String(state.scores[0])} : ${String(state.scores[1])}`,
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
    context.clearRect(0, 0, VOLLEYBALL_WIDTH, VOLLEYBALL_HEIGHT);

    const sky = context.createLinearGradient(0, 0, 0, VOLLEYBALL_FLOOR_Y);
    sky.addColorStop(0, '#12213d');
    sky.addColorStop(1, '#19355a');
    context.fillStyle = sky;
    context.fillRect(0, 0, VOLLEYBALL_WIDTH, VOLLEYBALL_FLOOR_Y);
    context.fillStyle = '#d49b55';
    context.fillRect(
      0,
      VOLLEYBALL_FLOOR_Y,
      VOLLEYBALL_WIDTH,
      VOLLEYBALL_HEIGHT - VOLLEYBALL_FLOOR_Y,
    );

    context.strokeStyle = 'rgba(255,255,255,0.16)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, VOLLEYBALL_FLOOR_Y);
    context.lineTo(VOLLEYBALL_WIDTH, VOLLEYBALL_FLOOR_Y);
    context.stroke();
    for (let x = 30; x < VOLLEYBALL_WIDTH; x += 60) {
      context.beginPath();
      context.moveTo(x, VOLLEYBALL_FLOOR_Y + 8);
      context.lineTo(x + 18, VOLLEYBALL_HEIGHT);
      context.stroke();
    }

    const shadowY = VOLLEYBALL_FLOOR_Y + 5;
    const height = Math.max(0, VOLLEYBALL_FLOOR_Y - (state.ball.y + state.ball.radius));
    const shadowScale = Math.max(0.25, 1 - height / 500);
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.ellipse(
      state.ball.x,
      shadowY,
      state.ball.radius * shadowScale * 1.35,
      7 * shadowScale,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();

    if (!reducedMotion) {
      for (let index = state.trail.length - 1; index >= 0; index -= 1) {
        const point = state.trail[index];
        if (!point) continue;
        context.fillStyle = `rgba(255,212,71,${String(0.025 + (state.trail.length - index) * 0.012)})`;
        context.beginPath();
        context.arc(point.x, point.y, Math.max(3, state.ball.radius - index * 1.2), 0, Math.PI * 2);
        context.fill();
      }
    }

    const colors = ['#45e4e0', '#ff5d9e'] as const;
    for (let index = 0; index < state.players.length; index += 1) {
      const gamePlayer = state.players[index];
      if (!gamePlayer) continue;
      context.fillStyle = 'rgba(0,0,0,0.22)';
      context.beginPath();
      context.ellipse(
        gamePlayer.x,
        VOLLEYBALL_FLOOR_Y + 4,
        gamePlayer.radius * 0.8,
        8,
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.fillStyle = colors[index] ?? '#ffffff';
      context.shadowColor = colors[index] ?? '#ffffff';
      context.shadowBlur = reducedMotion ? 0 : state.impactFlash > 0 ? 22 : 10;
      context.beginPath();
      context.arc(gamePlayer.x, gamePlayer.y, gamePlayer.radius, Math.PI, 0);
      context.lineTo(gamePlayer.x + gamePlayer.radius, gamePlayer.y + gamePlayer.radius * 0.55);
      context.quadraticCurveTo(
        gamePlayer.x,
        gamePlayer.y + gamePlayer.radius * 1.1,
        gamePlayer.x - gamePlayer.radius,
        gamePlayer.y + gamePlayer.radius * 0.55,
      );
      context.closePath();
      context.fill();
      context.shadowBlur = 0;
    }

    context.fillStyle = '#eef5ff';
    context.fillRect(
      VOLLEYBALL_NET_X - VOLLEYBALL_NET_WIDTH / 2,
      VOLLEYBALL_NET_TOP,
      VOLLEYBALL_NET_WIDTH,
      VOLLEYBALL_FLOOR_Y - VOLLEYBALL_NET_TOP,
    );
    context.fillStyle = '#ffd447';
    context.fillRect(VOLLEYBALL_NET_X - 17, VOLLEYBALL_NET_TOP - 6, 34, 10);
    context.strokeStyle = 'rgba(9,27,45,0.45)';
    context.lineWidth = 1;
    for (let y = VOLLEYBALL_NET_TOP + 18; y < VOLLEYBALL_FLOOR_Y; y += 20) {
      context.beginPath();
      context.moveTo(VOLLEYBALL_NET_X - VOLLEYBALL_NET_WIDTH / 2, y);
      context.lineTo(VOLLEYBALL_NET_X + VOLLEYBALL_NET_WIDTH / 2, y);
      context.stroke();
    }

    context.save();
    context.translate(state.ball.x, state.ball.y);
    context.rotate(state.ball.rotation);
    context.shadowColor = '#ffd447';
    context.shadowBlur = reducedMotion ? 0 : 16;
    context.fillStyle = '#ffd447';
    context.beginPath();
    context.arc(0, 0, state.ball.radius, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;
    context.strokeStyle = '#152641';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(-8, 0, 13, -1.1, 1.1);
    context.stroke();
    context.beginPath();
    context.arc(8, 0, 13, Math.PI - 1.1, Math.PI + 1.1);
    context.stroke();
    context.restore();

    context.fillStyle = 'rgba(255,255,255,0.9)';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '800 58px system-ui, sans-serif';
    context.fillText(
      `${String(state.scores[0])}   ${String(state.scores[1])}`,
      VOLLEYBALL_WIDTH / 2,
      58,
    );

    if (state.phase === 'countdown') {
      context.fillStyle = '#ffd447';
      context.font = '900 106px system-ui, sans-serif';
      context.fillText(
        String(Math.max(1, Math.ceil(state.countdownRemaining))),
        VOLLEYBALL_WIDTH / 2,
        170,
      );
    } else if (state.phase === 'idle' || state.phase === 'paused') {
      context.fillStyle = 'rgba(5,12,22,0.65)';
      context.fillRect(0, 0, VOLLEYBALL_WIDTH, VOLLEYBALL_HEIGHT);
      context.fillStyle = '#ffffff';
      context.font = '800 42px system-ui, sans-serif';
      context.fillText(
        state.phase === 'paused' ? '일시정지' : 'START를 눌러 시작',
        VOLLEYBALL_WIDTH / 2,
        VOLLEYBALL_HEIGHT / 2,
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
      root.className = 'canvas-game volleyball-game';
      root.dataset.game = 'volleyball';

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
      targetSelect.setAttribute('aria-label', '배구 선취점');
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
      canvas.setAttribute('aria-label', '통통 배구 경기장');
      canvas.tabIndex = 0;
      canvas.style.width = '100%';
      canvas.style.maxWidth = `${String(VOLLEYBALL_WIDTH)}px`;
      canvas.style.display = 'block';
      canvas.style.touchAction = 'none';
      surface = createCanvasSurface(canvas, VOLLEYBALL_WIDTH, VOLLEYBALL_HEIGHT);

      const controls = document.createElement('div');
      controls.className = 'touch-controls touch-controls--split';
      const p1 = touchGroup(services.getPlayerName(1));
      const p2 = touchGroup(services.getPlayerName(2));
      touchGroups = [p1, p2];
      controls.append(p1.root, p2.root);
      root.append(info, canvas, controls);
      container.append(root);

      bindHold(p1.left, (pressed) => (held.p1Left = pressed), input.signal);
      bindHold(p1.right, (pressed) => (held.p1Right = pressed), input.signal);
      bindHold(p1.jump, (pressed) => (held.p1Jump = pressed), input.signal);
      bindHold(p2.left, (pressed) => (held.p2Left = pressed), input.signal);
      bindHold(p2.right, (pressed) => (held.p2Right = pressed), input.signal);
      bindHold(p2.jump, (pressed) => (held.p2Jump = pressed), input.signal);

      const handleKey = (event: KeyboardEvent, pressed: boolean): void => {
        const active = state.phase === 'playing' || state.phase === 'countdown';
        switch (event.code) {
          case 'KeyA':
            held.p1Left = pressed;
            break;
          case 'KeyD':
            held.p1Right = pressed;
            break;
          case 'KeyW':
            held.p1Jump = pressed;
            break;
          case 'ArrowLeft':
            held.p2Left = pressed;
            break;
          case 'ArrowRight':
            held.p2Right = pressed;
            break;
          case 'ArrowUp':
            held.p2Jump = pressed;
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
        resetVolleyballState(state);
        completed = false;
        reportedPhase = null;
        reportPhase();
        updateStatus();
        render();
      });
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
        updateVolleyball(
          state,
          { player1Axis: 0, player1Jump: false, player2Axis: 0, player2Jump: false },
          0,
        );
        reportPhase();
        updateStatus();
        loop.start();
        return;
      }
      if (state.phase !== 'idle' && state.phase !== 'matchOver') return;
      completed = false;
      startVolleyballMatch(state);
      services.audio.countdown(3);
      reportPhase();
      updateStatus();
      loop.start();
    },

    pause,
    resume,

    reset(options): void {
      resetVolleyballState(state, options?.preserveMatchScore ?? false);
      completed = false;
      reportedPhase = null;
      clearHeld();
      reportPhase();
      updateStatus();
      loop.pause();
      render();
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
      state = createVolleyballState();
    },
  };
}
