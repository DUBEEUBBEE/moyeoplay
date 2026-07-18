import { createCanvasSurface, type CanvasSurface } from '../../core/canvas-scaler';
import { queryRequired, setText } from '../../core/dom';
import type { GamePhase, GameServices, MiniGameController } from '../../core/game-controller';
import { secureRandomIndex } from '../../core/seeded-random';
import {
  MAX_ROULETTE_ITEM_CHARACTERS,
  MAX_ROULETTE_ITEMS,
  MIN_ROULETTE_ITEMS,
  ROULETTE_FULL_TURN,
  createRouletteSpinPlan,
  normalizeRouletteItems,
  rouletteIndexAtPointer,
  rouletteRotationAtProgress,
  rouletteSliceAngle,
  truncateRouletteLabel,
  type RouletteSpinPlan,
} from './logic';
import './roulette.css';

const CANVAS_SIZE = 640;
const WHEEL_CENTER = CANVAS_SIZE / 2;
const WHEEL_RADIUS = 274;
const FULL_SPIN_DURATION_MS = 4_200;
const REDUCED_SPIN_DURATION_MS = 650;
const DEFAULT_ITEMS = [
  '설거지 담당',
  '간식 사기',
  '노래 한 소절',
  '인증샷 찍기',
  '다음 게임 선택',
  '행운! 면제',
] as const;
const WHEEL_COLORS = [
  '#3e8fbd',
  '#cf4f81',
  '#a675ff',
  '#d89739',
  '#278f82',
  '#d65d46',
  '#5678d3',
  '#9b6a35',
  '#7f5ac2',
  '#2b8d68',
  '#b64b69',
  '#427f9d',
] as const;

const STATIC_MARKUP = `
  <section class="roulette-game" data-phase="idle" aria-labelledby="roulette-title">
    <h2 class="roulette-game__sr-only" id="roulette-title">벌칙 룰렛</h2>
    <div class="roulette-layout">
      <section class="roulette-editor" aria-labelledby="roulette-editor-title">
        <div class="roulette-editor__head">
          <div>
            <span>EDIT ITEMS</span>
            <h3 id="roulette-editor-title">룰렛 항목</h3>
          </div>
          <output data-item-count aria-live="polite">6 / 12</output>
        </div>
        <fieldset data-editor-fieldset>
          <legend class="roulette-game__sr-only">동일한 확률로 추첨할 항목</legend>
          <div class="roulette-item-list" data-item-list></div>
        </fieldset>
        <div class="roulette-editor__actions">
          <button type="button" data-add-item>항목 추가</button>
          <button class="roulette-spin-button" type="button" data-spin>룰렛 돌리기</button>
        </div>
        <p>빈 항목은 안전한 기본값으로 바뀌고, 모든 칸은 같은 확률로 선택합니다.</p>
      </section>

      <section class="roulette-stage" aria-label="룰렛 실행 영역">
        <div class="roulette-canvas-shell">
          <canvas data-canvas role="img" aria-describedby="roulette-status" aria-label="6개 항목의 룰렛, 아직 돌리지 않음"></canvas>
          <span class="roulette-motion-label" data-motion-label aria-hidden="true">READY</span>
        </div>
        <p class="roulette-status" id="roulette-status" data-status role="status" aria-live="polite" aria-atomic="true">
          항목을 확인하고 공통 시작 버튼을 누르세요.
        </p>
        <section class="roulette-result" data-result hidden aria-label="룰렛 추첨 결과">
          <span>SELECTED</span>
          <strong data-result-text></strong>
          <p data-result-detail></p>
          <div>
            <button type="button" data-copy-result>결과 복사</button>
            <button class="roulette-respin-button" type="button" data-respin>다시 돌리기</button>
          </div>
        </section>
      </section>
    </div>
  </section>
`;

interface RouletteView {
  readonly root: HTMLElement;
  readonly editorFieldset: HTMLFieldSetElement;
  readonly itemCount: HTMLOutputElement;
  readonly itemList: HTMLElement;
  readonly addItemButton: HTMLButtonElement;
  readonly spinButton: HTMLButtonElement;
  readonly canvas: HTMLCanvasElement;
  readonly motionLabel: HTMLElement;
  readonly status: HTMLElement;
  readonly result: HTMLElement;
  readonly resultText: HTMLElement;
  readonly resultDetail: HTMLElement;
  readonly copyButton: HTMLButtonElement;
  readonly respinButton: HTMLButtonElement;
}

