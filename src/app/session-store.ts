import type { GameId, GameResult } from '../core/game-controller';
import { getBrowserStorage, safeRead, safeWrite, type StorageLike } from '../core/storage';

export interface RecentMatch {
  gameId: GameId;
  winner: 0 | 1 | 2;
  score?: [number, number];
  playedAt: string;
}

export interface SessionState {
  version: 1;
  versusWins: [number, number];
  recent: RecentMatch[];
}

export const SESSION_KEY = 'moyeoplay:session';

const DEFAULT_SESSION: SessionState = { version: 1, versusWins: [0, 0], recent: [] };

function normalizeWinCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(value)));
}

function isGameId(value: unknown): value is GameId {
  return (
    typeof value === 'string' &&
    [
      'omok',
      'pong',
      'volleyball',
      'pinball-drop',
      'ladder',
      'reaction-duel',
      'tap-battle',
      'roulette',
    ].includes(value)
  );
}

export function migrateSession(raw: unknown): SessionState {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_SESSION);
  const value = raw as Record<string, unknown>;
  const wins = Array.isArray(value.versusWins) ? value.versusWins : [];
  const recentSource = Array.isArray(value.recent) ? value.recent : [];
  const recent: RecentMatch[] = [];
  for (const entry of recentSource.slice(0, 8)) {
    if (!entry || typeof entry !== 'object') continue;
    const match = entry as Record<string, unknown>;
    if (!isGameId(match.gameId)) continue;
    const winner = match.winner === 1 || match.winner === 2 ? match.winner : 0;
    const rawScore: unknown[] | null = Array.isArray(match.score) ? match.score : null;
    const firstScore = rawScore?.[0];
    const secondScore = rawScore?.[1];
    const score =
      typeof firstScore === 'number' &&
      Number.isFinite(firstScore) &&
      typeof secondScore === 'number' &&
      Number.isFinite(secondScore)
        ? ([Math.max(0, firstScore), Math.max(0, secondScore)] as [number, number])
        : undefined;
    recent.push({
      gameId: match.gameId,
      winner,
      ...(score ? { score } : {}),
      playedAt: typeof match.playedAt === 'string' ? match.playedAt : new Date(0).toISOString(),
    });
  }
  return {
    version: 1,
    versusWins: [normalizeWinCount(wins[0]), normalizeWinCount(wins[1])],
    recent,
  };
}

export class SessionStore {
  readonly #storage: StorageLike | null;
  #state: SessionState;
  readonly #listeners = new Set<(state: SessionState) => void>();

  constructor(storage: StorageLike | null = getBrowserStorage()) {
    this.#storage = storage;
    this.#state = migrateSession(safeRead(storage, SESSION_KEY));
  }

  get value(): SessionState {
    return structuredClone(this.#state);
  }

  record(gameId: GameId, result: GameResult, twoPlayer = true): void {
    const wins: [number, number] = [...this.#state.versusWins];
    if (twoPlayer && result.winner === 1) wins[0] += 1;
    if (twoPlayer && result.winner === 2) wins[1] += 1;
    const recent: RecentMatch = {
      gameId,
      winner: twoPlayer ? result.winner : 0,
      ...(twoPlayer && result.score ? { score: [...result.score] } : {}),
      playedAt: new Date().toISOString(),
    };
    this.#state = {
      version: 1,
      versusWins: wins,
      recent: [recent, ...this.#state.recent].slice(0, 8),
    };
    this.#save();
  }

  clear(): void {
    this.#state = structuredClone(DEFAULT_SESSION);
    this.#save();
  }

  subscribe(listener: (state: SessionState) => void): () => void {
    this.#listeners.add(listener);
    listener(this.value);
    return () => this.#listeners.delete(listener);
  }

  #save(): void {
    safeWrite(this.#storage, SESSION_KEY, this.#state);
    const snapshot = this.value;
    for (const listener of this.#listeners) listener(snapshot);
  }
}
