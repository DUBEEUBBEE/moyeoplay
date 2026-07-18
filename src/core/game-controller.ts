export const GAME_IDS = [
  'omok',
  'pong',
  'volleyball',
  'pinball-drop',
  'ladder',
  'reaction-duel',
  'tap-battle',
  'roulette',
] as const;

export type GameId = (typeof GAME_IDS)[number];

export type GamePhase = 'idle' | 'countdown' | 'playing' | 'paused' | 'roundOver' | 'matchOver';

export interface GameResult {
  winner: 0 | 1 | 2;
  headline: string;
  detail: string;
  score?: readonly [number, number];
}

export interface GameAudio {
  hit(strength?: number): void;
  score(player?: 1 | 2): void;
  countdown(value: number): void;
  win(): void;
}

export interface GameServices {
  readonly audio: GameAudio;
  getPlayerName(player: 1 | 2): string;
  isReducedMotion(): boolean;
  announce(message: string): void;
  setPhase(phase: GamePhase, message?: string): void;
  complete(result: GameResult): void;
}

export interface MiniGameController {
  mount(container: HTMLElement): void;
  enter(): void;
  start(): void;
  pause(): void;
  resume(): void;
  reset(options?: { preserveMatchScore?: boolean }): void;
  destroy(): void;
}

export interface GameModule {
  createGame(services: GameServices): MiniGameController;
}

export interface GameDefinition {
  id: GameId;
  title: string;
  shortTitle: string;
  eyebrow: string;
  description: string;
  players: string;
  genre: string;
  duration: string;
  controls: string;
  accent: string;
  symbol: string;
  landscapePreferred?: boolean;
  rules: readonly string[];
  load(): Promise<GameModule>;
}

export function isGameId(value: string): value is GameId {
  return (GAME_IDS as readonly string[]).includes(value);
}
