import { getBrowserStorage, safeRead, safeWrite, type StorageLike } from '../core/storage';

export type MotionPreference = 'system' | 'reduced' | 'full';

export interface SettingsState {
  version: 2;
  playerNames: [string, string];
  soundEnabled: boolean;
  volume: number;
  motion: MotionPreference;
}

export const SETTINGS_KEY = 'moyeoplay:settings';

export const DEFAULT_SETTINGS: SettingsState = {
  version: 2,
  playerNames: ['PLAYER 1', 'PLAYER 2'],
  soundEnabled: true,
  volume: 0.65,
  motion: 'system',
};

function sanitizeName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.replace(/\s+/g, ' ').trim().slice(0, 24);
  return normalized || fallback;
}

function isMotionPreference(value: unknown): value is MotionPreference {
  return value === 'system' || value === 'reduced' || value === 'full';
}

export function migrateSettings(raw: unknown): SettingsState {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_SETTINGS);
  const value = raw as Record<string, unknown>;
  const legacyNames = [value.player1, value.player2];
  const names = Array.isArray(value.playerNames) ? value.playerNames : legacyNames;
  const volume =
    typeof value.volume === 'number' && Number.isFinite(value.volume) ? value.volume : 0.65;
  return {
    version: 2,
    playerNames: [
      sanitizeName(names[0], DEFAULT_SETTINGS.playerNames[0]),
      sanitizeName(names[1], DEFAULT_SETTINGS.playerNames[1]),
    ],
    soundEnabled: typeof value.soundEnabled === 'boolean' ? value.soundEnabled : true,
    volume: Math.max(0, Math.min(1, volume)),
    motion: isMotionPreference(value.motion) ? value.motion : 'system',
  };
}

export class SettingsStore {
  readonly #storage: StorageLike | null;
  #state: SettingsState;
  readonly #listeners = new Set<(state: SettingsState) => void>();

  constructor(storage: StorageLike | null = getBrowserStorage()) {
    this.#storage = storage;
    this.#state = migrateSettings(safeRead(storage, SETTINGS_KEY));
  }

  get value(): SettingsState {
    return structuredClone(this.#state);
  }

  update(patch: Partial<Omit<SettingsState, 'version'>>): void {
    this.#state = migrateSettings({ ...this.#state, ...patch, version: 2 });
    safeWrite(this.#storage, SETTINGS_KEY, this.#state);
    this.#emit();
  }

  reset(): void {
    this.#state = structuredClone(DEFAULT_SETTINGS);
    safeWrite(this.#storage, SETTINGS_KEY, this.#state);
    this.#emit();
  }

  subscribe(listener: (state: SettingsState) => void): () => void {
    this.#listeners.add(listener);
    listener(this.value);
    return () => this.#listeners.delete(listener);
  }

  #emit(): void {
    const snapshot = this.value;
    for (const listener of this.#listeners) listener(snapshot);
  }
}
