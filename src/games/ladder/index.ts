import { createCanvasSurface, type CanvasSurface } from '../../core/canvas-scaler';
import { clamp, queryRequired, setText } from '../../core/dom';
import type { GamePhase, GameServices, MiniGameController } from '../../core/game-controller';
import {
  MAX_PARTICIPANTS,
  MIN_PARTICIPANTS,
  generateLadder,
  normalizeEntries,
  shuffleEntries,
  traceLadder,
  type LadderLayout,
} from './logic';

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 620;
const TOP_Y = 94;
const BOTTOM_Y = 526;
const PALETTE = [
  '#45e4e0',
  '#ff5d9e',
  '#ffd447',
  '#a675ff',
  '#58e6a9',
  '#ff8c55',
  '#75a8ff',
  '#f38cff',
] as const;
const DEFAULT_OUTCOMES = [
  '면제',
  '커피 사기',
  '간식 사기',
  '저녁 사기',
  '설거지',
  '노래 부르기',
  '다시 뽑기',
  '꽝',
] as const;

const STATIC_MARKUP = `
  <style>
    .ladder-game {
      --ladder-panel: rgba(10, 25, 42, .88);
      --ladder-line: rgba(255, 255, 255, .13);
      display: grid;
      gap: 16px;
      width: min(100%, 1120px);
      margin-inline: auto;
      color: #f6fbff;
    }
    .ladder-game *, .ladder-game *::before, .ladder-game *::after { box-sizing: border-box; }
    .ladder-setup {
      display: grid;
      gap: 14px;
      padding: clamp(14px, 2.2vw, 22px);
      border: 1px solid var(--ladder-line);
      border-radius: 18px;
      background: var(--ladder-panel);
    }
    .ladder-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }
    .ladder-count-control { display: inline-flex; align-items: center; gap: 9px; }
    .ladder-count-control output {
      min-width: 3.4rem;
      text-align: center;
      font-weight: 900;
      font-variant-numeric: tabular-nums;
    }
    .ladder-game button, .ladder-game input {
      min-height: 44px;
      border-radius: 11px;
      font: inherit;
    }
    .ladder-game button {
      border: 1px solid rgba(255, 255, 255, .16);
      padding: 9px 14px;
      color: #f7fbff;
      background: rgba(255, 255, 255, .07);
      cursor: pointer;
      touch-action: manipulation;
    }
    .ladder-game button:hover:not(:disabled) { border-color: rgba(88, 230, 169, .72); background: rgba(88, 230, 169, .12); }
    .ladder-game button:focus-visible, .ladder-game input:focus-visible { outline: 3px solid #ffd447; outline-offset: 2px; }
    .ladder-game button:disabled, .ladder-game input:disabled { cursor: not-allowed; opacity: .48; }
    .ladder-count-control button { width: 44px; padding: 0; font-size: 1.25rem; font-weight: 900; }
    .ladder-editors { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .ladder-editors fieldset {
      min-width: 0;
      margin: 0;
      padding: 12px;
      border: 1px solid var(--ladder-line);
      border-radius: 14px;
    }
    .ladder-editors legend { padding-inline: 5px; color: #bcd0df; font-size: .83rem; font-weight: 800; }
    .ladder-input-list { display: grid; gap: 8px; }
    .ladder-input-row { display: grid; grid-template-columns: 2rem minmax(0, 1fr); align-items: center; gap: 7px; }
    .ladder-input-row span { color: #91a8b9; text-align: center; font-size: .78rem; font-weight: 800; }
    .ladder-game input {
      width: 100%;
      min-width: 0;
      border: 1px solid rgba(255, 255, 255, .16);
      padding: 9px 11px;
      color: #f7fbff;
      background: rgba(2, 12, 23, .68);
    }
    .ladder-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .ladder-actions [data-action="generate"] { border-color: rgba(88, 230, 169, .55); background: rgba(88, 230, 169, .16); font-weight: 900; }
    .ladder-seed { margin: 0; color: #8fa8ba; font-size: .75rem; overflow-wrap: anywhere; }
    .ladder-stage {
      position: relative;
      overflow: hidden;
      min-height: 210px;
      border: 1px solid var(--ladder-line);
      border-radius: 20px;
      background: rgba(4, 14, 26, .66);
    }
    .ladder-stage canvas { display: block; width: 100%; height: auto; aspect-ratio: 48 / 31; touch-action: pan-y; }
    .ladder-empty {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      margin: 0;
      padding: 24px;
      color: #a9bdcb;
      text-align: center;
      pointer-events: none;
    }
    .ladder-empty[hidden] { display: none; }
    .ladder-status {
      min-height: 3.2rem;
      margin: 0;
      padding: 13px 15px;
      border: 1px solid rgba(88, 230, 169, .22);
      border-radius: 13px;
      color: #dff9ed;
      background: rgba(88, 230, 169, .07);
      line-height: 1.45;
    }
    .ladder-run-buttons { display: grid; grid-template-columns: repeat(auto-fit, minmax(138px, 1fr)); gap: 9px; }
    .ladder-run-buttons button { border-color: color-mix(in srgb, var(--run-color) 52%, transparent); font-weight: 850; }
    .ladder-run-buttons button.revealed { color: var(--run-color); background: color-mix(in srgb, var(--run-color) 10%, transparent); }
    .ladder-result-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .ladder-results {
      padding: 15px;
      border: 1px solid rgba(255, 212, 71, .25);
      border-radius: 15px;
      background: rgba(255, 212, 71, .06);
    }
    .ladder-results[hidden] { display: none; }
    .ladder-results h3 { margin: 0 0 10px; font-size: .88rem; letter-spacing: .08em; color: #ffd447; }
    .ladder-results ul { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
    .ladder-results li { display: grid; gap: 3px; padding: 10px 11px; border-radius: 10px; background: rgba(255, 255, 255, .055); }
    .ladder-results strong { color: var(--result-color); font-size: .82rem; }
    .ladder-results span { color: #f5f8fb; overflow-wrap: anywhere; }
    .ladder-game[data-locked="true"] .ladder-stage { box-shadow: 0 0 0 1px rgba(88, 230, 169, .22), 0 15px 45px rgba(0, 0, 0, .22); }
    @media (max-width: 620px) {
      .ladder-editors { grid-template-columns: minmax(0, 1fr); }
      .ladder-toolbar { align-items: stretch; }
      .ladder-count-control { justify-content: space-between; width: 100%; }
      .ladder-actions button, .ladder-result-actions button { flex: 1 1 135px; }
      .ladder-stage { margin-inline: -2px; border-radius: 15px; }
      .ladder-run-buttons { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (prefers-reduced-motion: reduce) {
      .ladder-game *, .ladder-game *::before, .ladder-game *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; }
    }
  </style>
  <section class="ladder-setup" aria-label="사다리 설정">
    <div class="ladder-toolbar">
      <strong>참가자 수</strong>
      <div class="ladder-count-control">
        <button type="button" data-action="decrease" aria-label="참가자 한 명 줄이기">−</button>
        <output data-count aria-live="polite">4명</output>
        <button type="button" data-action="increase" aria-label="참가자 한 명 늘리기">+</button>
      </div>
    </div>
    <div class="ladder-editors">
      <fieldset data-name-fieldset>
        <legend>참가자 이름</legend>
        <div class="ladder-input-list" data-name-inputs></div>
      </fieldset>
      <fieldset data-outcome-fieldset>
        <legend>결과</legend>
        <div class="ladder-input-list" data-outcome-inputs></div>
      </fieldset>
    </div>
    <div class="ladder-actions">
      <button type="button" data-action="shuffle">결과 순서 섞기</button>
      <button type="button" data-action="generate">사다리 다시 만들기</button>
    </div>
    <p class="ladder-seed">현재 시드: <span data-seed>미생성</span></p>
  </section>
  <div class="ladder-stage">
    <canvas data-canvas role="img" aria-label="사다리가 아직 생성되지 않았습니다" aria-describedby="ladder-live-status"></canvas>
    <p class="ladder-empty" data-empty>이름과 결과를 확인한 뒤 사다리를 만들어 주세요.</p>
  </div>
  <p class="ladder-status" id="ladder-live-status" data-status role="status" aria-live="polite">준비 중입니다.</p>
  <div class="ladder-run-buttons" data-run-buttons aria-label="참가자별 경로 실행"></div>
  <div class="ladder-result-actions">
    <button type="button" data-action="show-all" disabled>전체 결과 보기</button>
    <button type="button" data-action="copy" disabled>결과 복사</button>
  </div>
  <section class="ladder-results" data-results hidden aria-label="공개된 사다리 결과">
    <h3>RESULTS</h3>
    <ul data-result-list></ul>
  </section>
`;

