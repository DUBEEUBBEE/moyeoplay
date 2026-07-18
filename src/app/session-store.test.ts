import { describe, expect, it } from 'vitest';
import type { StorageLike } from '../core/storage';
import { migrateSession, SessionStore } from './session-store';

class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

describe('session store', () => {
  it('filters malformed recent matches', () => {
    const state = migrateSession({
      versusWins: [2.9, -3],
      recent: [
        { gameId: 'pong', winner: 1, score: [7, 4], playedAt: '2026-01-01T00:00:00.000Z' },
        { gameId: 'unknown', winner: 2 },
      ],
    });
    expect(state.versusWins).toEqual([2, 0]);
    expect(state.recent).toHaveLength(1);
  });

  it('rejects non-finite win counters from damaged storage', () => {
    const state = migrateSession({ versusWins: [Number.POSITIVE_INFINITY, Number.NaN] });
    expect(state.versusWins).toEqual([0, 0]);
  });

  it('counts only two-player wins and limits history', () => {
    const store = new SessionStore(new MemoryStorage());
    for (let index = 0; index < 12; index += 1) {
      store.record('pong', { winner: 1, headline: '승리', detail: '완료', score: [7, index] });
    }
    store.record('roulette', { winner: 2, headline: '결과', detail: '완료' }, false);
    expect(store.value.versusWins).toEqual([12, 0]);
    expect(store.value.recent).toHaveLength(8);
    expect(store.value.recent[0]).toMatchObject({ gameId: 'roulette', winner: 0 });
    expect(store.value.recent[0]).not.toHaveProperty('score');
  });
});
