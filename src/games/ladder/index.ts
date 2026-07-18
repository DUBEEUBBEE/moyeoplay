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
import './ladder.css';

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
      <button type="button" data-action="generate">사다리 만들기</button>
      <button type="button" data-action="edit" hidden>설정 다시 편집</button>
    </div>
    <p class="ladder-audit" data-audit hidden>감사용 생성 ID: <span data-round-id></span></p>
  </section>
  <div class="ladder-stage">
    <canvas data-canvas role="img" aria-label="사다리가 아직 생성되지 않았습니다" aria-describedby="ladder-live-status"></canvas>
    <p class="ladder-empty" data-empty>이름과 결과를 확인한 뒤 사다리를 만들어 주세요.</p>
  </div>
  <p class="ladder-status" id="ladder-live-status" data-status role="status" aria-live="polite">준비 중입니다.</p>
  <div class="ladder-run-buttons" data-run-buttons aria-label="참가자별 경로 실행"></div>
  <div class="ladder-result-actions">
    <button type="button" data-action="show-all" disabled>전체 결과 보기</button>
    <button type="button" data-action="copy" disabled>전체 결과 복사</button>
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

type LadderRoundState = 'editing' | 'committed' | 'revealing' | 'completed';

interface LadderRoundSnapshot {
  readonly participantCount: number;
  readonly names: readonly string[];
  readonly outcomes: readonly string[];
  readonly targetPermutation: readonly number[];
  readonly layout: LadderLayout;
  /** Opaque audit identifier only; it cannot reproduce or predict the round. */
  readonly roundId: string;
}

interface LadderElements {
  readonly root: HTMLElement;
  readonly count: HTMLOutputElement;
  readonly nameFieldset: HTMLFieldSetElement;
  readonly outcomeFieldset: HTMLFieldSetElement;
  readonly nameInputs: HTMLElement;
  readonly outcomeInputs: HTMLElement;
  readonly audit: HTMLElement;
  readonly roundId: HTMLElement;
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
  readonly editButton: HTMLButtonElement;
  readonly externalResetButton: HTMLButtonElement | null;
  readonly results: HTMLElement;
  readonly resultList: HTMLUListElement;
}

