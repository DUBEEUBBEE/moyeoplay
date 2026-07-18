import type { GamePhase, GameServices, MiniGameController } from '../../core/game-controller';
import { queryRequired, setText } from '../../core/dom';
import { bindActivationRepeatGuard } from '../../core/input-manager';
import {
  isFalseStart,
  normalizeEventTimestamp,
  reactionWaitMs,
  resolveReaction,
  REACTION_RESOLVE_BUFFER_MS,
  REACTION_TARGET_SCORE,
} from './logic';
import './reaction-duel.css';

type Player = 1 | 2;

const MARKUP = `
  <section class="reaction-game" data-signal="idle" aria-label="반응속도 대결">
    <header class="reaction-head">
      <div class="reaction-player"><i class="player-dot player-dot--one"></i><small data-name="1">PLAYER 1</small><strong data-score="1">0</strong></div>
      <div class="reaction-round"><span>FIRST TO 3</span><b data-round>ROUND 1</b></div>
      <div class="reaction-player reaction-player--two"><strong data-score="2">0</strong><small data-name="2">PLAYER 2</small><i class="player-dot player-dot--two"></i></div>
    </header>
    <div class="reaction-arena">
      <button class="reaction-zone" type="button" data-reaction-zone="1" aria-label="플레이어 1 반응 버튼"><b>F</b><strong data-zone-name="1">PLAYER 1</strong><span>키 또는 이 영역을 누르세요</span></button>
      <button class="reaction-zone" type="button" data-reaction-zone="2" aria-label="플레이어 2 반응 버튼"><b>J</b><strong data-zone-name="2">PLAYER 2</strong><span>키 또는 이 영역을 누르세요</span></button>
      <div class="reaction-signal" aria-hidden="true"><strong data-signal-text>READY</strong></div>
    </div>
    <div class="reaction-status" role="status" aria-live="polite"><span data-time="1">P1 —</span><strong data-message>시작을 눌러 준비하세요.</strong><span data-time="2">P2 —</span></div>
  </section>
`;

class ReactionDuelController implements MiniGameController {
  readonly #services: GameServices;
  #root: HTMLElement | null = null;
  #abort = new AbortController();
  #phase: GamePhase = 'idle';
  #scores: [number, number] = [0, 0];
  #round = 1;
  #signalAt: number | null = null;
  #presses: [number | null, number | null] = [null, null];
  #signalTimer = 0;
  #resolveTimer = 0;
  #resolveDueAt = 0;
  #remainingResolve = 0;
  #remainingWait = 0;
  #pauseStartedAt = 0;
  #pausedFrom: 'countdown' | 'playing' | null = null;
  readonly #activePointers = new Map<number, HTMLButtonElement>();

  constructor(services: GameServices) {
    this.#services = services;
  }

  mount(container: HTMLElement): void {
    container.innerHTML = MARKUP;
    this.#root = queryRequired(container, '.reaction-game');
    this.#bind();
    this.#render();
  }

  enter(): void {
    this.#setMessage('시작을 누르면 매번 다른 대기 시간 뒤 신호가 나타납니다.');
    this.#services.announce('반응속도 대결 준비 완료. F와 J 또는 화면 양쪽을 사용합니다.');
  }