function getView(root: HTMLElement): RouletteView {
  return {
    root,
    editorFieldset: queryRequired(root, '[data-editor-fieldset]'),
    itemCount: queryRequired(root, '[data-item-count]'),
    itemList: queryRequired(root, '[data-item-list]'),
    addItemButton: queryRequired(root, '[data-add-item]'),
    spinButton: queryRequired(root, '[data-spin]'),
    canvas: queryRequired(root, '[data-canvas]'),
    motionLabel: queryRequired(root, '[data-motion-label]'),
    status: queryRequired(root, '[data-status]'),
    result: queryRequired(root, '[data-result]'),
    resultText: queryRequired(root, '[data-result-text]'),
    resultDetail: queryRequired(root, '[data-result-detail]'),
    copyButton: queryRequired(root, '[data-copy-result]'),
    respinButton: queryRequired(root, '[data-respin]'),
  };
}

class RouletteController implements MiniGameController {
  readonly #services: GameServices;
  #view: RouletteView | null = null;
  #surface: CanvasSurface | null = null;
  #listeners: AbortController | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #animationFrame: number | null = null;
  #phase: GamePhase = 'idle';
  #items: string[] = [...DEFAULT_ITEMS];
  #rotation = 0;
  #plan: RouletteSpinPlan | null = null;
  #selectedResult: string | null = null;
  #spinElapsedBeforeSegment = 0;
  #spinSegmentStartedAt = 0;
  #spinDuration = FULL_SPIN_DURATION_MS;
  #lastPointerIndex: number | null = null;
  #lastTickSoundAt = Number.NEGATIVE_INFINITY;
  #backdrop: CanvasGradient | null = null;

  constructor(services: GameServices) {
    this.#services = services;
  }