interface Point {
  readonly x: number;
  readonly y: number;
}

interface PathAnimation {
  readonly participantIndex: number;
  readonly points: readonly Point[];
  readonly duration: number;
  elapsed: number;
  lastTimestamp: number | null;
}

interface LadderElements {
  readonly root: HTMLElement;
  readonly count: HTMLOutputElement;
  readonly nameFieldset: HTMLFieldSetElement;
  readonly outcomeFieldset: HTMLFieldSetElement;
  readonly nameInputs: HTMLElement;
  readonly outcomeInputs: HTMLElement;
  readonly seed: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly empty: HTMLElement;
  readonly status: HTMLElement;
  readonly runButtons: HTMLElement;
  readonly showAllButton: HTMLButtonElement;
  readonly copyButton: HTMLButtonElement;
  readonly decreaseButton: HTMLButtonElement;
  readonly increaseButton: HTMLButtonElement;
  readonly shuffleButton: HTMLButtonElement;
  readonly generateButton: HTMLButtonElement;
  readonly results: HTMLElement;
  readonly resultList: HTMLUListElement;
}

function runtimeSeed(sequence: number): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const sample = new Uint32Array(2);
    crypto.getRandomValues(sample);
    return `${sample[0]?.toString(36) ?? '0'}-${sample[1]?.toString(36) ?? '0'}-${String(sequence)}`;
  }
  return `${Date.now().toString(36)}-${String(sequence)}`;
}

