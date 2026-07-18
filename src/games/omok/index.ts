import type { CanvasSurface } from '../../core/canvas-scaler';
import { createCanvasSurface } from '../../core/canvas-scaler';
import { queryRequired } from '../../core/dom';
import type { GamePhase, GameServices, MiniGameController } from '../../core/game-controller';
import {
  BOARD_SIZE,
  createRoundState,
  isMatchLength,
  placeStone,
  starterForRound,
  undoLastMove,
  winsRequired,
  type Coordinate,
  type MatchLength,
  type Player,
  type RoundState,
  type StarterRule,
} from './logic';
import './omok.css';

const CANVAS_SIZE = 720;
const BOARD_MARGIN = 50;
const BOARD_SPACING = (CANVAS_SIZE - BOARD_MARGIN * 2) / (BOARD_SIZE - 1);
const COLUMN_LABELS = 'ABCDEFGHIJKLMNO';
const STAR_POINTS = [
  [3, 3],
  [3, 11],
  [7, 7],
  [11, 3],
  [11, 11],
] as const;

const MARKUP = `
  <section class="omok-game" data-omok-root aria-labelledby="omok-module-title">
    <h2 class="omok-sr-only" id="omok-module-title">오목 게임</h2>
    <div class="omok-scoreboard" aria-label="매치 점수">
      <article class="omok-player-card omok-player-card--black" data-role="player-1-card">
        <span class="omok-stone-icon omok-stone-icon--black" aria-hidden="true"></span>
        <span class="omok-player-copy">
          <span class="omok-player-name" data-role="player-1-name">PLAYER 1</span>
          <span class="omok-player-stone">흑돌</span>
        </span>
        <strong class="omok-score" data-role="player-1-score">0</strong>
      </article>
      <div class="omok-round-copy">
        <span data-role="round-label">ROUND 1</span>
        <strong data-role="match-goal">먼저 2승</strong>
      </div>
      <article class="omok-player-card omok-player-card--white" data-role="player-2-card">
        <strong class="omok-score" data-role="player-2-score">0</strong>
        <span class="omok-player-copy">
          <span class="omok-player-name" data-role="player-2-name">PLAYER 2</span>
          <span class="omok-player-stone">백돌</span>
        </span>
        <span class="omok-stone-icon omok-stone-icon--white" aria-hidden="true"></span>
      </article>
    </div>

    <div class="omok-layout">
      <div class="omok-board-column">
        <div class="omok-board-frame">
          <canvas
            class="omok-canvas"
            data-role="canvas"
            width="720"
            height="720"
            tabindex="0"
            role="group"
            aria-describedby="omok-status omok-keyboard-help"
            aria-label="15행 15열 오목판 키보드 조작 영역"
          ></canvas>
          <div class="omok-pause-overlay" data-role="pause-overlay" hidden>
            <strong>일시정지</strong>
            <span>공통 게임 HUD에서 재개를 눌러주세요.</span>
          </div>
        </div>
        <div class="omok-placement-controls" data-role="placement-controls" hidden>
          <p><strong data-role="pending-coordinate">H8</strong><span data-role="pending-description">빈 교차점</span></p>
          <div>
            <button class="omok-button omok-button--primary" type="button" data-role="confirm-placement">이 위치에 놓기</button>
            <button class="omok-button" type="button" data-role="cancel-placement">선택 취소</button>
          </div>
        </div>
        <p class="omok-status" id="omok-status" data-role="status" role="status" aria-live="polite" aria-atomic="true">
          시작 버튼을 누르면 대국이 시작됩니다.
        </p>
      </div>

      <aside class="omok-panel" aria-label="오목 정보와 설정">
        <section class="omok-turn-panel" aria-label="현재 차례">
          <span class="omok-panel-label">CURRENT TURN</span>
          <strong data-role="turn-label">흑돌 차례</strong>
          <span data-role="coordinate-label">선택 위치 · H8</span>
          <span class="omok-rule-badge">자유룰 · 5개 이상 연결</span>
        </section>

        <fieldset class="omok-settings">
          <legend>매치 설정</legend>
          <label>
            <span>승부 방식</span>
            <select data-role="best-of" aria-label="승부 방식">
              <option value="1">단판 승부</option>
              <option value="3" selected>3판 2선승</option>
              <option value="5">5판 3선승</option>
            </select>
          </label>
          <label>
            <span>선공 규칙</span>
            <select data-role="starter-rule" aria-label="선공 규칙">
              <option value="alternate" selected>라운드마다 번갈아</option>
              <option value="black">항상 흑돌</option>
              <option value="white">항상 백돌</option>
            </select>
          </label>
          <p>첫 수가 놓이면 현재 매치 동안 설정이 잠깁니다.</p>
        </fieldset>

        <div class="omok-actions">
          <button class="omok-button" type="button" data-role="undo" disabled>한 수 무르기</button>
          <button class="omok-button omok-button--primary" type="button" data-role="next-round" hidden>
            다음 라운드
          </button>
        </div>

        <details class="omok-keyboard-controls">
          <summary>키보드 좌표로 착수</summary>
          <p id="omok-keyboard-help">오목판에서 방향키로 이동하고 Enter 또는 Space로 착수할 수도 있습니다.</p>
          <div class="omok-coordinate-controls">
            <label>행 <select data-role="row-select" aria-label="착수할 행"></select></label>
            <label>열 <select data-role="column-select" aria-label="착수할 열"></select></label>
            <button class="omok-button omok-button--compact" type="button" data-role="place-coordinate">
              이곳에 놓기
            </button>
          </div>
        </details>

        <details class="omok-history">
          <summary>착수 기록 <span data-role="move-count">0수</span></summary>
          <ol data-role="move-list"></ol>
        </details>
      </aside>
    </div>
  </section>
`;

