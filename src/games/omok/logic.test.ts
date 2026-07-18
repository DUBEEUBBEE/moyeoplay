import { describe, expect, it } from 'vitest';

import {
  BOARD_SIZE,
  createBoard,
  createRoundState,
  evaluateRound,
  findWinningLine,
  isBoardFull,
  placeStone,
  starterForRound,
  undoLastMove,
  winsRequired,
  type Board,
  type Cell,
  type Move,
  type Player,
  type RoundState,
} from './logic';

function mutableBoard(): Cell[][] {
  return createBoard().map((row) => [...row]);
}

function lineBoard(cells: readonly (readonly [number, number])[], player: Player = 1): Board {
  const board = mutableBoard();
  for (const [row, col] of cells) {
    const targetRow = board[row];
    if (!targetRow) throw new Error('Test coordinate is outside the board.');
    targetRow[col] = player;
  }
  return board;
}

describe('15x15 freestyle win detection', () => {
  it('creates the required default board', () => {
    const board = createBoard();
    expect(board).toHaveLength(BOARD_SIZE);
    expect(board.every((row) => row.length === BOARD_SIZE)).toBe(true);
  });

  it.each([
    [
      'horizontal',
      [
        [7, 4],
        [7, 5],
        [7, 6],
        [7, 7],
        [7, 8],
      ],
    ],
    [
      'vertical',
      [
        [4, 7],
        [5, 7],
        [6, 7],
        [7, 7],
        [8, 7],
      ],
    ],
    [
      'down diagonal',
      [
        [3, 4],
        [4, 5],
        [5, 6],
        [6, 7],
        [7, 8],
      ],
    ],
    [
      'up diagonal',
      [
        [4, 7],
        [5, 6],
        [6, 5],
        [7, 4],
        [8, 3],
      ],
    ],
  ] as const)('detects five or more in the %s direction', (_label, cells) => {
    const board = lineBoard(cells);
    const [row, col] = cells[2];
    expect(findWinningLine(board, row, col, 1)).toEqual(
      cells.map(([cellRow, cellCol]) => ({ row: cellRow, col: cellCol })),
    );
  });

  it('detects lines touching both board edges', () => {
    const rightEdge = [
      [14, 10],
      [14, 11],
      [14, 12],
      [14, 13],
      [14, 14],
    ] as const;
    const topEdgeDiagonal = [
      [0, 14],
      [1, 13],
      [2, 12],
      [3, 11],
      [4, 10],
    ] as const;

    expect(findWinningLine(lineBoard(rightEdge), 14, 14, 1)).toHaveLength(5);
    expect(findWinningLine(lineBoard(topEdgeDiagonal, 2), 0, 14, 2)).toHaveLength(5);
  });

  it('does not report four stones, gaps, or mixed colors as a win', () => {
    expect(
      findWinningLine(
        lineBoard([
          [2, 2],
          [2, 3],
          [2, 4],
          [2, 5],
        ]),
        2,
        4,
        1,
      ),
    ).toEqual([]);
    expect(
      findWinningLine(
        lineBoard([
          [5, 1],
          [5, 2],
          [5, 4],
          [5, 5],
          [5, 6],
        ]),
        5,
        5,
        1,
      ),
    ).toEqual([]);

    const mixed = mutableBoard();
    const mixedRow = mixed[9];
    if (!mixedRow) throw new Error('Expected test row.');
    for (let col = 3; col <= 7; col += 1) mixedRow[col] = col === 5 ? 2 : 1;
    expect(findWinningLine(mixed, 9, 6, 1)).toEqual([]);
  });

  it('accepts and returns the full overline in freestyle rules', () => {
    const overline = [
      [6, 2],
      [6, 3],
      [6, 4],
      [6, 5],
      [6, 6],
      [6, 7],
    ] as const;
    expect(findWinningLine(lineBoard(overline), 6, 4, 1)).toHaveLength(6);
  });
});

