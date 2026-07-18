export const BOARD_SIZE = 15;
export const WIN_LENGTH = 5;

export type Player = 1 | 2;
export type Cell = 0 | Player;
export type Board = readonly (readonly Cell[])[];
export type RoundStatus = 'playing' | 'won' | 'draw';
export type MatchLength = 1 | 3 | 5;
export type StarterRule = 'alternate' | 'black' | 'white';

export interface Coordinate {
  readonly row: number;
  readonly col: number;
}

export interface Move extends Coordinate {
  readonly player: Player;
}

export interface RoundState {
  readonly board: Board;
  readonly turn: Player;
  readonly starter: Player;
  readonly history: readonly Move[];
  readonly status: RoundStatus;
  readonly winner: 0 | Player;
  readonly winningLine: readonly Coordinate[];
}

export type RejectedMoveReason = 'out-of-bounds' | 'occupied' | 'round-finished';

export type PlaceStoneResult =
  | { readonly accepted: true; readonly state: RoundState }
  | {
      readonly accepted: false;
      readonly reason: RejectedMoveReason;
      readonly state: RoundState;
    };

export type UndoResult =
  | { readonly undone: true; readonly state: RoundState; readonly move: Move }
  | {
      readonly undone: false;
      readonly reason: 'no-moves' | 'round-finished';
      readonly state: RoundState;
    };

export interface RoundEvaluation {
  readonly status: RoundStatus;
  readonly winner: 0 | Player;
  readonly winningLine: readonly Coordinate[];
}

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const;

function assertBoardSize(size: number): void {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError('Board size must be a positive integer.');
  }
}

function cellAt(board: Board, row: number, col: number): Cell | undefined {
  return board[row]?.[col];
}

function copyBoardWithCell(board: Board, row: number, col: number, cell: Cell): Board {
  return board.map((sourceRow, rowIndex) =>
    rowIndex === row
      ? sourceRow.map((sourceCell, colIndex) => (colIndex === col ? cell : sourceCell))
      : [...sourceRow],
  );
}

export function createBoard(size = BOARD_SIZE): Board {
  assertBoardSize(size);
  return Array.from({ length: size }, () => Array<Cell>(size).fill(0));
}

export function createRoundState(starter: Player = 1, size = BOARD_SIZE): RoundState {
  return {
    board: createBoard(size),
    turn: starter,
    starter,
    history: [],
    status: 'playing',
    winner: 0,
    winningLine: [],
  };
}

export function otherPlayer(player: Player): Player {
  return player === 1 ? 2 : 1;
}

export function isInsideBoard(board: Board, row: number, col: number): boolean {
  return (
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    row < board.length &&
    col >= 0 &&
    col < (board[row]?.length ?? 0)
  );
}

export function isBoardFull(board: Board): boolean {
  return (
    board.length > 0 && board.every((row) => row.length > 0 && row.every((cell) => cell !== 0))
  );
}

/**
 * Returns every contiguous stone on the winning axis. Freestyle Omok accepts
 * five or more stones, so an overline is deliberately returned in full.
 */
export function findWinningLine(
  board: Board,
  row: number,
  col: number,
  player: Player,
  minimumLength = WIN_LENGTH,
): readonly Coordinate[] {
  if (
    !isInsideBoard(board, row, col) ||
    cellAt(board, row, col) !== player ||
    !Number.isInteger(minimumLength) ||
    minimumLength < 1
  ) {
    return [];
  }

  for (const [rowStep, colStep] of DIRECTIONS) {
    const line: Coordinate[] = [{ row, col }];

    let nextRow = row - rowStep;
    let nextCol = col - colStep;
    while (cellAt(board, nextRow, nextCol) === player) {
      line.unshift({ row: nextRow, col: nextCol });
      nextRow -= rowStep;
      nextCol -= colStep;
    }

    nextRow = row + rowStep;
    nextCol = col + colStep;
    while (cellAt(board, nextRow, nextCol) === player) {
      line.push({ row: nextRow, col: nextCol });
      nextRow += rowStep;
      nextCol += colStep;
    }

    if (line.length >= minimumLength) return line;
  }

  return [];
}

export function evaluateRound(
  board: Board,
  lastMove?: Move,
  minimumLength = WIN_LENGTH,
): RoundEvaluation {
  if (lastMove) {
    const winningLine = findWinningLine(
      board,
      lastMove.row,
      lastMove.col,
      lastMove.player,
      minimumLength,
    );
    if (winningLine.length >= minimumLength) {
      return { status: 'won', winner: lastMove.player, winningLine };
    }
  }

  if (isBoardFull(board)) return { status: 'draw', winner: 0, winningLine: [] };
  return { status: 'playing', winner: 0, winningLine: [] };
}

export function placeStone(state: RoundState, row: number, col: number): PlaceStoneResult {
  if (state.status !== 'playing') {
    return { accepted: false, reason: 'round-finished', state };
  }
  if (!isInsideBoard(state.board, row, col)) {
    return { accepted: false, reason: 'out-of-bounds', state };
  }
  if (cellAt(state.board, row, col) !== 0) {
    return { accepted: false, reason: 'occupied', state };
  }

  const move: Move = { row, col, player: state.turn };
  const board = copyBoardWithCell(state.board, row, col, state.turn);
  const evaluation = evaluateRound(board, move);
  const nextState: RoundState = {
    board,
    turn: evaluation.status === 'playing' ? otherPlayer(state.turn) : state.turn,
    starter: state.starter,
    history: [...state.history, move],
    status: evaluation.status,
    winner: evaluation.winner,
    winningLine: evaluation.winningLine,
  };
  return { accepted: true, state: nextState };
}

/**
 * Undo is intentionally allowed only while a round is active. Once a win or
 * draw has committed its result, this function cannot silently roll back a
 * match score.
 */
export function undoLastMove(state: RoundState): UndoResult {
  if (state.status !== 'playing') {
    return { undone: false, reason: 'round-finished', state };
  }
  const move = state.history.at(-1);
  if (!move) return { undone: false, reason: 'no-moves', state };

  const board = copyBoardWithCell(state.board, move.row, move.col, 0);
  return {
    undone: true,
    move,
    state: {
      board,
      turn: move.player,
      starter: state.starter,
      history: state.history.slice(0, -1),
      status: 'playing',
      winner: 0,
      winningLine: [],
    },
  };
}

export function winsRequired(bestOf: MatchLength): number {
  return Math.floor(bestOf / 2) + 1;
}

export function isMatchLength(value: number): value is MatchLength {
  return value === 1 || value === 3 || value === 5;
}

export function starterForRound(rule: StarterRule, roundNumber: number): Player {
  const normalizedRound = Math.max(1, Math.floor(roundNumber));
  if (rule === 'white') return 2;
  if (rule === 'black') return 1;
  return normalizedRound % 2 === 1 ? 1 : 2;
}