interface OmokView {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly player1Card: HTMLElement;
  readonly player2Card: HTMLElement;
  readonly player1Name: HTMLElement;
  readonly player2Name: HTMLElement;
  readonly player1Score: HTMLElement;
  readonly player2Score: HTMLElement;
  readonly roundLabel: HTMLElement;
  readonly matchGoal: HTMLElement;
  readonly turnLabel: HTMLElement;
  readonly coordinateLabel: HTMLElement;
  readonly status: HTMLElement;
  readonly pauseOverlay: HTMLElement;
  readonly placementControls: HTMLElement;
  readonly pendingCoordinate: HTMLElement;
  readonly pendingDescription: HTMLElement;
  readonly confirmPlacementButton: HTMLButtonElement;
  readonly cancelPlacementButton: HTMLButtonElement;
  readonly undoButton: HTMLButtonElement;
  readonly nextRoundButton: HTMLButtonElement;
  readonly bestOfSelect: HTMLSelectElement;
  readonly starterRuleSelect: HTMLSelectElement;
  readonly rowSelect: HTMLSelectElement;
  readonly columnSelect: HTMLSelectElement;
  readonly placeCoordinateButton: HTMLButtonElement;
  readonly moveCount: HTMLElement;
  readonly moveList: HTMLOListElement;
}

function getView(root: HTMLElement): OmokView {
  return {
    root: queryRequired(root, '[data-omok-root]'),
    canvas: queryRequired(root, '[data-role="canvas"]'),
    player1Card: queryRequired(root, '[data-role="player-1-card"]'),
    player2Card: queryRequired(root, '[data-role="player-2-card"]'),
    player1Name: queryRequired(root, '[data-role="player-1-name"]'),
    player2Name: queryRequired(root, '[data-role="player-2-name"]'),
    player1Score: queryRequired(root, '[data-role="player-1-score"]'),
    player2Score: queryRequired(root, '[data-role="player-2-score"]'),
    roundLabel: queryRequired(root, '[data-role="round-label"]'),
    matchGoal: queryRequired(root, '[data-role="match-goal"]'),
    turnLabel: queryRequired(root, '[data-role="turn-label"]'),
    coordinateLabel: queryRequired(root, '[data-role="coordinate-label"]'),
    status: queryRequired(root, '[data-role="status"]'),
    pauseOverlay: queryRequired(root, '[data-role="pause-overlay"]'),
    placementControls: queryRequired(root, '[data-role="placement-controls"]'),
    pendingCoordinate: queryRequired(root, '[data-role="pending-coordinate"]'),
    pendingDescription: queryRequired(root, '[data-role="pending-description"]'),
    confirmPlacementButton: queryRequired(root, '[data-role="confirm-placement"]'),
    cancelPlacementButton: queryRequired(root, '[data-role="cancel-placement"]'),
    undoButton: queryRequired(root, '[data-role="undo"]'),
    nextRoundButton: queryRequired(root, '[data-role="next-round"]'),
    bestOfSelect: queryRequired(root, '[data-role="best-of"]'),
    starterRuleSelect: queryRequired(root, '[data-role="starter-rule"]'),
    rowSelect: queryRequired(root, '[data-role="row-select"]'),
    columnSelect: queryRequired(root, '[data-role="column-select"]'),
    placeCoordinateButton: queryRequired(root, '[data-role="place-coordinate"]'),
    moveCount: queryRequired(root, '[data-role="move-count"]'),
    moveList: queryRequired(root, '[data-role="move-list"]'),
  };
}

function coordinateName(coordinate: Coordinate): string {
  return `${COLUMN_LABELS[coordinate.col] ?? '?'}${String(coordinate.row + 1)}`;
}

function sameCoordinate(left: Coordinate | null, right: Coordinate | null): boolean {
  return left !== null && right !== null && left.row === right.row && left.col === right.col;
}

function matchLabel(bestOf: MatchLength): string {
  if (bestOf === 1) return '단판 승부';
  return `${String(bestOf)}판 ${String(winsRequired(bestOf))}선승`;
}

