export const OMOK_EXAMPLES: readonly {
  id: string;
  label: string;
  moves: readonly (readonly [number, number])[];
  winningColumns: readonly number[];
  blockColumn: number;
}[];
export const LADDER_EXAMPLE: {
  mapping: readonly number[];
  rowCount: number;
  rungs: readonly { row: number; left: number }[];
};
export const REACTION_EXAMPLES: readonly {
  signalAt: number;
  p1PressedAt: number | null;
  p2PressedAt: number | null;
  winner: 0 | 1 | 2;
}[];
