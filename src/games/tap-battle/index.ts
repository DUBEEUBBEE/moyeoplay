import { queryRequired, setText } from '../../core/dom';
import type { GamePhase, GameServices, MiniGameController } from '../../core/game-controller';
import { bindActivationRepeatGuard } from '../../core/input-manager';
import {
  DEFAULT_TAP_DURATION_SECONDS,
  countTap,
  isTapDuration,
  playerForTapKey,
  registerPointerDown,
  releasePointer,
  remainingMilliseconds,
  resolveTapBattle,
  tapGaugePercent,
  tapsPerSecond,
  type TapCounts,
  type TapDurationSeconds,
  type TapPlayer,
} from './logic';
import './tap-battle.css';

const STATIC_MARKUP = `
  <section class="tap-battle" data-phase="idle" aria-labelledby="tap-battle-title">
    <h2 class="tap-battle__sr-only" id="tap-battle-title">탭 배틀</h2>

    <header class="tap-battle__scoreboard" aria-label="실시간 탭 점수">
      <article class="tap-battle__player tap-battle__player--one">
        <span class="tap-battle__name" data-name="1">PLAYER 1</span>
        <strong class="tap-battle__count" data-count="1">0</strong>
        <span class="tap-battle__rate"><b data-rate="1">0.0</b> TPS</span>
      </article>
      <div class="tap-battle__clock" aria-label="남은 시간">
        <span>TIME</span>
        <strong data-time>10.0</strong>
        <small>SECONDS</small>
      </div>
      <article class="tap-battle__player tap-battle__player--two">
        <span class="tap-battle__name" data-name="2">PLAYER 2</span>
        <strong class="tap-battle__count" data-count="2">0</strong>
        <span class="tap-battle__rate"><b data-rate="2">0.0</b> TPS</span>
      </article>
    </header>

    <div class="tap-battle__toolbar">
      <label for="tap-duration">경기 시간</label>
      <select id="tap-duration" data-duration aria-describedby="tap-duration-help">
        <option value="5">5초</option>
        <option value="10" selected>10초</option>
        <option value="15">15초</option>
      </select>
      <span id="tap-duration-help">시작하면 시간이 잠깁니다.</span>
    </div>

    <div class="tap-battle__gauge" data-gauge role="img" aria-label="현재 탭 수가 같습니다">
      <span class="tap-battle__gauge-one" data-gauge-one></span>
      <i aria-hidden="true"></i>
      <span class="tap-battle__gauge-two" data-gauge-two></span>
    </div>

    <div class="tap-battle__arena" aria-label="플레이어별 독립 탭 영역">
      <button class="tap-battle__zone tap-battle__zone--one" type="button" data-zone="1" aria-describedby="tap-battle-status">
        <span class="tap-battle__key" aria-hidden="true">F</span>
        <strong data-zone-name="1">PLAYER 1</strong>
        <span>이 영역을 빠르게 연타</span>
        <b data-zone-count="1">0 TAP</b>
      </button>
      <button class="tap-battle__zone tap-battle__zone--two" type="button" data-zone="2" aria-describedby="tap-battle-status">
        <span class="tap-battle__key" aria-hidden="true">J</span>
        <strong data-zone-name="2">PLAYER 2</strong>
        <span>이 영역을 빠르게 연타</span>
        <b data-zone-count="2">0 TAP</b>
      </button>
    </div>

    <p class="tap-battle__status" id="tap-battle-status" data-status role="status" aria-live="polite" aria-atomic="true">
      10초를 확인하고 공통 시작 버튼을 눌러 주세요.
    </p>
    <section class="tap-battle__result" data-result hidden aria-label="탭 배틀 최종 결과">
      <span>FINAL RESULT</span>
      <strong data-result-title></strong>
      <p data-result-detail></p>
    </section>
  </section>
`;