  start(): void {
    if (this.#phase === 'countdown' || this.#phase === 'playing') return;
    if (this.#phase === 'matchOver') this.reset();
    this.#beginRound();
  }

  pause(): void {
    if (this.#phase !== 'countdown' && this.#phase !== 'playing') return;
    this.#releaseAllPointers();
    this.#pausedFrom = this.#phase;
    this.#pauseStartedAt = performance.now();
    if (this.#phase === 'countdown') {
      this.#remainingWait = Math.max(
        0,
        (this.#signalAt ?? this.#pauseStartedAt) - this.#pauseStartedAt,
      );
      this.#signalAt = null;
      window.clearTimeout(this.#signalTimer);
      this.#signalTimer = 0;
    }
    if (this.#phase === 'playing' && this.#presses.some((press) => press !== null)) {
      this.#remainingResolve = Math.max(0, this.#resolveDueAt - this.#pauseStartedAt);
    }
    window.clearTimeout(this.#resolveTimer);
    this.#resolveTimer = 0;
    this.#phase = 'paused';
    this.#setSignal('idle', 'PAUSE');
    this.#setMessage('일시정지되었습니다. 계속하기를 눌러 주세요.');
    this.#services.setPhase('paused', '반응속도 대결을 일시정지했습니다.');
  }

  resume(): void {
    if (this.#phase !== 'paused' || this.#pausedFrom === null) return;
    const pausedFrom = this.#pausedFrom;
    this.#pausedFrom = null;
    const pausedDuration = performance.now() - this.#pauseStartedAt;
    this.#render();
    if (pausedFrom === 'countdown') {
      this.#phase = 'countdown';
      this.#scheduleSignal(this.#remainingWait);
      this.#remainingWait = 0;
      this.#setSignal('wait', 'WAIT');
      this.#setMessage('신호가 켜질 때까지 기다리세요.');
      this.#services.setPhase('countdown', '신호 대기를 재개했습니다.');
    } else {
      this.#phase = 'playing';
      if (this.#signalAt !== null) {
        this.#signalAt += pausedDuration;
        this.#presses = [
          this.#presses[0] === null ? null : this.#presses[0] + pausedDuration,
          this.#presses[1] === null ? null : this.#presses[1] + pausedDuration,
        ];
      }
      if (this.#presses.some((press) => press !== null)) {
        const delay = this.#remainingResolve;
        this.#resolveDueAt = performance.now() + delay;
        this.#resolveTimer = window.setTimeout(() => {
          this.#resolveTimer = 0;
          this.#resolvePresses();
        }, delay);
        this.#remainingResolve = 0;
      }
      this.#setSignal('go', 'NOW!');
      this.#setMessage('지금 누르세요!');
      this.#services.setPhase('playing', '반응속도 대결을 재개했습니다.');
    }
  }

  reset(options?: { preserveMatchScore?: boolean }): boolean {
    this.#clearTimers();
    if (!options?.preserveMatchScore) this.#scores = [0, 0];
    this.#round = options?.preserveMatchScore ? this.#round : 1;
    this.#phase = 'idle';
    this.#signalAt = null;
    this.#presses = [null, null];
    this.#remainingWait = 0;
    this.#pauseStartedAt = 0;
    this.#releaseAllPointers();
    this.#setSignal('idle', 'READY');
    this.#setMessage('시작을 눌러 준비하세요.');
    this.#render();
    this.#services.setPhase('idle');
    return true;
  }

  destroy(): void {
    this.#clearTimers();
    this.#releaseAllPointers();
    this.#abort.abort();
    this.#root = null;
  }

  #bind(): void {
    if (!this.#root) return;
    const { signal } = this.#abort;
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.repeat) return;
        const key = event.key.toLowerCase();
        if (key === 'f') this.#press(1, this.#eventTime(event));
        else if (key === 'j') this.#press(2, this.#eventTime(event));
        else return;
        if (this.#phase === 'countdown' || this.#phase === 'playing') event.preventDefault();
      },
      { signal },
    );
    for (const player of [1, 2] as const) {
      const zone = queryRequired<HTMLButtonElement>(
        this.#root,
        `[data-reaction-zone="${String(player)}"]`,
      );
      zone.dataset.pressed = 'false';
      bindActivationRepeatGuard(zone, signal);
      zone.addEventListener(
        'pointerdown',
        (event) => {
          event.preventDefault();
          if (this.#activePointers.has(event.pointerId)) return;
          this.#activePointers.set(event.pointerId, zone);
          zone.dataset.pressed = 'true';
          try {
            zone.setPointerCapture(event.pointerId);
          } catch {
            // Pointer capture is an optional enhancement.
          }
          this.#press(player, this.#eventTime(event));
        },
        { signal },
      );
      for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
        zone.addEventListener(eventName, (event) => this.#releasePointer(event.pointerId), {
          signal,
        });
      }
      zone.addEventListener(
        'click',
        (event) => {
          if (event.detail === 0) this.#press(player, this.#eventTime(event));
        },
        { signal },
      );
    }
    window.addEventListener('pointerup', (event) => this.#releasePointer(event.pointerId), {
      capture: true,
      signal,
    });
    window.addEventListener('pointercancel', (event) => this.#releasePointer(event.pointerId), {
      capture: true,
      signal,
    });
    window.addEventListener('blur', () => this.#releaseAllPointers(), { signal });
    document.addEventListener(
      'visibilitychange',
      () => document.hidden && this.#releaseAllPointers(),
      { signal },
    );
  }

  #beginRound(): void {
    this.#clearTimers();
    this.#releaseAllPointers();
    this.#phase = 'countdown';
    this.#presses = [null, null];
    this.#signalAt = null;
    this.#remainingWait = reactionWaitMs(Math.random);
    this.#render();
    this.#setSignal('wait', 'WAIT');
    this.#setMessage('신호가 켜질 때까지 기다리세요. 먼저 누르면 부정 출발입니다.');
    this.#renderTimes();
    this.#services.setPhase('countdown', `라운드 ${String(this.#round)}. 신호를 기다리세요.`);
    this.#scheduleSignal(this.#remainingWait);
    this.#remainingWait = 0;
  }

  #scheduleSignal(wait: number): void {
    const dueAt = performance.now() + wait;
    this.#signalAt = dueAt;
    this.#signalTimer = window.setTimeout(() => {
      this.#signalTimer = 0;
      this.#signalAt = performance.now();
      this.#phase = 'playing';
      this.#setSignal('go', 'NOW!');
      this.#setMessage('지금 누르세요!');
      this.#services.audio.countdown(0);
      this.#services.setPhase('playing', '신호가 켜졌습니다. 지금 누르세요.');
      const vibrate = Reflect.get(navigator, 'vibrate');
      if (typeof vibrate === 'function') Reflect.apply(vibrate, navigator, [25]);
    }, wait);
  }

  #press(player: Player, pressedAt: number): void {
    if (
      this.#phase === 'countdown' ||
      (this.#phase === 'playing' && isFalseStart(this.#signalAt, pressedAt))
    ) {
      this.#setSignal('false', 'FALSE');
      this.#finishRound(player === 1 ? 2 : 1, `${this.#services.getPlayerName(player)} 부정 출발`);
      return;
    }
    if (this.#phase !== 'playing' || this.#signalAt === null) return;
    if (this.#presses[player - 1] !== null) return;
    this.#presses[player - 1] = pressedAt;
    this.#renderTimes();
    if (this.#presses[0] !== null && this.#presses[1] !== null) {
      this.#resolvePresses();
      return;
    }
    window.clearTimeout(this.#resolveTimer);
    this.#resolveDueAt = performance.now() + REACTION_RESOLVE_BUFFER_MS;
    this.#resolveTimer = window.setTimeout(() => {
      this.#resolveTimer = 0;
      this.#resolvePresses();
    }, REACTION_RESOLVE_BUFFER_MS);
  }

  #resolvePresses(): void {
    if (this.#phase !== 'playing' || this.#signalAt === null) return;
    const outcome = resolveReaction(this.#signalAt, this.#presses[0], this.#presses[1]);
    const detail =
      outcome.winner === 0
        ? '두 입력 차이가 8ms 이하여서 동점'
        : `${this.#services.getPlayerName(outcome.winner)} ${String(
            Math.round(outcome.winner === 1 ? (outcome.p1Time ?? 0) : (outcome.p2Time ?? 0)),
          )}ms`;
    this.#finishRound(outcome.winner, detail);
  }

  #finishRound(winner: 0 | 1 | 2, detail: string): void {
    this.#clearTimers();
    this.#releaseAllPointers();
    if (winner === 1) {
      this.#scores[0] += 1;
      this.#services.audio.score(winner);
    }
    if (winner === 2) {
      this.#scores[1] += 1;
      this.#services.audio.score(winner);
    }
    const champion = this.#scores.findIndex((score) => score >= REACTION_TARGET_SCORE);
    if (champion >= 0) {
      const player = (champion + 1) as Player;
      this.#phase = 'matchOver';
      this.#render();
      this.#setMessage(`${detail}. ${this.#services.getPlayerName(player)} 최종 승리!`);
      this.#services.complete({
        winner: player,
        headline: `${this.#services.getPlayerName(player)} 승리`,
        detail: `${detail} · 최종 ${String(this.#scores[0])} : ${String(this.#scores[1])}`,
        score: [...this.#scores],
      });
      return;
    }
    this.#phase = 'roundOver';
    this.#round += 1;
    this.#render();
    this.#setMessage(
      winner === 0
        ? `${detail}. 다음 라운드를 준비하세요.`
        : `${detail} 승리. 다음 라운드를 준비하세요.`,
    );
    this.#services.setPhase('roundOver', detail);
  }

  #render(): void {
    if (!this.#root) return;
    for (const player of [1, 2] as const) {
      const name = this.#services.getPlayerName(player);
      setText(queryRequired(this.#root, `[data-name="${String(player)}"]`), name);
      setText(queryRequired(this.#root, `[data-zone-name="${String(player)}"]`), name);
      setText(
        queryRequired(this.#root, `[data-score="${String(player)}"]`),
        this.#scores[player - 1] ?? 0,
      );
    }
    setText(queryRequired(this.#root, '[data-round]'), `ROUND ${String(this.#round)}`);
    this.#renderTimes();
  }

  #renderTimes(): void {
    if (!this.#root) return;
    for (const player of [1, 2] as const) {
      const press = this.#presses[player - 1] ?? null;
      const reaction =
        press !== null && this.#signalAt !== null ? Math.max(0, press - this.#signalAt) : null;
      setText(
        queryRequired(this.#root, `[data-time="${String(player)}"]`),
        `P${String(player)} ${reaction === null ? '—' : `${String(Math.round(reaction))}ms`}`,
      );
    }
  }

  #setSignal(mode: string, text: string): void {
    if (!this.#root) return;
    this.#root.dataset.signal = mode;
    setText(queryRequired(this.#root, '[data-signal-text]'), text);
  }

  #setMessage(message: string): void {
    if (!this.#root) return;
    setText(queryRequired(this.#root, '[data-message]'), message);
  }

  #eventTime(event: Event): number {
    const now = performance.now();
    return normalizeEventTimestamp(event.timeStamp, now, performance.timeOrigin);
  }

  #releasePointer(pointerId: number): void {
    const zone = this.#activePointers.get(pointerId);
    if (!zone) return;
    this.#activePointers.delete(pointerId);
    if (![...this.#activePointers.values()].includes(zone)) zone.dataset.pressed = 'false';
  }

  #releaseAllPointers(): void {
    const captures = [...this.#activePointers.entries()];
    this.#activePointers.clear();
    for (const [pointerId, zone] of captures) {
      zone.dataset.pressed = 'false';
      try {
        if (zone.hasPointerCapture(pointerId)) zone.releasePointerCapture(pointerId);
      } catch {
        // The pointer may have ended already or capture may be unsupported.
      }
    }
  }

  #clearTimers(): void {
    window.clearTimeout(this.#signalTimer);
    window.clearTimeout(this.#resolveTimer);
    this.#signalTimer = 0;
    this.#resolveTimer = 0;
    this.#resolveDueAt = 0;
    this.#remainingResolve = 0;
    this.#remainingWait = 0;
    this.#pauseStartedAt = 0;
    this.#pausedFrom = null;
  }
}

export function createGame(services: GameServices): MiniGameController {
  return new ReactionDuelController(services);
}
