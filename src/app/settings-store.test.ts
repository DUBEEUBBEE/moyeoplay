import { describe, expect, it } from 'vitest';
import type { StorageLike } from '../core/storage';
import { DEFAULT_SETTINGS, migrateSettings, SettingsStore, SETTINGS_KEY } from './settings-store';

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

describe('settings migration', () => {
  it('migrates legacy names and clamps unsafe values', () => {
    expect(
      migrateSettings({
        version: 1,
        player1: '  민수  ',
        player2: '',
        volume: 5,
        soundEnabled: false,
      }),
    ).toEqual({
      version: 2,
      playerNames: ['민수', 'PLAYER 2'],
      soundEnabled: false,
      volume: 1,
      motion: 'system',
    });
  });

  it('falls back when stored JSON is corrupt', () => {
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_KEY, '{broken');
    expect(new SettingsStore(storage).value).toEqual(DEFAULT_SETTINGS);
  });

  it('persists a sanitized schema', () => {
    const storage = new MemoryStorage();
    const store = new SettingsStore(storage);
    store.update({ playerNames: ['  P1  ', 'P2'], volume: -1 });
    expect(store.value.playerNames).toEqual(['P1', 'P2']);
    expect(store.value.volume).toBe(0);
    expect(JSON.parse(storage.getItem(SETTINGS_KEY) ?? '{}')).toMatchObject({ version: 2 });
  });
});