function defaultName(index: number): string {
  return `친구 ${String(index + 1)}`;
}

function defaultOutcome(index: number): string {
  return DEFAULT_OUTCOMES[index] ?? `결과 ${String(index + 1)}`;
}

function truncateCanvasText(value: string, maxCharacters: number): string {
  const characters = Array.from(value);
  return characters.length <= maxCharacters
    ? value
    : `${characters.slice(0, Math.max(maxCharacters - 1, 1)).join('')}…`;
}

class LadderController implements MiniGameController {
  private elements: LadderElements | null = null;
  private surface: CanvasSurface | null = null;
  private abortController: AbortController | null = null;
  private participantCount = 4;
  private names: string[] = [];
  private outcomes: string[] = [];
  private layout: LadderLayout | null = null;
  private readonly revealed = new Set<number>();
  private animation: PathAnimation | null = null;
  private animationFrame: number | null = null;
  private phase: GamePhase = 'idle';
  private active = false;
  private seedSequence = 0;
  private completed = false;

  public constructor(private readonly services: GameServices) {}

  public mount(container: HTMLElement): void {
    this.destroy();
    const root = document.createElement('div');
    root.className = 'ladder-game';
    // This template is a source-code constant. User strings are only assigned
    // through value, textContent, setAttribute, or Canvas fillText below.
    root.innerHTML = STATIC_MARKUP;
    container.replaceChildren(root);

    const canvas = queryRequired<HTMLCanvasElement>(root, '[data-canvas]');
    this.elements = {
      root,
      count: queryRequired<HTMLOutputElement>(root, '[data-count]'),
      nameFieldset: queryRequired<HTMLFieldSetElement>(root, '[data-name-fieldset]'),
      outcomeFieldset: queryRequired<HTMLFieldSetElement>(root, '[data-outcome-fieldset]'),
      nameInputs: queryRequired<HTMLElement>(root, '[data-name-inputs]'),
      outcomeInputs: queryRequired<HTMLElement>(root, '[data-outcome-inputs]'),
      seed: queryRequired<HTMLElement>(root, '[data-seed]'),
      canvas,
      empty: queryRequired<HTMLElement>(root, '[data-empty]'),
      status: queryRequired<HTMLElement>(root, '[data-status]'),
      runButtons: queryRequired<HTMLElement>(root, '[data-run-buttons]'),
      showAllButton: queryRequired<HTMLButtonElement>(root, '[data-action="show-all"]'),
      copyButton: queryRequired<HTMLButtonElement>(root, '[data-action="copy"]'),
      decreaseButton: queryRequired<HTMLButtonElement>(root, '[data-action="decrease"]'),
      increaseButton: queryRequired<HTMLButtonElement>(root, '[data-action="increase"]'),
      shuffleButton: queryRequired<HTMLButtonElement>(root, '[data-action="shuffle"]'),
      generateButton: queryRequired<HTMLButtonElement>(root, '[data-action="generate"]'),
      results: queryRequired<HTMLElement>(root, '[data-results]'),
      resultList: queryRequired<HTMLUListElement>(root, '[data-result-list]'),
    };
    this.surface = createCanvasSurface(canvas, CANVAS_WIDTH, CANVAS_HEIGHT);
    this.names = [
      this.services.getPlayerName(1),
      this.services.getPlayerName(2),
      '친구 3',
      '친구 4',
    ];
    this.outcomes = DEFAULT_OUTCOMES.slice(0, this.participantCount);

    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    root.addEventListener('click', this.handleClick, { signal });
    root.addEventListener('input', this.handleInput, { signal });
    window.addEventListener('resize', this.handleResize, { signal });
    document.addEventListener('visibilitychange', this.handleVisibilityChange, { signal });

    this.renderEditors();
    this.regenerate('사다리가 준비되었습니다. 참가자를 골라 출발하세요.', 'idle', false);
  }

