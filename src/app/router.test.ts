import { describe, expect, it } from 'vitest';
import { gameHash, parseHash } from './router';

describe('hash router', () => {
  it('parses lobby and direct game URLs', () => {
    expect(parseHash('')).toEqual({ kind: 'lobby' });
    expect(parseHash('#lobby')).toEqual({ kind: 'lobby' });
    expect(parseHash('#game/omok')).toEqual({ kind: 'game', gameId: 'omok' });
    expect(gameHash('pinball-drop')).toBe('#game/pinball-drop');
  });

  it('rejects malformed and unknown routes', () => {
    expect(parseHash('#omok')).toBeNull();
    expect(parseHash('#game/not-real')).toBeNull();
    expect(parseHash('#game/omok/more')).toBeNull();
    expect(parseHash('#%E0%A4%A')).toBeNull();
  });
});