  mount(container: HTMLElement): void {
    this.destroy();
    // This is static source markup. User entries are assigned only through value,
    // textContent, setAttribute, and Canvas fillText below.
    container.innerHTML = STATIC_MARKUP;
    const root = queryRequired<HTMLElement>(container, '.roulette-game');
    this.#view = getView(root);
    this.#surface = createCanvasSurface(this.#view.canvas, CANVAS_SIZE, CANVAS_SIZE);
    this.#listeners = new AbortController();
    this.#spinDuration = this.#services.isReducedMotion()
      ? REDUCED_SPIN_DURATION_MS
      : FULL_SPIN_DURATION_MS;
    root.dataset.reducedMotion = String(this.#services.isReducedMotion());
    this.#bind(this.#listeners.signal);
    this.#renderEditors();
    this.#draw();

    if (typeof ResizeObserver !== 'undefined') {
      this.#resizeObserver = new ResizeObserver(() => {
        this.#surface?.resize();
        this.#draw();
      });
      this.#resizeObserver.observe(this.#view.canvas);
    }
  }

  enter(): void {
    this.#surface?.resize();
    this.#draw();
    this.#setStatus('2–12개 항목을 확인하고 시작하세요. 모든 항목의 확률은 같습니다.');
    this.#services.announce('벌칙 룰렛 준비 완료. 2개에서 12개 항목을 편집할 수 있습니다.');
  }

  start(): void {
    if (!this.#view || this.#phase === 'playing' || this.#phase === 'paused') return;
    const reducedMotion = this.#services.isReducedMotion();
    this.#spinDuration = reducedMotion ? REDUCED_SPIN_DURATION_MS : FULL_SPIN_DURATION_MS;
    this.#view.root.dataset.reducedMotion = String(reducedMotion);
    this.#readItemsFromInputs();
    this.#items = normalizeRouletteItems(this.#items);
    this.#syncInputValues();
    this.#cancelFrame();

    // createRouletteSpinPlan selects the secure random result before the first
    // animation frame and derives an exact destination angle from that index.
    this.#plan = createRouletteSpinPlan(
      this.#items.length,
      this.#rotation,
      secureRandomIndex,
      reducedMotion ? 0 : 6,
    );
    this.#selectedResult = this.#items[this.#plan.targetIndex] ?? null;
    this.#spinElapsedBeforeSegment = 0;
    this.#spinSegmentStartedAt = performance.now();
    this.#lastPointerIndex = rouletteIndexAtPointer(this.#rotation, this.#items.length);
    this.#lastTickSoundAt = Number.NEGATIVE_INFINITY;
    this.#phase = 'playing';
    this.#view.result.hidden = true;
    this.#view.motionLabel.textContent = 'SPIN';
    this.#setLocked(true);
    this.#setStatus('결과를 먼저 공정하게 선택했습니다. 룰렛이 정확한 칸으로 이동 중입니다.');
    this.#renderPhase();
    this.#services.setPhase(
      'playing',
      '룰렛을 돌리고 있습니다. 항목 편집은 일시적으로 잠겼습니다.',
    );
    this.#scheduleFrame();
  }

  pause(): void {
    if (this.#phase !== 'playing') return;
    const elapsed = this.#spinElapsedAt(performance.now());
    if (elapsed >= this.#spinDuration) {
      this.#finishSpin();
      return;
    }
    this.#spinElapsedBeforeSegment = elapsed;
    this.#phase = 'paused';
    this.#cancelFrame();
    if (this.#view) this.#view.motionLabel.textContent = 'PAUSE';
    this.#renderPhase();
    this.#setStatus('일시정지되었습니다. 결과와 항목은 그대로 잠겨 있습니다.');
    this.#services.setPhase('paused', '룰렛을 일시정지했습니다.');
  }

  resume(): void {
    if (this.#phase !== 'paused') return;
    this.#phase = 'playing';
    this.#spinSegmentStartedAt = performance.now();
    if (this.#view) this.#view.motionLabel.textContent = 'SPIN';
    this.#renderPhase();
    this.#setStatus('룰렛을 재개했습니다. 선택된 결과로 계속 이동합니다.');
    this.#services.setPhase('playing', '룰렛을 재개했습니다.');
    this.#scheduleFrame();
  }

  reset(): boolean {
    this.#cancelFrame();
    this.#phase = 'idle';
    this.#rotation = 0;
    this.#plan = null;
    this.#selectedResult = null;
    this.#spinElapsedBeforeSegment = 0;
    this.#lastPointerIndex = null;
    this.#lastTickSoundAt = Number.NEGATIVE_INFINITY;
    if (this.#view) {
      this.#view.result.hidden = true;
      this.#view.motionLabel.textContent = 'READY';
      this.#setLocked(false);
      this.#setStatus('항목은 유지했습니다. 시작 버튼을 누르면 새로 추첨합니다.');
      this.#renderPhase();
      this.#draw();
    }
    this.#services.setPhase('idle', '벌칙 룰렛을 다시 준비했습니다.');
    return true;
  }

  destroy(): void {
    this.#cancelFrame();
    this.#listeners?.abort();
    this.#listeners = null;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#view = null;
    this.#surface = null;
    this.#backdrop = null;
    this.#phase = 'idle';
    this.#plan = null;
    this.#selectedResult = null;
    this.#spinElapsedBeforeSegment = 0;
    this.#lastPointerIndex = null;
    this.#lastTickSoundAt = Number.NEGATIVE_INFINITY;
  }

  #bind(signal: AbortSignal): void {
    const view = this.#view;
    if (!view) return;

    view.itemList.addEventListener(
      'input',
      (event) => {
        if (this.#isLocked() || !(event.target instanceof HTMLInputElement)) return;
        const index = Number(event.target.dataset.itemIndex);
        if (!Number.isInteger(index) || index < 0 || index >= this.#items.length) return;
        this.#items[index] = event.target.value;
        this.#invalidateResult();
        this.#draw();
      },
      { signal },
    );

    view.itemList.addEventListener(
      'click',
      (event) => {
        if (this.#isLocked() || !(event.target instanceof Element)) return;
        const button = event.target.closest<HTMLButtonElement>('[data-remove-index]');
        if (!button || this.#items.length <= MIN_ROULETTE_ITEMS) return;
        this.#readItemsFromInputs();
        const index = Number(button.dataset.removeIndex);
        if (!Number.isInteger(index) || index < 0 || index >= this.#items.length) return;
        this.#items.splice(index, 1);
        this.#invalidateResult();
        this.#renderEditors();
        this.#draw();
      },
      { signal },
    );

    view.addItemButton.addEventListener(
      'click',
      () => {
        if (this.#isLocked() || this.#items.length >= MAX_ROULETTE_ITEMS) return;
        this.#readItemsFromInputs();
        this.#items.push(`벌칙 ${String(this.#items.length + 1)}`);
        this.#invalidateResult();
        this.#renderEditors();
        this.#draw();
        const inputs = view.itemList.querySelectorAll<HTMLInputElement>('input');
        inputs.item(inputs.length - 1).focus();
      },
      { signal },
    );

    view.spinButton.addEventListener('click', () => this.start(), { signal });
    view.respinButton.addEventListener('click', () => this.start(), { signal });
    view.copyButton.addEventListener('click', () => void this.#copyResult(), { signal });
    window.addEventListener(
      'resize',
      () => {
        this.#surface?.resize();
        this.#draw();
      },
      { signal },
    );
  }

  #renderEditors(): void {
    const view = this.#view;
    if (!view) return;
    view.itemList.replaceChildren();
    const fragment = document.createDocumentFragment();
    this.#items.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'roulette-item-row';

      const number = document.createElement('span');
      number.textContent = String(index + 1).padStart(2, '0');
      number.setAttribute('aria-hidden', 'true');

      const label = document.createElement('label');
      label.className = 'roulette-game__sr-only';
      label.htmlFor = `roulette-item-${String(index)}`;
      label.textContent = `룰렛 항목 ${String(index + 1)}`;

      const input = document.createElement('input');
      input.id = `roulette-item-${String(index)}`;
      input.type = 'text';
      input.maxLength = MAX_ROULETTE_ITEM_CHARACTERS;
      input.autocomplete = 'off';
      input.dataset.itemIndex = String(index);
      input.value = item;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.removeIndex = String(index);
      remove.textContent = '−';
      remove.setAttribute('aria-label', `${String(index + 1)}번 룰렛 항목 삭제`);
      remove.disabled = this.#items.length <= MIN_ROULETTE_ITEMS;

      row.append(number, label, input, remove);
      fragment.append(row);
    });
    view.itemList.append(fragment);
    setText(view.itemCount, `${String(this.#items.length)} / ${String(MAX_ROULETTE_ITEMS)}`);
    this.#setLocked(this.#isLocked());
  }

  #readItemsFromInputs(): void {
    if (!this.#view) return;
    this.#items = [...this.#view.itemList.querySelectorAll<HTMLInputElement>('input')].map(
      (input) => input.value,
    );
  }

  #syncInputValues(): void {
    if (!this.#view) return;
    const inputs = this.#view.itemList.querySelectorAll<HTMLInputElement>('input');
    this.#items.forEach((item, index) => {
      inputs.item(index).value = item;
    });
  }

  #displayItems(): string[] {
    return normalizeRouletteItems(this.#items);
  }

  #invalidateResult(): void {
    if (this.#phase !== 'matchOver') return;
    this.#selectedResult = null;
    this.#plan = null;
    this.#phase = 'idle';
    if (this.#view) {
      this.#view.result.hidden = true;
      this.#view.motionLabel.textContent = 'READY';
    }
    this.#renderPhase();
    this.#services.setPhase('idle', '항목이 바뀌어 새로운 추첨을 준비했습니다.');
  }

  #isLocked(): boolean {
    return this.#phase === 'playing' || this.#phase === 'paused';
  }

  #setLocked(locked: boolean): void {
    const view = this.#view;
    if (!view) return;
    view.root.dataset.locked = String(locked);
    view.editorFieldset.disabled = locked;
    view.addItemButton.disabled = locked || this.#items.length >= MAX_ROULETTE_ITEMS;
    view.spinButton.disabled = locked;
    view.respinButton.disabled = locked;
    for (const button of view.itemList.querySelectorAll<HTMLButtonElement>('[data-remove-index]')) {
      button.disabled = locked || this.#items.length <= MIN_ROULETTE_ITEMS;
    }
  }

  #spinElapsedAt(now: number): number {
    if (this.#phase !== 'playing')
      return Math.min(this.#spinElapsedBeforeSegment, this.#spinDuration);
    return Math.min(
      this.#spinDuration,
      this.#spinElapsedBeforeSegment + Math.max(0, now - this.#spinSegmentStartedAt),
    );
  }

  #scheduleFrame(): void {
    this.#cancelFrame();
    this.#animationFrame = requestAnimationFrame((timestamp) => this.#onFrame(timestamp));
  }

  #onFrame(timestamp: number): void {
    this.#animationFrame = null;
    if (this.#phase !== 'playing' || !this.#plan) return;
    const elapsed = this.#spinElapsedAt(timestamp);
    const progress = elapsed / this.#spinDuration;
    this.#rotation = rouletteRotationAtProgress(this.#plan, progress);
    const pointerIndex = rouletteIndexAtPointer(this.#rotation, this.#items.length);
    if (
      this.#lastPointerIndex !== null &&
      pointerIndex !== this.#lastPointerIndex &&
      timestamp - this.#lastTickSoundAt >= 45
    ) {
      this.#services.audio.hit(0.16);
      this.#lastTickSoundAt = timestamp;
    }
    this.#lastPointerIndex = pointerIndex;
    this.#draw();

    if (progress >= 1) {
      this.#finishSpin();
      return;
    }
    this.#animationFrame = requestAnimationFrame((nextTimestamp) => this.#onFrame(nextTimestamp));
  }

  #finishSpin(): void {
    if (this.#phase !== 'playing' || !this.#plan || this.#selectedResult === null) return;
    this.#cancelFrame();
    this.#spinElapsedBeforeSegment = this.#spinDuration;
    // Assign the planned destination verbatim so the visual result never stops
    // at an easing approximation near an adjacent slice.
    this.#rotation = this.#plan.finalRotation;
    this.#phase = 'matchOver';
    this.#lastPointerIndex = this.#plan.targetIndex;
    this.#setLocked(false);
    this.#renderPhase();
    this.#draw();

    const itemCount = this.#items.length;
    const result = this.#selectedResult;
    if (this.#view) {
      setText(this.#view.resultText, result);
      setText(
        this.#view.resultDetail,
        `${String(itemCount)}개 항목 중 1 / ${String(itemCount)} 동일 확률로 선택`,
      );
      this.#view.result.hidden = false;
      this.#view.motionLabel.textContent = 'DONE';
      this.#view.canvas.setAttribute('aria-label', `룰렛 결과: ${result}`);
    }
    this.#setStatus(`선택 결과는 ${result}입니다.`);
    this.#services.complete({
      winner: 0,
      headline: `룰렛 결과: ${result}`,
      detail: `${String(itemCount)}개 항목 중 각 1 / ${String(itemCount)} 확률로 선택`,
    });
  }

  #renderPhase(): void {
    if (this.#view) this.#view.root.dataset.phase = this.#phase;
  }

  #draw(): void {
    const surface = this.#surface;
    const view = this.#view;
    if (!surface || !view) return;
    const context = surface.context;
    const items = this.#displayItems();
    const slice = rouletteSliceAngle(items.length);
    const highlight = this.#phase === 'matchOver' ? this.#plan?.targetIndex : undefined;

    context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    if (!this.#backdrop) {
      this.#backdrop = context.createRadialGradient(
        WHEEL_CENTER,
        WHEEL_CENTER,
        30,
        WHEEL_CENTER,
        WHEEL_CENTER,
        WHEEL_CENTER,
      );
      this.#backdrop.addColorStop(0, '#122b43');
      this.#backdrop.addColorStop(1, '#06111e');
    }
    context.fillStyle = this.#backdrop;
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    context.save();
    context.translate(WHEEL_CENTER, WHEEL_CENTER);
    context.rotate(this.#rotation);
    for (let index = 0; index < items.length; index += 1) {
      const startAngle = -Math.PI / 2 - slice / 2 + index * slice;
      const endAngle = startAngle + slice;
      context.beginPath();
      context.moveTo(0, 0);
      context.arc(0, 0, WHEEL_RADIUS, startAngle, endAngle);
      context.closePath();
      context.fillStyle = WHEEL_COLORS[index % WHEEL_COLORS.length] ?? '#3e8fbd';
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,.34)';
      context.lineWidth = 2;
      context.stroke();

      if (highlight === index) {
        context.save();
        context.beginPath();
        context.moveTo(0, 0);
        context.arc(0, 0, WHEEL_RADIUS - 4, startAngle, endAngle);
        context.closePath();
        context.strokeStyle = '#ffd447';
        context.lineWidth = 9;
        context.shadowColor = '#ffd447';
        context.shadowBlur = 18;
        context.stroke();
        context.restore();
      }

      const middleAngle = startAngle + slice / 2;
      context.save();
      context.rotate(middleAngle);
      context.translate(WHEEL_RADIUS * 0.62, 0);
      context.rotate(Math.PI / 2);
      if (Math.sin(middleAngle + this.#rotation) > 0) context.rotate(Math.PI);
      context.fillStyle = '#fff';
      context.font = `800 ${items.length <= 6 ? '21' : items.length <= 9 ? '17' : '14'}px system-ui, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.shadowColor = 'rgba(0,0,0,.45)';
      context.shadowBlur = 4;
      const maxCharacters = items.length <= 6 ? 16 : items.length <= 9 ? 12 : 9;
      context.fillText(truncateRouletteLabel(items[index] ?? '', maxCharacters), 0, 0);
      context.restore();
    }

    context.beginPath();
    context.arc(0, 0, 55, 0, ROULETTE_FULL_TURN);
    context.fillStyle = '#091827';
    context.shadowColor = 'rgba(0,0,0,.55)';
    context.shadowBlur = 18;
    context.fill();
    context.shadowBlur = 0;
    context.lineWidth = 6;
    context.strokeStyle = '#e8edf3';
    context.stroke();
    context.fillStyle = '#ffd447';
    context.font = '900 16px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('모여 PLAY', 0, 1);
    context.restore();

    context.save();
    context.beginPath();
    context.moveTo(WHEEL_CENTER - 25, 22);
    context.lineTo(WHEEL_CENTER + 25, 22);
    context.lineTo(WHEEL_CENTER, 79);
    context.closePath();
    context.fillStyle = '#ffd447';
    context.shadowColor = 'rgba(255,212,71,.6)';
    context.shadowBlur = 18;
    context.fill();
    context.lineWidth = 5;
    context.strokeStyle = '#07111d';
    context.stroke();
    context.restore();

    if (this.#phase !== 'matchOver') {
      view.canvas.setAttribute(
        'aria-label',
        `${String(items.length)}개 항목의 동일 확률 룰렛, ${this.#phase === 'playing' ? '회전 중' : this.#phase === 'paused' ? '일시정지' : '아직 돌리지 않음'}`,
      );
    }
  }

  async #copyResult(): Promise<void> {
    const result = this.#selectedResult;
    if (!result) return;
    const text = `벌칙 룰렛 결과: ${result}`;
    try {
      const clipboard = Reflect.get(navigator, 'clipboard') as
        Pick<Clipboard, 'writeText'> | undefined;
      if (clipboard && typeof clipboard.writeText === 'function') {
        await clipboard.writeText(text);
      } else if (!this.#copyWithTemporaryInput(text)) {
        throw new Error('Clipboard API is unavailable');
      }
      this.#setStatus(`결과 “${result}”을 클립보드에 복사했습니다.`);
      this.#services.announce('룰렛 결과를 복사했습니다.');
    } catch {
      if (this.#copyWithTemporaryInput(text)) {
        this.#setStatus(`결과 “${result}”을 클립보드에 복사했습니다.`);
        this.#services.announce('룰렛 결과를 복사했습니다.');
      } else {
        this.#view?.resultText.setAttribute('tabindex', '0');
        this.#view?.resultText.focus();
        this.#setStatus('결과를 복사하지 못했습니다. 결과 텍스트를 길게 눌러 복사해 주세요.');
        this.#services.announce('결과 텍스트에 포커스를 옮겼습니다. 직접 선택해 주세요.');
      }
    }
  }

  #copyWithTemporaryInput(value: string): boolean {
    const root = this.#view?.root;
    const legacyDocument = document as unknown as {
      execCommand?: (command: string) => boolean;
    };
    if (!root || typeof legacyDocument.execCommand !== 'function') return false;
    const input = document.createElement('textarea');
    input.value = value;
    input.readOnly = true;
    input.setAttribute('aria-hidden', 'true');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    root.append(input);
    input.select();
    try {
      return legacyDocument.execCommand('copy');
    } catch {
      return false;
    } finally {
      input.remove();
    }
  }

  #setStatus(message: string): void {
    if (this.#view) setText(this.#view.status, message);
  }

  #cancelFrame(): void {
    if (this.#animationFrame !== null) cancelAnimationFrame(this.#animationFrame);
    this.#animationFrame = null;
  }
}

export function createGame(services: GameServices): MiniGameController {
  return new RouletteController(services);
}