  public enter(): void {
    if (!this.elements) return;
    this.active = true;
    this.phase = 'idle';
    this.services.setPhase('idle', '사다리에서 참가자를 선택할 준비가 되었습니다.');
    this.draw();
    this.updateControls();
  }

  public start(): void {
    if (!this.elements) return;
    this.active = true;
    if (this.phase === 'matchOver' || this.completed) {
      this.regenerate('새 사다리를 만들었습니다. 참가자를 골라 출발하세요.', 'playing');
      return;
    }
    if (!this.layout) {
      this.regenerate('사다리를 만들었습니다. 참가자를 골라 출발하세요.', 'playing');
      return;
    }
    this.phase = 'playing';
    this.services.setPhase('playing', '참가자별 출발 버튼을 눌러 결과를 확인하세요.');
    this.setStatus('참가자별 출발 버튼을 눌러 결과를 확인하세요.');
    this.updateControls();
  }

  public pause(): void {
    if (!this.elements || this.phase !== 'playing') return;
    this.cancelFrame();
    if (this.animation) this.animation.lastTimestamp = null;
    this.phase = 'paused';
    this.services.setPhase('paused', '사다리 진행을 일시정지했습니다.');
    this.setStatus('일시정지했습니다. 공통 재개 버튼으로 계속할 수 있습니다.');
    this.updateControls();
    this.draw();
  }

  public resume(): void {
    if (!this.elements || this.phase !== 'paused') return;
    this.phase = 'playing';
    this.services.setPhase('playing', '사다리 진행을 재개했습니다.');
    this.setStatus(
      this.animation
        ? `${this.displayNames()[this.animation.participantIndex] ?? '참가자'}의 경로를 계속 따라갑니다.`
        : '참가자별 출발 버튼을 눌러 결과를 확인하세요.',
    );
    this.updateControls();
    if (this.animation) this.requestFrame();
  }

  public reset(): void {
    if (!this.elements) return;
    this.regenerate('새 사다리를 만들었습니다. 참가자를 골라 출발하세요.', 'idle');
  }

