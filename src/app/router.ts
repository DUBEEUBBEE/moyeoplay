import { isGameId, type GameId } from '../core/game-controller';

export type Route = { kind: 'lobby' } | { kind: 'game'; gameId: GameId };

export function parseHash(hash: string): Route | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(hash.replace(/^#/, ''));
  } catch {
    return null;
  }
  const normalized = decoded.replace(/^\/+|\/+$/g, '');
  if (!normalized || normalized === 'lobby') return { kind: 'lobby' };
  const match = /^game\/([^/]+)$/.exec(normalized);
  if (!match) return null;
  const id = match[1] ?? '';
  return isGameId(id) ? { kind: 'game', gameId: id } : null;
}

export function gameHash(gameId: GameId): string {
  return `#game/${gameId}`;
}

export function navigateToLobby(replace = false): void {
  const method = replace ? 'replaceState' : 'pushState';
  history[method](null, '', `${location.pathname}${location.search}#lobby`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function navigateToGame(gameId: GameId): void {
  location.hash = gameHash(gameId);
}