interface TapBattleView {
  readonly root: HTMLElement;
  readonly duration: HTMLSelectElement;
  readonly time: HTMLElement;
  readonly status: HTMLElement;
  readonly gauge: HTMLElement;
  readonly gaugeOne: HTMLElement;
  readonly gaugeTwo: HTMLElement;
  readonly names: readonly [HTMLElement, HTMLElement];
  readonly zoneNames: readonly [HTMLElement, HTMLElement];
  readonly counts: readonly [HTMLElement, HTMLElement];
  readonly zoneCounts: readonly [HTMLElement, HTMLElement];
  readonly rates: readonly [HTMLElement, HTMLElement];
  readonly zones: readonly [HTMLButtonElement, HTMLButtonElement];
  readonly result: HTMLElement;
  readonly resultTitle: HTMLElement;
  readonly resultDetail: HTMLElement;
}

function getView(root: HTMLElement): TapBattleView {
  return {
    root,
    duration: queryRequired(root, '[data-duration]'),
    time: queryRequired(root, '[data-time]'),
    status: queryRequired(root, '[data-status]'),
    gauge: queryRequired(root, '[data-gauge]'),
    gaugeOne: queryRequired(root, '[data-gauge-one]'),
    gaugeTwo: queryRequired(root, '[data-gauge-two]'),
    names: [queryRequired(root, '[data-name="1"]'), queryRequired(root, '[data-name="2"]')],
    zoneNames: [
      queryRequired(root, '[data-zone-name="1"]'),
      queryRequired(root, '[data-zone-name="2"]'),
    ],
    counts: [queryRequired(root, '[data-count="1"]'), queryRequired(root, '[data-count="2"]')],
    zoneCounts: [
      queryRequired(root, '[data-zone-count="1"]'),
      queryRequired(root, '[data-zone-count="2"]'),
    ],
    rates: [queryRequired(root, '[data-rate="1"]'), queryRequired(root, '[data-rate="2"]')],
    zones: [queryRequired(root, '[data-zone="1"]'), queryRequired(root, '[data-zone="2"]')],
    result: queryRequired(root, '[data-result]'),
    resultTitle: queryRequired(root, '[data-result-title]'),
    resultDetail: queryRequired(root, '[data-result-detail]'),
  };
}

class TapBattleController implements MiniGameController {
  readonly #services: GameServices;
  #view: TapBattleView | null = null;
  #listeners: AbortController | null = null;
  #animationFrame: number | null = null;
  #phase: GamePhase = 'idle';
  #duration: TapDurationSeconds = DEFAULT_TAP_DURATION_SECONDS;
  #counts: TapCounts = [0, 0];
  #elapsedBeforeSegment = 0;
  #segmentStartedAt = 0;
  #activePointerIds: ReadonlySet<number> = new Set();
  readonly #pointerZones = new Map<number, HTMLButtonElement>();
  #lastAudioHitAt = Number.NEGATIVE_INFINITY;

  constructor(services: GameServices) {
    this.#services = services;
  }