export function createGame(services: GameServices): MiniGameController {
  let view: OmokView | null = null;
  let surface: CanvasSurface | null = null;
  let listeners: AbortController | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let animationFrame: number | null = null;
  let animationProgress = 1;
  let phase: GamePhase = 'idle';
  let roundState: RoundState = createRoundState(1);
  let scores: [number, number] = [0, 0];
  let bestOf: MatchLength = 3;
  let starterRule: StarterRule = 'alternate';
  let roundNumber = 1;
  let hoverCell: Coordinate | null = null;
  let pendingCell: Coordinate | null = null;
  let keyboardCell: Coordinate = { row: 7, col: 7 };
  let keyboardCursorVisible = false;
  let completionSent = false;

  const playerName = (player: Player): string => {
    const name = services.getPlayerName(player).trim();
    return name || `PLAYER ${String(player)}`;
  };

  const stoneName = (player: Player): string => (player === 1 ? '흑돌' : '백돌');

  const isInteractive = (): boolean => phase === 'playing' && roundState.status === 'playing';

  const usesConfirmPlacement = (): boolean =>
    matchMedia('(pointer: coarse)').matches || window.innerWidth <= 560;

  const isEmptyCoordinate = (coordinate: Coordinate): boolean =>
    roundState.board[coordinate.row]?.[coordinate.col] === 0;

  const settingsLocked = (): boolean =>
    roundNumber !== 1 ||
    scores[0] !== 0 ||
    scores[1] !== 0 ||
    roundState.history.length !== 0 ||
    roundState.status !== 'playing';

  const setStatus = (message: string): void => {
    if (view) view.status.textContent = message;
  };

  const setPhase = (nextPhase: GamePhase, message?: string): void => {
    phase = nextPhase;
    services.setPhase(nextPhase, message);
  };

  const cancelAnimation = (): void => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
  };

  const activePreview = (): Coordinate | null => {
    if (!isInteractive()) return null;
    if (pendingCell) return pendingCell;
    if (hoverCell) return hoverCell;
    return keyboardCursorVisible ? keyboardCell : null;
  };

  const pointForCell = (coordinate: Coordinate): Coordinate => ({
    row: BOARD_MARGIN + coordinate.row * BOARD_SPACING,
    col: BOARD_MARGIN + coordinate.col * BOARD_SPACING,
  });

  const drawStone = (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: Player,
    alpha = 1,
  ): void => {
    context.save();
    context.globalAlpha = alpha;
    context.shadowColor = player === 1 ? 'rgba(2, 6, 12, 0.65)' : 'rgba(20, 27, 35, 0.4)';
    context.shadowBlur = 8;
    context.shadowOffsetY = 4;
    const gradient = context.createRadialGradient(x - 7, y - 8, 2, x, y, 20);
    if (player === 1) {
      gradient.addColorStop(0, '#6f7c88');
      gradient.addColorStop(0.3, '#202932');
      gradient.addColorStop(1, '#05080c');
    } else {
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.52, '#edf1f3');
      gradient.addColorStop(1, '#aeb9c0');
    }
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, 18.5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  };

  const drawWinningEffect = (context: CanvasRenderingContext2D): void => {
    const first = roundState.winningLine[0];
    const last = roundState.winningLine.at(-1);
    if (!first || !last) return;

    const firstPoint = pointForCell(first);
    const lastPoint = pointForCell(last);
    const startX = firstPoint.col;
    const startY = firstPoint.row;
    const endX = startX + (lastPoint.col - startX) * animationProgress;
    const endY = startY + (lastPoint.row - startY) * animationProgress;

    context.save();
    context.strokeStyle = '#ffdc5e';
    context.lineWidth = 6;
    context.lineCap = 'round';
    context.shadowColor = '#ffdc5e';
    context.shadowBlur = 18;
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();

    const middleX = (firstPoint.col + lastPoint.col) / 2;
    const middleY = (firstPoint.row + lastPoint.row) / 2;
    context.globalAlpha = Math.max(0, 1 - animationProgress) * 0.75;
    context.strokeStyle = '#fff4b0';
    context.lineWidth = 3;
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const innerRadius = 28 + animationProgress * 30;
      const outerRadius = innerRadius + 18;
      context.beginPath();
      context.moveTo(
        middleX + Math.cos(angle) * innerRadius,
        middleY + Math.sin(angle) * innerRadius,
      );
      context.lineTo(
        middleX + Math.cos(angle) * outerRadius,
        middleY + Math.sin(angle) * outerRadius,
      );
      context.stroke();
    }
    context.restore();
  };

  const draw = (): void => {
    if (!surface) return;
    const context = surface.context;
    context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const background = context.createLinearGradient(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    background.addColorStop(0, '#e3ad62');
    background.addColorStop(0.52, '#c88743');
    background.addColorStop(1, '#a8632f');
    context.fillStyle = background;
    context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    context.save();
    context.strokeStyle = 'rgba(82, 43, 20, 0.08)';
    context.lineWidth = 1.4;
    for (let index = 0; index < 22; index += 1) {
      const y = 18 + index * 34 + Math.sin(index * 1.7) * 7;
      context.beginPath();
      context.moveTo(-20, y);
      context.bezierCurveTo(180, y + 15, 520, y - 12, 740, y + 5);
      context.stroke();
    }
    context.restore();

    context.strokeStyle = 'rgba(48, 25, 12, 0.72)';
    context.lineWidth = 1.25;
    for (let index = 0; index < BOARD_SIZE; index += 1) {
      const position = BOARD_MARGIN + index * BOARD_SPACING;
      context.beginPath();
      context.moveTo(BOARD_MARGIN, position);
      context.lineTo(CANVAS_SIZE - BOARD_MARGIN, position);
      context.stroke();
      context.beginPath();
      context.moveTo(position, BOARD_MARGIN);
      context.lineTo(position, CANVAS_SIZE - BOARD_MARGIN);
      context.stroke();
    }

    context.fillStyle = 'rgba(47, 24, 11, 0.8)';
    for (const [row, col] of STAR_POINTS) {
      context.beginPath();
      context.arc(
        BOARD_MARGIN + col * BOARD_SPACING,
        BOARD_MARGIN + row * BOARD_SPACING,
        4,
        0,
        Math.PI * 2,
      );
      context.fill();
    }

    context.save();
    context.fillStyle = 'rgba(48, 25, 12, 0.72)';
    context.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    for (let index = 0; index < BOARD_SIZE; index += 1) {
      const position = BOARD_MARGIN + index * BOARD_SPACING;
      context.fillText(COLUMN_LABELS[index] ?? '', position, 23);
      context.fillText(String(index + 1), 23, position);
    }
    context.restore();

    const preview = activePreview();
    if (preview && isEmptyCoordinate(preview)) {
      const point = pointForCell(preview);
      drawStone(context, point.col, point.row, roundState.turn, 0.38);
      context.save();
      context.strokeStyle = pendingCell ? '#fff5a8' : 'rgba(255, 244, 176, 0.88)';
      context.lineWidth = pendingCell ? 5 : 2;
      context.beginPath();
      context.arc(point.col, point.row, pendingCell ? 27 : 22, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }

    if (pendingCell) {
      const point = pointForCell(pendingCell);
      context.save();
      context.strokeStyle = isEmptyCoordinate(pendingCell) ? '#fff5a8' : '#ff5d9e';
      context.lineWidth = 4;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(point.col - 34, point.row);
      context.lineTo(point.col - 15, point.row);
      context.moveTo(point.col + 15, point.row);
      context.lineTo(point.col + 34, point.row);
      context.moveTo(point.col, point.row - 34);
      context.lineTo(point.col, point.row - 15);
      context.moveTo(point.col, point.row + 15);
      context.lineTo(point.col, point.row + 34);
      context.stroke();
      context.restore();
    }

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const player = roundState.board[row]?.[col];
        if (player !== 1 && player !== 2) continue;
        drawStone(
          context,
          BOARD_MARGIN + col * BOARD_SPACING,
          BOARD_MARGIN + row * BOARD_SPACING,
          player,
        );
      }
    }

    const lastMove = roundState.history.at(-1);
    if (lastMove) {
      const point = pointForCell(lastMove);
      context.save();
      context.fillStyle = lastMove.player === 1 ? '#ffda45' : '#ec397c';
      context.strokeStyle = lastMove.player === 1 ? '#2a1d08' : '#7b1741';
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(point.col, point.row, 4.4, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.restore();
    }

    if (roundState.winningLine.length >= 5) drawWinningEffect(context);
  };

  const startWinAnimation = (): void => {
    cancelAnimation();
    if (services.isReducedMotion()) {
      animationProgress = 1;
      draw();
      return;
    }

    animationProgress = 0;
    const startTime = performance.now();
    const tick = (time: number): void => {
      animationProgress = Math.min(1, (time - startTime) / 760);
      draw();
      if (animationProgress < 1) animationFrame = requestAnimationFrame(tick);
      else animationFrame = null;
    };
    animationFrame = requestAnimationFrame(tick);
  };

  const syncMoveHistory = (): void => {
    if (!view) return;
    const fragment = document.createDocumentFragment();
    roundState.history.forEach((move, index) => {
      const item = document.createElement('li');
      item.textContent = `${String(index + 1)}. ${playerName(move.player)} ${stoneName(move.player)} · ${coordinateName(move)}`;
      fragment.append(item);
    });
    view.moveList.replaceChildren(fragment);
    view.moveCount.textContent = `${String(roundState.history.length)}수`;
  };

  const syncUI = (): void => {
    if (!view) return;
    const target = winsRequired(bestOf);
    const activePlayer = roundState.status === 'playing' ? roundState.turn : roundState.winner;
    const locked = settingsLocked();

    view.player1Name.textContent = playerName(1);
    view.player2Name.textContent = playerName(2);
    view.player1Score.textContent = String(scores[0]);
    view.player2Score.textContent = String(scores[1]);
    view.roundLabel.textContent = `ROUND ${String(roundNumber)} · ${matchLabel(bestOf)}`;
    view.matchGoal.textContent = `먼저 ${String(target)}승`;
    view.player1Card.dataset.active = activePlayer === 1 ? 'true' : 'false';
    view.player2Card.dataset.active = activePlayer === 2 ? 'true' : 'false';

    if (roundState.status === 'draw') view.turnLabel.textContent = '이번 라운드 무승부';
    else if (roundState.status === 'won' && roundState.winner !== 0) {
      view.turnLabel.textContent = `${playerName(roundState.winner)} · ${stoneName(roundState.winner)} 승리`;
    } else if (phase === 'paused') view.turnLabel.textContent = '대국 일시정지';
    else
      view.turnLabel.textContent = `${playerName(roundState.turn)} · ${stoneName(roundState.turn)} 차례`;

    view.bestOfSelect.value = String(bestOf);
    view.starterRuleSelect.value = starterRule;
    view.bestOfSelect.disabled = locked;
    view.starterRuleSelect.disabled = locked;
    view.undoButton.disabled = !isInteractive() || roundState.history.length === 0;
    view.undoButton.title =
      roundState.status === 'playing'
        ? '진행 중인 라운드의 마지막 수만 되돌립니다.'
        : '끝난 라운드는 되돌릴 수 없습니다.';
    view.nextRoundButton.hidden = phase !== 'roundOver' && phase !== 'matchOver';
    view.nextRoundButton.textContent = phase === 'matchOver' ? '새 매치' : '다음 라운드';
    view.pauseOverlay.hidden = phase !== 'paused';
    view.placeCoordinateButton.disabled = !isInteractive() || !isEmptyCoordinate(keyboardCell);
    view.rowSelect.disabled = !isInteractive();
    view.columnSelect.disabled = !isInteractive();

    const selectedCoordinate = pendingCell ?? hoverCell ?? keyboardCell;
    view.coordinateLabel.textContent = `선택 위치 · ${coordinateName(selectedCoordinate)}`;
    const showPlacementControls = usesConfirmPlacement() && pendingCell !== null && isInteractive();
    view.placementControls.hidden = !showPlacementControls;
    view.confirmPlacementButton.disabled =
      !showPlacementControls || pendingCell === null || !isEmptyCoordinate(pendingCell);
    view.cancelPlacementButton.disabled = !showPlacementControls;
    if (pendingCell) {
      view.pendingCoordinate.textContent = coordinateName(pendingCell);
      view.pendingDescription.textContent = isEmptyCoordinate(pendingCell)
        ? `${stoneName(roundState.turn)}을 놓을 위치`
        : '이미 돌이 있는 교차점';
    }
    const lastMove = roundState.history.at(-1);
    const pendingDescription = pendingCell
      ? ` ${coordinateName(pendingCell)} 선택, ${isEmptyCoordinate(pendingCell) ? '빈 교차점' : '이미 돌이 있는 교차점'}.`
      : '';
    const boardDescription = lastMove
      ? `15행 15열 오목판. ${String(roundState.history.length)}수 진행. 마지막 수 ${playerName(lastMove.player)} ${coordinateName(lastMove)}.`
      : `15행 15열 오목판. ${stoneName(roundState.turn)}이 선공합니다.`;
    view.canvas.setAttribute('aria-label', `${boardDescription}${pendingDescription}`);
    syncMoveHistory();
  };

  const finishRound = (): void => {
    if (roundState.status === 'draw') {
      const message = '빈 교차점이 모두 차 이번 라운드는 무승부입니다.';
      setPhase('roundOver', message);
      setStatus(`${message} 다음 라운드를 시작하세요.`);
      services.audio.score();
      syncUI();
      draw();
      return;
    }

    if (roundState.winner === 0) return;
    const winner = roundState.winner;
    scores = winner === 1 ? [scores[0] + 1, scores[1]] : [scores[0], scores[1] + 1];
    const winnerScore = winner === 1 ? scores[0] : scores[1];
    const wonMatch = winnerScore >= winsRequired(bestOf);
    const winningStart = roundState.winningLine[0];
    const winningEnd = roundState.winningLine.at(-1);
    const winningCoordinates =
      winningStart && winningEnd
        ? ` ${coordinateName(winningStart)}부터 ${coordinateName(winningEnd)}까지`
        : '';
    const roundMessage = `${playerName(winner)}의 ${stoneName(winner)}이${winningCoordinates} 다섯 개 이상 연결됐습니다.`;

    if (wonMatch) {
      setPhase('matchOver', roundMessage);
      setStatus(`${roundMessage} ${matchLabel(bestOf)} 최종 승리!`);
      if (!completionSent) {
        completionSent = true;
        services.complete({
          winner,
          headline: `${playerName(winner)} 승리!`,
          detail: `${matchLabel(bestOf)} · ${String(scores[0])} : ${String(scores[1])}`,
          score: [scores[0], scores[1]],
        });
      }
    } else {
      setPhase('roundOver', roundMessage);
      setStatus(`${roundMessage} 다음 라운드에서는 선공 규칙이 다시 적용됩니다.`);
      services.audio.score(winner);
    }
    syncUI();
    startWinAnimation();
  };

  const placeAt = (coordinate: Coordinate): void => {
    if (!isInteractive()) return;
    const result = placeStone(roundState, coordinate.row, coordinate.col);
    if (!result.accepted) {
      if (result.reason === 'occupied')
        setStatus(`${coordinateName(coordinate)}에는 이미 돌이 있습니다.`);
      return;
    }

    const placedMove = result.state.history.at(-1);
    roundState = result.state;
    hoverCell = null;
    pendingCell = null;
    keyboardCell = coordinate;
    if (view) {
      view.rowSelect.value = String(coordinate.row);
      view.columnSelect.value = String(coordinate.col);
    }
    services.audio.hit(placedMove?.player === 1 ? 0.48 : 0.68);

    if (roundState.status !== 'playing') {
      finishRound();
      return;
    }

    setStatus(
      `${playerName(placedMove?.player ?? 1)}이 ${coordinateName(coordinate)}에 놓았습니다. ${playerName(roundState.turn)} 차례입니다.`,
    );
    syncUI();
    draw();
  };

  const pointerCoordinate = (event: PointerEvent): Coordinate | null => {
    if (!surface) return null;
    const point = surface.pointFromEvent(event);
    const col = Math.round((point.x - BOARD_MARGIN) / BOARD_SPACING);
    const row = Math.round((point.y - BOARD_MARGIN) / BOARD_SPACING);
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;
    const targetX = BOARD_MARGIN + col * BOARD_SPACING;
    const targetY = BOARD_MARGIN + row * BOARD_SPACING;
    if (Math.hypot(point.x - targetX, point.y - targetY) > BOARD_SPACING * 0.47) return null;
    return { row, col };
  };

  const updateCoordinateControls = (): void => {
    if (!view) return;
    pendingCell = null;
    keyboardCell = {
      row: Number.parseInt(view.rowSelect.value, 10),
      col: Number.parseInt(view.columnSelect.value, 10),
    };
    syncUI();
    draw();
  };

  const populateCoordinateControls = (): void => {
    if (!view) return;
    const rowFragment = document.createDocumentFragment();
    const columnFragment = document.createDocumentFragment();
    for (let index = 0; index < BOARD_SIZE; index += 1) {
      const rowOption = document.createElement('option');
      rowOption.value = String(index);
      rowOption.textContent = `${String(index + 1)}행`;
      rowFragment.append(rowOption);

      const columnOption = document.createElement('option');
      columnOption.value = String(index);
      columnOption.textContent = `${COLUMN_LABELS[index] ?? ''}열`;
      columnFragment.append(columnOption);
    }
    view.rowSelect.replaceChildren(rowFragment);
    view.columnSelect.replaceChildren(columnFragment);
    view.rowSelect.value = String(keyboardCell.row);
    view.columnSelect.value = String(keyboardCell.col);
  };

  const beginNextRound = (): void => {
    cancelAnimation();
    animationProgress = 1;
    roundNumber += 1;
    roundState = createRoundState(starterForRound(starterRule, roundNumber));
    hoverCell = null;
    pendingCell = null;
    keyboardCell = { row: 7, col: 7 };
    keyboardCursorVisible = false;
    setPhase('playing', `오목 ${String(roundNumber)}라운드`);
    setStatus(
      `${String(roundNumber)}라운드를 시작합니다. ${playerName(roundState.turn)}의 ${stoneName(roundState.turn)}이 선공합니다.`,
    );
    if (view) {
      view.rowSelect.value = '7';
      view.columnSelect.value = '7';
    }
    syncUI();
    draw();
  };

  const teardownView = (): void => {
    cancelAnimation();
    listeners?.abort();
    listeners = null;
    resizeObserver?.disconnect();
    resizeObserver = null;
    view?.root.remove();
    view = null;
    surface = null;
  };

  const mount = (container: HTMLElement): void => {
    teardownView();
    container.innerHTML = MARKUP;
    view = getView(container);
    surface = createCanvasSurface(view.canvas, CANVAS_SIZE, CANVAS_SIZE, 2);
    listeners = new AbortController();
    const signal = listeners.signal;
    populateCoordinateControls();

    view.canvas.addEventListener(
      'pointermove',
      (event) => {
        if (!isInteractive() || usesConfirmPlacement()) return;
        const coordinate = pointerCoordinate(event);
        if (
          (coordinate === null && hoverCell === null) ||
          (coordinate !== null &&
            hoverCell !== null &&
            coordinate.row === hoverCell.row &&
            coordinate.col === hoverCell.col)
        ) {
          return;
        }
        hoverCell = coordinate;
        if (coordinate && view)
          view.coordinateLabel.textContent = `선택 위치 · ${coordinateName(coordinate)}`;
        draw();
      },
      { signal },
    );
    view.canvas.addEventListener(
      'pointerleave',
      () => {
        hoverCell = null;
        if (view) view.coordinateLabel.textContent = `선택 위치 · ${coordinateName(keyboardCell)}`;
        draw();
      },
      { signal },
    );
    view.canvas.addEventListener(
      'pointerdown',
      (event) => {
        if (!isInteractive() || event.button !== 0) return;
        const coordinate = pointerCoordinate(event);
        if (!coordinate) return;
        event.preventDefault();
        view?.canvas.focus({ preventScroll: true });
        keyboardCell = coordinate;
        if (view) {
          view.rowSelect.value = String(coordinate.row);
          view.columnSelect.value = String(coordinate.col);
        }
        if (usesConfirmPlacement()) {
          const unchanged = sameCoordinate(pendingCell, coordinate);
          pendingCell = coordinate;
          hoverCell = null;
          if (!unchanged) {
            setStatus(
              isEmptyCoordinate(coordinate)
                ? `${coordinateName(coordinate)}를 선택했습니다. 이 위치에 놓기 버튼으로 확정하세요.`
                : `${coordinateName(coordinate)}에는 이미 돌이 있습니다. 다른 위치를 선택하세요.`,
            );
          }
          syncUI();
          draw();
          return;
        }
        placeAt(coordinate);
      },
      { signal },
    );
    view.canvas.addEventListener(
      'focus',
      () => {
        keyboardCursorVisible = true;
        draw();
      },
      { signal },
    );
    view.canvas.addEventListener(
      'blur',
      () => {
        keyboardCursorVisible = false;
        draw();
      },
      { signal },
    );
    view.canvas.addEventListener(
      'keydown',
      (event) => {
        if (!isInteractive()) return;
        let nextRow = keyboardCell.row;
        let nextCol = keyboardCell.col;
        if (event.key === 'ArrowUp') nextRow = Math.max(0, nextRow - 1);
        else if (event.key === 'ArrowDown') nextRow = Math.min(BOARD_SIZE - 1, nextRow + 1);
        else if (event.key === 'ArrowLeft') nextCol = Math.max(0, nextCol - 1);
        else if (event.key === 'ArrowRight') nextCol = Math.min(BOARD_SIZE - 1, nextCol + 1);
        else if (event.key === 'Home') {
          nextRow = 0;
          nextCol = 0;
        } else if (event.key === 'End') {
          nextRow = BOARD_SIZE - 1;
          nextCol = BOARD_SIZE - 1;
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          placeAt(keyboardCell);
          return;
        } else return;

        event.preventDefault();
        hoverCell = null;
        pendingCell = null;
        keyboardCell = { row: nextRow, col: nextCol };
        if (view) {
          view.rowSelect.value = String(nextRow);
          view.columnSelect.value = String(nextCol);
          view.coordinateLabel.textContent = `선택 위치 · ${coordinateName(keyboardCell)}`;
          view.placementControls.hidden = true;
          view.placeCoordinateButton.disabled = !isEmptyCoordinate(keyboardCell);
          view.canvas.setAttribute(
            'aria-label',
            `${coordinateName(keyboardCell)} 선택. ${roundState.board[nextRow]?.[nextCol] === 0 ? '빈 교차점' : '이미 돌이 있는 교차점'}.`,
          );
        }
        draw();
      },
      { signal },
    );

    view.undoButton.addEventListener(
      'click',
      () => {
        const lastMove = roundState.history.at(-1);
        if (!lastMove) return;
        const approved = window.confirm(
          `${coordinateName(lastMove)}의 마지막 수를 무를까요? 상대와 확인한 뒤 진행하세요.`,
        );
        if (!approved) {
          setStatus('한 수 무르기를 취소했습니다. 현재 대국을 그대로 이어갑니다.');
          return;
        }
        const result = undoLastMove(roundState);
        if (!result.undone) return;
        roundState = result.state;
        hoverCell = null;
        pendingCell = null;
        keyboardCell = { row: result.move.row, col: result.move.col };
        services.audio.hit(0.25);
        setStatus(
          `${coordinateName(result.move)}의 마지막 수를 되돌렸습니다. ${playerName(roundState.turn)} 차례입니다.`,
        );
        syncUI();
        draw();
      },
      { signal },
    );
    view.confirmPlacementButton.addEventListener(
      'click',
      () => {
        if (!pendingCell || !isEmptyCoordinate(pendingCell)) return;
        placeAt(pendingCell);
      },
      { signal },
    );
    view.cancelPlacementButton.addEventListener(
      'click',
      () => {
        if (!pendingCell) return;
        const cancelled = pendingCell;
        pendingCell = null;
        hoverCell = null;
        setStatus(`${coordinateName(cancelled)} 선택을 취소했습니다. 다른 위치를 선택하세요.`);
        syncUI();
        draw();
        view?.canvas.focus({ preventScroll: true });
      },
      { signal },
    );
    view.nextRoundButton.addEventListener(
      'click',
      () => {
        if (phase === 'matchOver') {
          reset();
          start();
        } else if (phase === 'roundOver') beginNextRound();
      },
      { signal },
    );
    view.bestOfSelect.addEventListener(
      'change',
      () => {
        if (!view || settingsLocked()) return;
        const parsed = Number.parseInt(view.bestOfSelect.value, 10);
        if (!isMatchLength(parsed)) return;
        bestOf = parsed;
        setStatus(`${matchLabel(bestOf)}으로 설정했습니다.`);
        syncUI();
      },
      { signal },
    );
    view.starterRuleSelect.addEventListener(
      'change',
      () => {
        if (!view || settingsLocked()) return;
        const selected = view.starterRuleSelect.value;
        if (selected !== 'alternate' && selected !== 'black' && selected !== 'white') return;
        starterRule = selected;
        roundState = createRoundState(starterForRound(starterRule, roundNumber));
        pendingCell = null;
        const message = `${stoneName(roundState.turn)} 선공으로 설정했습니다.`;
        setStatus(message);
        syncUI();
        draw();
      },
      { signal },
    );
    view.rowSelect.addEventListener('change', updateCoordinateControls, { signal });
    view.columnSelect.addEventListener('change', updateCoordinateControls, { signal });
    view.placeCoordinateButton.addEventListener('click', () => placeAt(keyboardCell), { signal });

    window.addEventListener(
      'resize',
      () => {
        if (!usesConfirmPlacement()) pendingCell = null;
        surface?.resize();
        syncUI();
        draw();
      },
      { signal },
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'hidden' && phase === 'playing') pause();
      },
      { signal },
    );
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        surface?.resize();
        draw();
      });
      resizeObserver.observe(view.canvas);
    }

    syncUI();
    draw();
  };

  const enter = (): void => {
    if (!view || !surface) return;
    surface.resize();
    setPhase('idle', '오목 준비');
    setStatus(`${matchLabel(bestOf)} 준비 완료. 시작 버튼을 눌러주세요.`);
    syncUI();
    draw();
  };

  const start = (): void => {
    if (!view) return;
    if (phase === 'paused') {
      resume();
      return;
    }
    if (phase === 'roundOver') {
      beginNextRound();
      return;
    }
    if (phase === 'matchOver') {
      reset();
    }
    if (phase !== 'idle') return;

    setPhase('playing', '오목 대국 중');
    setStatus(`${playerName(roundState.turn)}의 ${stoneName(roundState.turn)}이 선공합니다.`);
    syncUI();
    draw();
  };

  const pause = (): void => {
    if (phase !== 'playing') return;
    setPhase('paused', '오목 일시정지');
    setStatus('대국을 일시정지했습니다. 준비되면 재개해주세요.');
    syncUI();
    draw();
  };

  const resume = (): void => {
    if (phase !== 'paused') return;
    setPhase('playing', '오목 대국 재개');
    setStatus(`${playerName(roundState.turn)} 차례로 대국을 재개합니다.`);
    syncUI();
    draw();
  };

  const reset = (options?: { preserveMatchScore?: boolean }): boolean => {
    cancelAnimation();
    animationProgress = 1;
    const preserveScore = options?.preserveMatchScore === true && phase !== 'matchOver';
    if (preserveScore) roundNumber += 1;
    else {
      scores = [0, 0];
      roundNumber = 1;
      completionSent = false;
    }
    roundState = createRoundState(starterForRound(starterRule, roundNumber));
    hoverCell = null;
    pendingCell = null;
    keyboardCell = { row: 7, col: 7 };
    keyboardCursorVisible = false;
    setPhase('idle', '오목 다시 준비');
    setStatus(
      preserveScore
        ? `매치 점수를 유지하고 ${String(roundNumber)}라운드를 준비했습니다.`
        : `${matchLabel(bestOf)} 새 매치를 준비했습니다.`,
    );
    if (view) {
      view.rowSelect.value = '7';
      view.columnSelect.value = '7';
    }
    syncUI();
    draw();
    return true;
  };

  const destroy = (): void => {
    teardownView();
    pendingCell = null;
    phase = 'idle';
  };

  return { mount, enter, start, pause, resume, reset, destroy };
}