describe('round state', () => {
  it('rejects occupied positions, out-of-bounds positions, and moves after completion', () => {
    const initial = createRoundState();
    const first = placeStone(initial, 7, 7);
    expect(first.accepted).toBe(true);
    if (!first.accepted) throw new Error('Expected the first move to be accepted.');

    expect(placeStone(first.state, 7, 7)).toMatchObject({ accepted: false, reason: 'occupied' });
    expect(placeStone(first.state, -1, 7)).toMatchObject({
      accepted: false,
      reason: 'out-of-bounds',
    });

    const winningBoard = lineBoard([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ]);
    const evaluation = evaluateRound(winningBoard, { row: 0, col: 4, player: 1 });
    const finished: RoundState = {
      board: winningBoard,
      turn: 1,
      starter: 1,
      history: [{ row: 0, col: 4, player: 1 }],
      ...evaluation,
    };
    expect(placeStone(finished, 1, 1)).toMatchObject({
      accepted: false,
      reason: 'round-finished',
    });
  });

  it('reports a full board with no winning final line as a draw', () => {
    const board: Cell[][] = Array.from({ length: BOARD_SIZE }, (_unused, row) =>
      Array.from({ length: BOARD_SIZE }, (_unusedCell, col): Cell =>
        (row + Math.floor(col / 2)) % 2 === 0 ? 1 : 2,
      ),
    );
    const finalCell = board[14]?.[14];
    if (finalCell !== 1 && finalCell !== 2) throw new Error('Expected a full board.');
    const lastMove: Move = { row: 14, col: 14, player: finalCell };

    expect(isBoardFull(board)).toBe(true);
    expect(findWinningLine(board, lastMove.row, lastMove.col, lastMove.player)).toEqual([]);
    expect(evaluateRound(board, lastMove)).toEqual({
      status: 'draw',
      winner: 0,
      winningLine: [],
    });
  });

  it('undoes only the active round last move and restores that player turn', () => {
    const initial = createRoundState(2);
    const placed = placeStone(initial, 3, 8);
    if (!placed.accepted) throw new Error('Expected move to be accepted.');

    const undone = undoLastMove(placed.state);
    expect(undone.undone).toBe(true);
    if (!undone.undone) throw new Error('Expected move to be undone.');
    expect(undone.move).toEqual({ row: 3, col: 8, player: 2 });
    expect(undone.state.board[3]?.[8]).toBe(0);
    expect(undone.state.turn).toBe(2);
    expect(undone.state.history).toEqual([]);
    expect(placed.state.board[3]?.[8]).toBe(2);
  });

  it('keeps empty and completed rounds unchanged when undo is unsafe', () => {
    const empty = createRoundState();
    const emptyUndo = undoLastMove(empty);
    expect(emptyUndo).toEqual({ undone: false, reason: 'no-moves', state: empty });

    const board = lineBoard([
      [10, 2],
      [10, 3],
      [10, 4],
      [10, 5],
      [10, 6],
    ]);
    const evaluation = evaluateRound(board, { row: 10, col: 6, player: 1 });
    const won: RoundState = {
      board,
      starter: 1,
      turn: 1,
      history: [{ row: 10, col: 6, player: 1 }],
      ...evaluation,
    };
    expect(undoLastMove(won)).toEqual({ undone: false, reason: 'round-finished', state: won });
  });
});

describe('match options', () => {
  it.each([
    [1, 1],
    [3, 2],
    [5, 3],
  ] as const)('best-of-%i requires %i win(s)', (bestOf, needed) => {
    expect(winsRequired(bestOf)).toBe(needed);
  });

  it('alternates the starter each round while supporting fixed starters', () => {
    expect([1, 2, 3, 4, 5].map((round) => starterForRound('alternate', round))).toEqual([
      1, 2, 1, 2, 1,
    ]);
    expect(starterForRound('black', 4)).toBe(1);
    expect(starterForRound('white', 3)).toBe(2);
  });
});