  mount(container: HTMLElement): void {
    this.destroy();
    // The markup is a source constant. Player names and all changing values use textContent.
    container.innerHTML = STATIC_MARKUP;
    const root = queryRequired<HTMLElement>(container, '.tap-battle');
    this.#view = getView(root);
    this.#listeners = new AbortController();
    root.dataset.reducedMotion = String(this.#services.isReducedMotion());
    this.#bind(this.#listeners.signal);
    this.#renderNames();
    this.#render(0);
  }

  enter(): void {
    if (!this.#view) return;
    this.#setStatus(`${String(this.#duration)}초 동안 F와 J 또는 화면 양쪽을 연타하세요.`);
    this.#services.announce('탭 배틀 준비 완료. F와 J 키 또는 화면의 두 독립 영역을 사용합니다.');
  }

  start(): void {
    if (!this.#view || this.#phase === 'playing' || this.#phase === 'paused') return;
    this.#renderNames();
    this.#cancelFrame();
    this.#releaseAllPointers();
    this.#counts = [0, 0];
    this.#lastAudioHitAt = Number.NEGATIVE_INFINITY;
    this.#elapsedBeforeSegment = 0;
    this.#segmentStartedAt = performance.now();
    this.#phase = 'playing';
    this.#view.result.hidden = true;
    this.#setLocked(true);
    this.#setStatus('시작! 각자 자신의 키나 화면 영역을 최대한 빠르게 연타하세요.');
    this.#render(0);
    this.#services.audio.countdown(0);
    this.#services.setPhase('playing', `${String(this.#duration)}초 탭 배틀이 시작되었습니다.`);
    this.#scheduleFrame();
  }

  pause(): void {
    if (this.#phase !== 'playing') return;
    const elapsed = this.#elapsedAt(performance.now());
    if (elapsed >= this.#durationMilliseconds()) {
      this.#finish();
      return;
    }
    this.#elapsedBeforeSegment = elapsed;
    this.#phase = 'paused';
    this.#cancelFrame();
    this.#releaseAllPointers();
    this.#render(elapsed);
    this.#setStatus('일시정지되었습니다. 계속하기 전까지 탭은 집계되지 않습니다.');
    this.#services.setPhase('paused', '탭 배틀이 일시정지되었습니다.');
  }

  resume(): void {
    if (this.#phase !== 'paused') return;
    this.#renderNames();
    this.#phase = 'playing';
    this.#segmentStartedAt = performance.now();
    this.#render(this.#elapsedBeforeSegment);
    this.#setStatus('경기를 재개했습니다. 다시 연타하세요!');
    this.#services.setPhase('playing', '탭 배틀을 재개했습니다.');
    this.#scheduleFrame();
  }

  reset(): boolean {
    this.#cancelFrame();
    this.#releaseAllPointers();
    this.#phase = 'idle';
    this.#counts = [0, 0];
    this.#lastAudioHitAt = Number.NEGATIVE_INFINITY;
    this.#elapsedBeforeSegment = 0;
    if (this.#view) {
      this.#renderNames();
      this.#view.result.hidden = true;
      this.#setLocked(false);
      this.#setStatus(`${String(this.#duration)}초를 확인하고 공통 시작 버튼을 눌러 주세요.`);
      this.#render(0);
    }
    this.#services.setPhase('idle', '탭 배틀을 처음 상태로 되돌렸습니다.');
    return true;
  }

  destroy(): void {
    this.#cancelFrame();
    this.#releaseAllPointers();
    this.#listeners?.abort();
    this.#listeners = null;
    this.#view = null;
    this.#phase = 'idle';
    this.#counts = [0, 0];
    this.#lastAudioHitAt = Number.NEGATIVE_INFINITY;
    this.#elapsedBeforeSegment = 0;
  }

  #bind(signal: AbortSignal): void {
    const view = this.#view;
    if (!view) return;

    view.duration.addEventListener(
      'change',
      () => {
        const duration = Number(view.duration.value);
        if (!isTapDuration(duration) || this.#phase === 'playing' || this.#phase === 'paused') {
          view.duration.value = String(this.#duration);
          return;
        }
        this.#duration = duration;
        if (this.#phase === 'matchOver') {
          this.#phase = 'idle';
          this.#counts = [0, 0];
          this.#elapsedBeforeSegment = 0;
          view.result.hidden = true;
          this.#services.setPhase('idle', '새 경기 시간을 선택했습니다.');
        }
        this.#render(0);
        this.#setStatus(`${String(duration)}초 경기로 설정했습니다. 시작 버튼을 눌러 주세요.`);
      },
      { signal },
    );

    window.addEventListener(
      'keydown',
      (event) => {
        const player = playerForTapKey(event.code, event.repeat);
        if (player === null) return;
        if (this.#tap(player, performance.now())) event.preventDefault();
      },
      { signal },
    );

    view.zones.forEach((zone, index) => {
      const player = (index + 1) as TapPlayer;
      bindActivationRepeatGuard(zone, signal);
      zone.addEventListener(
        'pointerdown',
        (event) => {
          if (this.#phase !== 'playing') return;
          const registration = registerPointerDown(this.#activePointerIds, event.pointerId);
          if (!registration.accepted) return;
          if (!this.#tap(player, performance.now())) return;
          this.#activePointerIds = registration.activePointerIds;
          this.#pointerZones.set(event.pointerId, zone);
          zone.dataset.pressed = 'true';
          try {
            zone.setPointerCapture(event.pointerId);
          } catch {
            // Pointer capture is an optional enhancement; pointer-id tracking still de-duplicates.
          }
          event.preventDefault();
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
          // Pointer clicks were already counted on pointerdown. A zero-detail
          // activation comes from keyboard Enter/Space and counts once here.
          if (event.detail === 0 && this.#tap(player, performance.now())) event.preventDefault();
        },
        { signal },
      );
    });

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

  #tap(player: TapPlayer, now: number): boolean {
    if (this.#phase !== 'playing') return false;
    if (this.#elapsedAt(now) >= this.#durationMilliseconds()) {
      this.#finish();
      return false;
    }
    this.#counts = countTap(this.#counts, player);
    // Count every valid tap, but coalesce its sound so rapid two-player bursts do
    // not allocate an oscillator/gain pair for every individual pointer event.
    if (now - this.#lastAudioHitAt >= 40) {
      this.#lastAudioHitAt = now;
      this.#services.audio.hit(0.32);
    }
    this.#renderScores(this.#elapsedAt(now));
    return true;
  }

  #durationMilliseconds(): number {
    return this.#duration * 1_000;
  }

  #elapsedAt(now: number): number {
    if (this.#phase !== 'playing')
      return Math.min(this.#elapsedBeforeSegment, this.#durationMilliseconds());
    return Math.min(
      this.#durationMilliseconds(),
      this.#elapsedBeforeSegment + Math.max(0, now - this.#segmentStartedAt),
    );
  }

  #scheduleFrame(): void {
    this.#cancelFrame();
    this.#animationFrame = requestAnimationFrame((timestamp) => this.#onFrame(timestamp));
  }

  #onFrame(timestamp: number): void {
    this.#animationFrame = null;
    if (this.#phase !== 'playing') return;
    const elapsed = this.#elapsedAt(timestamp);
    this.#renderTime(elapsed);
    this.#renderRates(elapsed);
    if (elapsed >= this.#durationMilliseconds()) {
      this.#finish();
      return;
    }
    this.#animationFrame = requestAnimationFrame((nextTimestamp) => this.#onFrame(nextTimestamp));
  }

  #finish(): void {
    if (this.#phase !== 'playing') return;
    this.#cancelFrame();
    this.#releaseAllPointers();
    this.#elapsedBeforeSegment = this.#durationMilliseconds();
    this.#phase = 'matchOver';
    this.#setLocked(false);
    this.#render(this.#durationMilliseconds());

    const outcome = resolveTapBattle(this.#counts, this.#duration);
    const playerOne = this.#playerName(1);
    const playerTwo = this.#playerName(2);
    const headline =
      outcome.winner === 0 ? '완벽한 무승부' : `${this.#playerName(outcome.winner)} 승리`;
    const detail =
      `${playerOne} ${String(outcome.counts[0])}회 (${outcome.tapsPerSecond[0].toFixed(1)} TPS) · ` +
      `${playerTwo} ${String(outcome.counts[1])}회 (${outcome.tapsPerSecond[1].toFixed(1)} TPS)`;
    this.#showResult(headline, detail);
    this.#services.complete({
      winner: outcome.winner,
      headline,
      detail,
      score: [...outcome.counts],
    });
  }

  #render(elapsed: number): void {
    const view = this.#view;
    if (!view) return;
    view.root.dataset.phase = this.#phase;
    this.#renderScores(elapsed);
    this.#renderTime(elapsed);
  }

  #renderScores(elapsed: number): void {
    const view = this.#view;
    if (!view) return;
    for (const player of [1, 2] as const) {
      const index = player === 1 ? 0 : 1;
      const count = this.#counts[index];
      setText(view.counts[index], count);
      setText(view.zoneCounts[index], `${String(count)} TAP`);
      view.zones[index].setAttribute(
        'aria-label',
        `${this.#playerName(player)} 탭 영역, 현재 ${String(count)}회`,
      );
    }
    this.#renderRates(elapsed);

    const p1Percent = tapGaugePercent(this.#counts);
    view.gaugeOne.style.width = `${p1Percent.toFixed(3)}%`;
    view.gaugeTwo.style.width = `${(100 - p1Percent).toFixed(3)}%`;
    const gaugeLabel =
      this.#counts[0] === this.#counts[1]
        ? `현재 ${String(this.#counts[0])} 대 ${String(this.#counts[1])}, 같은 탭 수`
        : `현재 ${String(this.#counts[0])} 대 ${String(this.#counts[1])}`;
    view.gauge.setAttribute('aria-label', gaugeLabel);
  }

  #renderRates(elapsed: number): void {
    const view = this.#view;
    if (!view) return;
    for (const player of [1, 2] as const) {
      const index = player === 1 ? 0 : 1;
      setText(view.rates[index], tapsPerSecond(this.#counts[index], elapsed).toFixed(1));
    }
  }

  #renderTime(elapsed: number): void {
    if (!this.#view) return;
    const remaining = remainingMilliseconds(this.#duration, elapsed);
    setText(this.#view.time, (remaining / 1_000).toFixed(1));
  }

  #renderNames(): void {
    const view = this.#view;
    if (!view) return;
    for (const player of [1, 2] as const) {
      const index = player === 1 ? 0 : 1;
      const name = this.#playerName(player);
      setText(view.names[index], name);
      setText(view.zoneNames[index], name);
    }
  }

  #playerName(player: TapPlayer): string {
    return this.#services.getPlayerName(player).trim() || `PLAYER ${String(player)}`;
  }

  #setLocked(locked: boolean): void {
    if (!this.#view) return;
    this.#view.duration.disabled = locked;
    this.#view.root.dataset.locked = String(locked);
  }

  #setStatus(message: string): void {
    if (this.#view) setText(this.#view.status, message);
  }

  #showResult(headline: string, detail: string): void {
    if (!this.#view) return;
    setText(this.#view.resultTitle, headline);
    setText(this.#view.resultDetail, detail);
    this.#view.result.hidden = false;
    this.#setStatus(
      `${headline}. 최종 점수 ${String(this.#counts[0])} 대 ${String(this.#counts[1])}.`,
    );
  }

  #releasePointer(pointerId: number): void {
    this.#activePointerIds = releasePointer(this.#activePointerIds, pointerId);
    const zone = this.#pointerZones.get(pointerId);
    this.#pointerZones.delete(pointerId);
    if (zone && ![...this.#pointerZones.values()].includes(zone)) zone.dataset.pressed = 'false';
  }

  #releaseAllPointers(): void {
    const captures = [...this.#pointerZones.entries()];
    this.#activePointerIds = new Set();
    this.#pointerZones.clear();
    for (const [pointerId, zone] of captures) {
      zone.dataset.pressed = 'false';
      try {
        if (zone.hasPointerCapture(pointerId)) zone.releasePointerCapture(pointerId);
      } catch {
        // The pointer may already have ended or the element may be detached.
      }
    }
  }

  #cancelFrame(): void {
    if (this.#animationFrame !== null) cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = null;
  }
}

export function createGame(services: GameServices): MiniGameController {
  return new TapBattleController(services);
}