function runtimeRoundId(sequence: number): string {
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
  private round: LadderRoundSnapshot | null = null;
  private roundState: LadderRoundState = 'editing';
  private readonly revealed = new Set<number>();
  private animation: PathAnimation | null = null;
  private animationFrame: number | null = null;
  private phase: GamePhase = 'idle';
  private active = false;
  private roundSequence = 0;

  public constructor(private readonly services: GameServices) {}

  private get layout(): LadderLayout | null {
    return this.round?.layout ?? null;
  }

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
      audit: queryRequired<HTMLElement>(root, '[data-audit]'),
      roundId: queryRequired<HTMLElement>(root, '[data-round-id]'),
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
      editButton: queryRequired<HTMLButtonElement>(root, '[data-action="edit"]'),
      externalResetButton:
        container
          .closest<HTMLElement>('.game-view')
          ?.querySelector<HTMLButtonElement>('[data-action="reset"]') ?? null,
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
    this.returnToEditing('이름과 결과를 확인한 뒤 사다리를 만들어 주세요.', false);
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
    if (this.roundState === 'editing' || this.roundState === 'completed' || !this.round) {
      this.commitRound('새 사다리를 확정했습니다. 참가자를 골라 출발하세요.', 'playing');
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

  public reset(): boolean {
    if (!this.elements) return false;
    if (this.roundState === 'completed') {
      this.commitRound('새 사다리를 확정했습니다. 참가자를 골라 출발하세요.', 'idle');
    } else if (this.roundState === 'editing') {
      this.returnToEditing('이름과 결과를 확인한 뒤 사다리를 만들어 주세요.');
    } else {
      return this.requestEdit(true);
    }
    return true;
  }

  public destroy(): void {
    this.cancelFrame();
    this.animation = null;
    this.abortController?.abort();
    this.abortController = null;
    if (this.elements?.externalResetButton) this.elements.externalResetButton.disabled = false;
    this.elements?.root.remove();
    this.elements = null;
    this.surface = null;
    this.round = null;
    this.roundState = 'editing';
    this.revealed.clear();
    this.phase = 'idle';
    this.active = false;
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
        this.commitRound('사다리를 확정했습니다. 참가자를 골라 출발하세요.', 'playing');
        break;
      case 'edit':
        this.requestEdit();
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
    if (
      !(target instanceof HTMLInputElement) ||
      this.roundState !== 'editing' ||
      this.isInteractionLocked()
    ) {
      return;
    }
    const index = Number(target.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.participantCount) return;
    if (target.dataset.kind === 'name') this.names[index] = target.value;
    else if (target.dataset.kind === 'outcome') this.outcomes[index] = target.value;
    else return;
  };

  private readonly handleResize = (): void => {
    if (!this.active) return;
    this.draw();
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden && this.phase === 'playing') this.pause();
  };

  private displayNames(): string[] {
    return this.round
      ? [...this.round.names]
      : normalizeEntries(this.names, this.participantCount, defaultName);
  }

  private displayOutcomes(): string[] {
    return this.round
      ? [...this.round.outcomes]
      : normalizeEntries(this.outcomes, this.participantCount, defaultOutcome);
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
    if (this.roundState !== 'editing' || this.isInteractionLocked()) return;
    const next = clamp(this.participantCount + delta, MIN_PARTICIPANTS, MAX_PARTICIPANTS);
    if (next === this.participantCount) {
      this.setStatus(
        next === MIN_PARTICIPANTS ? '참가자는 최소 2명입니다.' : '참가자는 최대 8명입니다.',
      );
      return;
    }
    this.participantCount = next;
    this.renderEditors();
    this.setStatus(`${String(next)}명으로 바꿨습니다. 사다리를 만들어 주세요.`);
    this.updateControls();
    this.draw();
  }

  private shuffleOutcomes(): void {
    if (this.roundState !== 'editing' || this.isInteractionLocked()) return;
    const normalized = this.displayOutcomes();
    this.outcomes = shuffleEntries(normalized);
    this.renderEditors();
    this.setStatus('화면에 보이는 결과 순서를 섞었습니다. 사다리를 만들어 주세요.');
    this.updateControls();
    this.draw();
    this.services.audio.hit(0.45);
  }

  private requestEdit(allowPaused = false): boolean {
    if (
      this.roundState === 'editing' ||
      !this.round ||
      Boolean(this.animation) ||
      (!allowPaused && this.phase === 'paused')
    ) {
      return false;
    }
    const confirmed = globalThis.confirm(
      '확정된 사다리와 지금까지 공개한 결과를 버리고 설정을 다시 편집할까요?',
    );
    if (!confirmed) {
      this.setStatus('설정 편집을 취소했습니다. 기존 사다리를 그대로 유지합니다.');
      return false;
    }
    this.returnToEditing(
      '기존 사다리와 공개 상태를 폐기했습니다. 설정을 바꾼 뒤 사다리를 다시 만들어 주세요.',
    );
    return true;
  }

  private returnToEditing(message: string, announce = true): void {
    this.cancelFrame();
    this.animation = null;
    this.round = null;
    this.roundState = 'editing';
    this.revealed.clear();
    this.phase = 'idle';
    if (this.elements) {
      this.elements.root.dataset.roundState = this.roundState;
      setText(this.elements.roundId, '');
      this.elements.audit.hidden = true;
      this.elements.empty.hidden = false;
      this.elements.results.hidden = true;
      this.elements.resultList.replaceChildren();
      this.elements.runButtons.replaceChildren();
      this.elements.canvas.setAttribute('aria-label', '사다리가 아직 생성되지 않았습니다');
    }
    this.services.setPhase('idle', message);
    this.setStatus(message, announce);
    this.updateControls();
    this.draw();
  }

  private commitRound(message: string, phase: 'idle' | 'playing', announce = true): void {
    if (!this.elements || this.isInteractionLocked()) return;
    this.cancelFrame();
    this.animation = null;
    this.round = null;
    this.names = normalizeEntries(this.names, this.participantCount, defaultName);
    this.outcomes = normalizeEntries(this.outcomes, this.participantCount, defaultOutcome);
    this.renderEditors();
    this.roundSequence += 1;
    const roundId = runtimeRoundId(this.roundSequence);
    const layout = generateLadder(this.participantCount);
    this.round = Object.freeze({
      participantCount: this.participantCount,
      names: Object.freeze([...this.names]),
      outcomes: Object.freeze([...this.outcomes]),
      targetPermutation: layout.mapping,
      layout,
      roundId,
    });
    this.roundState = 'committed';
    this.revealed.clear();
    this.phase = phase;
    this.elements.root.dataset.roundState = this.roundState;
    setText(this.elements.roundId, '');
    this.elements.audit.hidden = true;
    this.elements.empty.hidden = true;
    this.elements.results.hidden = true;
    this.elements.resultList.replaceChildren();
    this.elements.canvas.setAttribute(
      'aria-label',
      `${String(this.participantCount)}명의 결과가 확정된 사다리. 참가자별 출발 버튼으로 한 경로씩 공개할 수 있습니다.`,
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
    const participantCount = this.round?.participantCount ?? this.participantCount;
    for (let index = 0; index < participantCount; index += 1) {
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
      button.disabled =
        !this.layout || this.roundState === 'completed' || this.isInteractionLocked();
      elements.runButtons.append(button);
    }
  }

  private startRun(participantIndex: number): void {
    if (
      !this.layout ||
      this.roundState === 'editing' ||
      this.roundState === 'completed' ||
      this.isInteractionLocked() ||
      participantIndex < 0 ||
      participantIndex >= (this.round?.participantCount ?? this.participantCount)
    ) {
      return;
    }
    this.active = true;
    if (this.revealed.has(participantIndex)) {
      this.renderRevealedResults();
      return;
    }

    if (this.roundState === 'committed') {
      this.roundState = 'revealing';
      if (this.elements) this.elements.root.dataset.roundState = this.roundState;
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
    this.renderRevealedResults();
    this.updateControls();
    this.draw();
    this.setStatus(`${name}의 결과는 ‘${outcome}’입니다.`);
    this.services.audio.score();
    if (this.revealed.size === (this.round?.participantCount ?? this.participantCount)) {
      this.completeLadder();
    }
  }

  private showAllResults(): void {
    if (
      !this.layout ||
      this.roundState === 'editing' ||
      this.roundState === 'completed' ||
      this.isInteractionLocked()
    ) {
      return;
    }
    const participantCount = this.round?.participantCount ?? this.participantCount;
    for (let index = 0; index < participantCount; index += 1) this.revealed.add(index);
    this.completeLadder();
  }

  private completeLadder(): void {
    const round = this.round;
    if (!round || this.roundState === 'completed') return;
    this.roundState = 'completed';
    if (this.elements) {
      this.elements.root.dataset.roundState = this.roundState;
      setText(this.elements.roundId, round.roundId);
      this.elements.audit.hidden = false;
      this.elements.canvas.setAttribute(
        'aria-label',
        `${String(round.participantCount)}명의 모든 경로와 결과가 공개된 사다리입니다.`,
      );
    }
    this.renderRevealedResults();
    this.setStatus('모든 사다리 결과를 공개했습니다.');
    this.phase = 'matchOver';
    this.services.setPhase('matchOver', '모든 사다리 결과를 공개했습니다.');
    const detail = round.names
      .map(
        (name, index) =>
          `${name} → ${round.outcomes[round.targetPermutation[index] ?? index] ?? ''}`,
      )
      .join(' · ');
    this.updateControls();
    this.draw();
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
    const round = this.round;
    if (!round || this.roundState !== 'completed' || this.isInteractionLocked()) return;
    const text = round.names
      .map(
        (name, index) =>
          `${name} → ${round.outcomes[round.targetPermutation[index] ?? index] ?? ''}`,
      )
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
        this.elements?.resultList.setAttribute('tabindex', '0');
        this.elements?.resultList.focus();
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
    try {
      return legacyDocument.execCommand('copy');
    } catch {
      return false;
    } finally {
      input.remove();
    }
  }

  private updateControls(): void {
    const elements = this.elements;
    if (!elements) return;
    const busy = this.isInteractionLocked();
    const editing = this.roundState === 'editing';
    const completed = this.roundState === 'completed';
    elements.root.dataset.busy = String(Boolean(this.animation));
    elements.root.dataset.roundState = this.roundState;
    elements.nameFieldset.disabled = !editing || busy;
    elements.outcomeFieldset.disabled = !editing || busy;
    elements.decreaseButton.disabled =
      !editing || busy || this.participantCount <= MIN_PARTICIPANTS;
    elements.increaseButton.disabled =
      !editing || busy || this.participantCount >= MAX_PARTICIPANTS;
    elements.shuffleButton.disabled = !editing || busy;
    elements.generateButton.disabled = !editing || busy;
    elements.editButton.hidden = editing;
    elements.editButton.disabled = editing || busy;
    elements.showAllButton.disabled = busy || !this.layout || completed;
    elements.copyButton.disabled = busy || !this.layout || !completed;
    if (elements.externalResetButton) {
      elements.externalResetButton.disabled = this.roundState === 'revealing';
    }
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
    // Before full reveal we draw only the selected participant's truthful trace.
    // Keeping the other rungs out of the canvas preserves their sealed mappings.
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
    if (this.roundState === 'completed') {
      for (const rung of layout.rungs) {
        context.beginPath();
        context.moveTo(xPositions[rung.left] ?? 0, this.rowY(rung.row));
        context.lineTo(xPositions[rung.left + 1] ?? 0, this.rowY(rung.row));
        context.stroke();
      }
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
    const participantCount = this.round?.participantCount ?? this.participantCount;
    for (let index = 0; index < participantCount; index += 1) {
      const x = xPositions[index] ?? 0;
      const color = PALETTE[index] ?? '#58e6a9';
      this.drawEndpoint(context, x, TOP_Y, color);
      this.drawEndpoint(context, x, BOTTOM_Y, color);
      this.drawLabel(context, x, TOP_Y - 14, names[index] ?? '', color, false);
      const source = layout.mapping.indexOf(index);
      const outcomeRevealed =
        this.roundState === 'completed' || (source >= 0 && this.revealed.has(source));
      this.drawLabel(
        context,
        x,
        BOTTOM_Y + 14,
        outcomeRevealed ? (outcomes[index] ?? '') : '비공개',
        outcomeRevealed && source >= 0 ? (PALETTE[source] ?? '#ffd447') : '#8fa8ba',
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
