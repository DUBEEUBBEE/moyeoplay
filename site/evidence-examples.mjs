// Coordinates are zero-based in the engine. Public diagrams and prose use 1–15.
export const OMOK_EXAMPLES = Object.freeze([
  {
    id: 'closed-four',
    label: '한쪽이 막힌 네 돌',
    moves: [
      [7, 5],
      [7, 4],
      [7, 6],
      [3, 3],
      [7, 7],
      [3, 4],
      [7, 8],
    ],
    winningColumns: [9],
    blockColumn: 9,
  },
  {
    id: 'open-four',
    label: '양끝이 열린 네 돌',
    moves: [
      [7, 5],
      [3, 3],
      [7, 6],
      [3, 4],
      [7, 7],
      [4, 3],
      [7, 8],
    ],
    winningColumns: [4, 9],
    blockColumn: 4,
  },
  {
    id: 'gap-four',
    label: '가운데가 비어 있는 네 돌',
    moves: [
      [7, 4],
      [3, 3],
      [7, 5],
      [3, 4],
      [7, 7],
      [4, 3],
      [7, 8],
    ],
    winningColumns: [6],
    blockColumn: 6,
  },
]);

export const LADDER_EXAMPLE = Object.freeze({
  mapping: [2, 0, 1],
  rowCount: 14,
  rungs: [
    { row: 6, left: 0 },
    { row: 7, left: 1 },
  ],
});

export const REACTION_EXAMPLES = Object.freeze([
  { signalAt: 1000, p1PressedAt: 1200, p2PressedAt: 1208, winner: 0 },
  { signalAt: 1000, p1PressedAt: 1200, p2PressedAt: 1209, winner: 1 },
  { signalAt: 1000, p1PressedAt: null, p2PressedAt: 1220, winner: 2 },
]);
