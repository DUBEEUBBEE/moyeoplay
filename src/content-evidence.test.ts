import { describe, expect, it } from 'vitest';
import { LADDER_EXAMPLE, OMOK_EXAMPLES, REACTION_EXAMPLES } from '../site/evidence-examples.mjs';
import { calculateMapping, createLadderForPermutation } from './games/ladder/logic';
import { createRoundState, findWinningLine, placeStone } from './games/omok/logic';
import { resolveReaction } from './games/reaction-duel/logic';

describe('published guide examples use the actual game rules', () => {
  for (const example of OMOK_EXAMPLES) {
    it(`${example.id}: only the marked empty columns complete P1's five`, () => {
      let state = createRoundState();
      for (const [row, col] of example.moves) {
        const result = placeStone(state, row, col);
        expect(result.accepted).toBe(true);
        state = result.state;
        expect(state.status).toBe('playing');
      }
      expect(state.turn).toBe(2);
      const winningColumns = Array.from({ length: 15 }, (_, col) => col).filter((col) => {
        if (state.board[7]?.[col] !== 0) return false;
        const board = state.board.map((row) => [...row]);
        const row = board[7];
        if (!row) throw new Error('Missing row');
        row[col] = 1;
        return findWinningLine(board, 7, col, 1).length >= 5;
      });
      expect(winningColumns).toEqual(example.winningColumns);

      const defended = placeStone(state, 7, example.blockColumn);
      expect(defended.accepted).toBe(true);
      const remainingWins = example.winningColumns.filter((col) => col !== example.blockColumn);
      if (example.id === 'open-four') expect(remainingWins).toHaveLength(1);
      else expect(remainingWins).toEqual([]);
      for (const col of remainingWins) {
        const counter = placeStone(defended.state, 7, col);
        expect(counter.state.status).toBe('won');
        expect(counter.state.winner).toBe(1);
      }
    });
  }

  it('the ladder drawing encodes the stated mapping and the actual generator', () => {
    const layout = createLadderForPermutation(LADDER_EXAMPLE.mapping);
    expect(layout.rowCount).toBe(LADDER_EXAMPLE.rowCount);
    expect(layout.rungs).toEqual(LADDER_EXAMPLE.rungs);
    expect(calculateMapping(3, LADDER_EXAMPLE.rowCount, LADDER_EXAMPLE.rungs)).toEqual(
      LADDER_EXAMPLE.mapping,
    );
  });

  it('the reaction calculation examples include the 8ms boundary', () => {
    for (const example of REACTION_EXAMPLES) {
      expect(
        resolveReaction(example.signalAt, example.p1PressedAt, example.p2PressedAt).winner,
      ).toBe(example.winner);
    }
  });
});