  public destroy(): void {
    this.cancelFrame();
    this.animation = null;
    this.abortController?.abort();
    this.abortController = null;
    this.elements?.root.remove();
    this.elements = null;
    this.surface = null;
    this.layout = null;
    this.revealed.clear();
    this.phase = 'idle';
    this.active = false;
    this.completed = false;
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element) || !this.elements) return;
    const button = target.closest<HTMLButtonElement>('button');
    if (!button || !this.elements.root.contains(button) || button.disabled) return;

    const runIndexValue = button.dataset.runIndex;
    if (runIndexValue !== undefined) {
      const runIndex = Number(runIndexValue);
      if (Number.isInteger(runIndex)) this.startRun(runIndex);
      return;
    }

    switch (button.dataset.action) {
      case 'decrease':
        this.changeParticipantCount(-1);
        break;
      case 'increase':
        this.changeParticipantCount(1);
        break;
      case 'shuffle':
        this.shuffleOutcomes();
        break;
      case 'generate':
        this.regenerate('새 사다리를 만들었습니다. 참가자를 골라 출발하세요.', 'playing');
        break;
      case 'show-all':
        this.showAllResults();
        break;
      case 'copy':
        void this.copyResults();
        break;
    }
  };

  private readonly handleInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || this.isInteractionLocked()) return;
    const index = Number(target.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.participantCount) return;
    if (target.dataset.kind === 'name') this.names[index] = target.value;
    else if (target.dataset.kind === 'outcome') this.outcomes[index] = target.value;
    else return;

    if (this.layout) {
      if (this.completed) {
        this.completed = false;
        this.revealed.clear();
        this.phase = 'playing';
        this.services.setPhase('playing', '입력이 바뀌어 경로 공개를 초기화했습니다.');
        this.setStatus('입력이 바뀌었습니다. 참가자별 경로를 다시 공개해 주세요.');
      }
      this.renderRunButtons();
      this.renderRevealedResults();
      this.draw();
    }
  };

  private readonly handleResize = (): void => {
    if (!this.active) return;
    this.draw();
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden && this.phase === 'playing') this.pause();
  };

  private displayNames(): string[] {
    return normalizeEntries(this.names, this.participantCount, defaultName);
  }

  private displayOutcomes(): string[] {
    return normalizeEntries(this.outcomes, this.participantCount, defaultOutcome);
  }

  private renderEditors(): void {
    const elements = this.elements;
    if (!elements) return;
    while (this.names.length < this.participantCount)
      this.names.push(defaultName(this.names.length));
    while (this.outcomes.length < this.participantCount) {
      this.outcomes.push(defaultOutcome(this.outcomes.length));
    }
    this.names = this.names.slice(0, this.participantCount);
    this.outcomes = this.outcomes.slice(0, this.participantCount);
    setText(elements.count, `${String(this.participantCount)}명`);
    elements.nameInputs.replaceChildren();
    elements.outcomeInputs.replaceChildren();

    for (let index = 0; index < this.participantCount; index += 1) {
      elements.nameInputs.append(
        this.createInputRow(
          'name',
          index,
          this.names[index] ?? '',
          defaultName(index),
          `${String(index + 1)}번째 참가자 이름`,
          20,
        ),
      );
      elements.outcomeInputs.append(
        this.createInputRow(
          'outcome',
          index,
          this.outcomes[index] ?? '',
          defaultOutcome(index),
          `${String(index + 1)}번째 결과`,
          30,
        ),
      );
    }
  }

  private createInputRow(
    kind: 'name' | 'outcome',
    index: number,
    value: string,
    placeholder: string,
    label: string,
    maxLength: number,
  ): HTMLElement {
    const row = document.createElement('label');
    row.className = 'ladder-input-row';
    const number = document.createElement('span');
    number.textContent = String(index + 1);
    number.setAttribute('aria-hidden', 'true');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.placeholder = placeholder;
    input.maxLength = maxLength;
    input.autocomplete = 'off';
    input.dataset.kind = kind;
    input.dataset.index = String(index);
    input.setAttribute('aria-label', label);
    row.append(number, input);
    return row;
  }

  private changeParticipantCount(delta: -1 | 1): void {
    if (this.isInteractionLocked()) return;
    const next = clamp(this.participantCount + delta, MIN_PARTICIPANTS, MAX_PARTICIPANTS);
    if (next === this.participantCount) {
      this.setStatus(
        next === MIN_PARTICIPANTS ? '참가자는 최소 2명입니다.' : '참가자는 최대 8명입니다.',
      );
      return;
    }
    this.participantCount = next;
    this.renderEditors();
    this.invalidateLadder(`${String(next)}명으로 바꿨습니다. 사다리를 다시 만들어 주세요.`);
  }

  private shuffleOutcomes(): void {
    if (this.isInteractionLocked()) return;
    this.seedSequence += 1;
    const normalized = this.displayOutcomes();
    this.outcomes = shuffleEntries(normalized, runtimeSeed(this.seedSequence));
    this.renderEditors();
    this.invalidateLadder('결과 순서를 섞었습니다. 사다리를 다시 만들어 주세요.');
    this.services.audio.hit(0.45);
  }

  private invalidateLadder(message: string): void {
    this.cancelFrame();
    this.animation = null;
    this.layout = null;
    this.revealed.clear();
    this.completed = false;
    this.phase = 'idle';
    if (this.elements) {
      setText(this.elements.seed, '미생성');
      this.elements.empty.hidden = false;
      this.elements.results.hidden = true;
      this.elements.resultList.replaceChildren();
      this.elements.runButtons.replaceChildren();
      this.elements.canvas.setAttribute('aria-label', '사다리가 아직 생성되지 않았습니다');
    }
    this.services.setPhase('idle', message);
    this.setStatus(message);
    this.updateControls();
    this.draw();
  }

  private regenerate(message: string, phase: 'idle' | 'playing', announce = true): void {
    if (!this.elements || this.isInteractionLocked()) return;
    this.cancelFrame();
    this.animation = null;
    this.names = this.displayNames();
    this.outcomes = this.displayOutcomes();
    this.renderEditors();
    this.seedSequence += 1;
    const seed = runtimeSeed(this.seedSequence);
    this.layout = generateLadder(this.participantCount, seed);
    this.revealed.clear();
    this.completed = false;
    this.phase = phase;
    setText(this.elements.seed, this.layout.seed);
    this.elements.empty.hidden = true;
    this.elements.results.hidden = true;
    this.elements.resultList.replaceChildren();
    this.elements.canvas.setAttribute(
      'aria-label',
      `${String(this.participantCount)}명이 참여하는 ${String(this.layout.rowCount)}단 사다리. 참가자별 출발 버튼으로 경로를 확인할 수 있습니다.`,
    );
    this.renderRunButtons();
    this.updateControls();
    this.draw();
    this.services.setPhase(phase, message);
    this.setStatus(message, announce);
    if (announce) this.services.audio.hit(0.35);
  }

  private renderRunButtons(): void {
    const elements = this.elements;
    if (!elements) return;
    elements.runButtons.replaceChildren();
    const names = this.displayNames();
    const outcomes = this.displayOutcomes();
    for (let index = 0; index < this.participantCount; index += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.runIndex = String(index);
      button.style.setProperty('--run-color', PALETTE[index] ?? '#58e6a9');
      const participantName = names[index] ?? defaultName(index);
      if (this.revealed.has(index) && this.layout) {
        button.classList.add('revealed');
        const outcomeIndex = this.layout.mapping[index];
        const result = outcomes[outcomeIndex ?? index] ?? defaultOutcome(index);
        button.textContent = `${participantName} → ${result}`;
        button.setAttribute('aria-label', `${participantName}의 공개된 결과 보기`);
      } else {
        button.textContent = `${participantName} 출발`;
        button.setAttribute('aria-label', `${participantName}의 사다리 경로 실행`);
      }
      button.disabled = !this.layout || this.isInteractionLocked();
      elements.runButtons.append(button);
    }
  }

  private startRun(participantIndex: number): void {
    if (
      !this.layout ||
      this.isInteractionLocked() ||
      participantIndex < 0 ||
      participantIndex >= this.participantCount
    ) {
      return;
    }
    this.active = true;
    if (this.revealed.has(participantIndex)) {
      this.renderResults([participantIndex]);
      return;
    }

    const points = this.pathPoints(participantIndex);
    this.phase = 'playing';
    this.services.setPhase('playing', '사다리 경로를 따라가는 중입니다.');
    if (this.services.isReducedMotion()) {
      this.revealed.add(participantIndex);
      this.finishRun(participantIndex);
      return;
    }

    this.animation = {
      participantIndex,
      points,
      duration: Math.min(2300, 1100 + points.length * 18),
      elapsed: 0,
      lastTimestamp: null,
    };
    this.setStatus(`${this.displayNames()[participantIndex] ?? '참가자'}의 경로를 따라가는 중…`);
    this.updateControls();
    this.draw();
    this.services.audio.hit(0.55);
    this.requestFrame();
  }

  private requestFrame(): void {
    if (this.animationFrame !== null || !this.animation || this.phase !== 'playing') return;
    this.animationFrame = requestAnimationFrame(this.tickAnimation);
  }

  private readonly tickAnimation = (timestamp: number): void => {
    this.animationFrame = null;
    const animation = this.animation;
    if (!animation || this.phase !== 'playing' || !this.active) return;
    animation.lastTimestamp ??= timestamp;
    const elapsedSinceLastFrame = Math.min(Math.max(timestamp - animation.lastTimestamp, 0), 50);
    animation.elapsed += elapsedSinceLastFrame;
    animation.lastTimestamp = timestamp;
    this.draw();
    if (animation.elapsed >= animation.duration) {
      const participantIndex = animation.participantIndex;
      this.animation = null;
      this.revealed.add(participantIndex);
      this.finishRun(participantIndex);
      return;
    }
    this.requestFrame();
  };

  private finishRun(participantIndex: number): void {
    const layout = this.layout;
    if (!layout) return;
    const names = this.displayNames();
    const outcomes = this.displayOutcomes();
    const outcomeIndex = layout.mapping[participantIndex] ?? participantIndex;
    const name = names[participantIndex] ?? defaultName(participantIndex);
    const outcome = outcomes[outcomeIndex] ?? defaultOutcome(outcomeIndex);
    this.renderRunButtons();
    this.renderResults([participantIndex]);
    this.updateControls();
    this.draw();
    this.setStatus(`${name}의 결과는 ‘${outcome}’입니다.`);
    this.services.audio.score();
    if (this.revealed.size === this.participantCount) this.completeLadder();
  }

  private showAllResults(): void {
    if (!this.layout || this.isInteractionLocked()) return;
    for (let index = 0; index < this.participantCount; index += 1) this.revealed.add(index);
    this.renderRunButtons();
    this.renderRevealedResults();
    this.updateControls();
    this.draw();
    this.completeLadder();
  }

  private completeLadder(): void {
    if (!this.layout || this.completed) return;
    this.completed = true;
    this.setStatus('모든 사다리 결과를 공개했습니다.');
    this.phase = 'matchOver';
    this.services.setPhase('matchOver', '모든 사다리 결과를 공개했습니다.');
    const names = this.displayNames();
    const outcomes = this.displayOutcomes();
    const detail = names
      .map((name, index) => `${name} → ${outcomes[this.layout?.mapping[index] ?? index] ?? ''}`)
      .join(' · ');
    this.updateControls();
    this.services.complete({ winner: 0, headline: '사다리 결과가 완성됐어요', detail });
  }

  private renderRevealedResults(): void {
    this.renderResults([...this.revealed].sort((left, right) => left - right));
  }

  private renderResults(indices: readonly number[]): void {
    const elements = this.elements;
    const layout = this.layout;
    if (!elements || !layout) return;
    const names = this.displayNames();
    const outcomes = this.displayOutcomes();
    elements.resultList.replaceChildren();
    for (const index of indices) {
      const item = document.createElement('li');
      item.style.setProperty('--result-color', PALETTE[index] ?? '#58e6a9');
      const name = document.createElement('strong');
      name.textContent = names[index] ?? defaultName(index);
      const outcome = document.createElement('span');
      const outcomeIndex = layout.mapping[index] ?? index;
      outcome.textContent = `→ ${outcomes[outcomeIndex] ?? defaultOutcome(outcomeIndex)}`;
      item.append(name, outcome);
      elements.resultList.append(item);
    }
    elements.results.hidden = indices.length === 0;
  }

  private async copyResults(): Promise<void> {
    const layout = this.layout;
    if (!layout || this.isInteractionLocked()) return;
    const names = this.displayNames();
    const outcomes = this.displayOutcomes();
    const text = names
      .map((name, index) => `${name} → ${outcomes[layout.mapping[index] ?? index] ?? ''}`)
      .join('\n');
    try {
      const clipboard = (
        navigator as unknown as { clipboard?: { writeText?: (value: string) => Promise<void> } }
      ).clipboard;
      if (typeof clipboard?.writeText === 'function') {
        await clipboard.writeText(text);
      } else if (!this.copyWithTemporaryInput(text)) {
        throw new Error('Clipboard API is unavailable');
      }
      if (this.elements) this.setStatus('전체 결과를 클립보드에 복사했습니다.');
    } catch {
      if (!this.copyWithTemporaryInput(text)) {
        this.setStatus('복사하지 못했습니다. 전체 결과 보기에서 직접 선택해 주세요.');
      } else {
        this.setStatus('전체 결과를 클립보드에 복사했습니다.');
      }
    }
  }

  private copyWithTemporaryInput(value: string): boolean {
    const root = this.elements?.root;
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
    const copied = legacyDocument.execCommand('copy');
    input.remove();
    return copied;
  }

  private updateControls(): void {
    const elements = this.elements;
    if (!elements) return;
    const locked = this.isInteractionLocked();
    elements.root.dataset.locked = String(Boolean(this.animation));
    elements.nameFieldset.disabled = locked;
    elements.outcomeFieldset.disabled = locked;
    elements.decreaseButton.disabled = locked || this.participantCount <= MIN_PARTICIPANTS;
    elements.increaseButton.disabled = locked || this.participantCount >= MAX_PARTICIPANTS;
    elements.shuffleButton.disabled = locked;
    elements.generateButton.disabled = locked;
    elements.showAllButton.disabled = locked || !this.layout || this.completed;
    elements.copyButton.disabled = locked || !this.layout;
    this.renderRunButtons();
  }

  private isInteractionLocked(): boolean {
    return Boolean(this.animation) || this.phase === 'paused';
  }

  private setStatus(message: string, announce = true): void {
    if (this.elements) setText(this.elements.status, message);
    if (announce) this.services.announce(message);
  }

  private cancelFrame(): void {
    if (this.animationFrame === null) return;
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
  }

  private xPositions(): number[] {
    const left = this.participantCount <= 3 ? 170 : 78;
    const right = this.participantCount <= 3 ? CANVAS_WIDTH - 170 : CANVAS_WIDTH - 78;
    const spacing = (right - left) / (this.participantCount - 1);
    return Array.from({ length: this.participantCount }, (_, index) => left + spacing * index);
  }

  private rowY(row: number): number {
    const rowCount = this.layout?.rowCount ?? 1;
    return TOP_Y + ((row + 1) * (BOTTOM_Y - TOP_Y)) / (rowCount + 1);
  }

  private pathPoints(participantIndex: number): Point[] {
    const layout = this.layout;
    if (!layout) return [];
    const xPositions = this.xPositions();
    const trace = traceLadder(
      participantIndex,
      this.participantCount,
      layout.rowCount,
      layout.rungs,
    );
    const points: Point[] = [{ x: xPositions[participantIndex] ?? 0, y: TOP_Y }];
    for (const step of trace.steps) {
      const y = this.rowY(step.row);
      points.push({ x: xPositions[step.from] ?? 0, y });
      if (step.to !== step.from) points.push({ x: xPositions[step.to] ?? 0, y });
    }
    points.push({ x: xPositions[trace.end] ?? 0, y: BOTTOM_Y });
    return points;
  }

  private draw(): void {
    const surface = this.surface;
    const layout = this.layout;
    if (!surface) return;
    surface.resize();
    const context = surface.context;
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    this.drawBackground(context);
    if (!layout) return;
    const xPositions = this.xPositions();

    context.save();
    context.strokeStyle = 'rgba(232, 244, 252, .24)';
    context.lineWidth = 3;
    for (const x of xPositions) {
      context.beginPath();
      context.moveTo(x, TOP_Y);
      context.lineTo(x, BOTTOM_Y);
      context.stroke();
    }
    for (const rung of layout.rungs) {
      context.beginPath();
      context.moveTo(xPositions[rung.left] ?? 0, this.rowY(rung.row));
      context.lineTo(xPositions[rung.left + 1] ?? 0, this.rowY(rung.row));
      context.stroke();
    }
    context.restore();

    for (const index of this.revealed) {
      this.drawPath(context, this.pathPoints(index), PALETTE[index] ?? '#58e6a9', 1, 5);
    }
    if (this.animation) {
      const progress = clamp(this.animation.elapsed / this.animation.duration, 0, 1);
      const easedProgress = 1 - (1 - progress) ** 3;
      this.drawPath(
        context,
        this.animation.points,
        PALETTE[this.animation.participantIndex] ?? '#58e6a9',
        easedProgress,
        8,
      );
    }

    const names = this.displayNames();
    const outcomes = this.displayOutcomes();
    for (let index = 0; index < this.participantCount; index += 1) {
      const x = xPositions[index] ?? 0;
      const color = PALETTE[index] ?? '#58e6a9';
      this.drawEndpoint(context, x, TOP_Y, color);
      this.drawEndpoint(context, x, BOTTOM_Y, color);
      this.drawLabel(context, x, TOP_Y - 14, names[index] ?? '', color, false);
      const source = layout.mapping.indexOf(index);
      this.drawLabel(
        context,
        x,
        BOTTOM_Y + 14,
        outcomes[index] ?? '',
        PALETTE[source >= 0 ? source : index] ?? color,
        true,
      );
    }
  }

  private drawBackground(context: CanvasRenderingContext2D): void {
    const gradient = context.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, 'rgba(15, 35, 55, .9)');
    gradient.addColorStop(1, 'rgba(4, 13, 25, .9)');
    context.save();
    context.fillStyle = gradient;
    context.beginPath();
    context.roundRect(6, 6, CANVAS_WIDTH - 12, CANVAS_HEIGHT - 12, 18);
    context.fill();
    context.restore();
  }

  private drawEndpoint(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
  ): void {
    context.save();
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 12;
    context.beginPath();
    context.arc(x, y, 6.5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  private drawLabel(
    context: CanvasRenderingContext2D,
    x: number,
    anchorY: number,
    text: string,
    color: string,
    below: boolean,
  ): void {
    const label = truncateCanvasText(text, this.participantCount >= 7 ? 7 : 10);
    context.save();
    context.font = '800 13px system-ui, sans-serif';
    const width = clamp(
      context.measureText(label).width + 22,
      52,
      this.participantCount >= 7 ? 96 : 120,
    );
    const height = 33;
    const top = below ? anchorY : anchorY - height;
    context.beginPath();
    context.roundRect(x - width / 2, top, width, height, 10);
    context.fillStyle = 'rgba(5, 16, 29, .96)';
    context.fill();
    context.strokeStyle = color;
    context.globalAlpha = 0.82;
    context.lineWidth = 1.4;
    context.stroke();
    context.globalAlpha = 1;
    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, x, top + height / 2 + 1);
    context.restore();
  }

  private drawPath(
    context: CanvasRenderingContext2D,
    points: readonly Point[],
    color: string,
    progress: number,
    lineWidth: number,
  ): void {
    const first = points[0];
    if (!first || points.length < 2) return;
    let totalLength = 0;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      if (previous && current)
        totalLength += Math.hypot(current.x - previous.x, current.y - previous.y);
    }
    let remaining = totalLength * clamp(progress, 0, 1);
    context.save();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.shadowColor = color;
    context.shadowBlur = 14;
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      if (!previous || !current) continue;
      const segmentLength = Math.hypot(current.x - previous.x, current.y - previous.y);
      if (remaining >= segmentLength) {
        context.lineTo(current.x, current.y);
        remaining -= segmentLength;
      } else {
        const ratio = segmentLength === 0 ? 0 : remaining / segmentLength;
        context.lineTo(
          previous.x + (current.x - previous.x) * ratio,
          previous.y + (current.y - previous.y) * ratio,
        );
        break;
      }
    }
    context.stroke();
    context.restore();
  }
}

export function createGame(services: GameServices): MiniGameController {
  return new LadderController(services);
}
