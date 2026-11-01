import { describe, expect, it } from 'vitest';
import {
  HIGHSCORE_KEY,
  SETTINGS_KEY,
  defaultSettings,
  loadHighScore,
  loadSettings,
  parseHighScore,
  saveHighScore,
  saveSettings,
  type KeyValueStore,
} from '../../../src/storage/persistence';

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const throwingStore: KeyValueStore = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
  removeItem: () => {
    throw new Error('denied');
  },
};

describe('high score persistence', () => {
  it('round-trips a score under the versioned key', () => {
    const store = memoryStore();
    saveHighScore(store, 1234.9);
    expect(store.data.get(HIGHSCORE_KEY)).toBe('1234');
    expect(loadHighScore(store)).toBe(1234);
  });

  it('falls back to 0 for missing, corrupt or out-of-range values', () => {
    for (const raw of [null, '', 'abc', '-5', '12.5', '1e9', '1000000001', '99999999999', ' 7']) {
      expect(parseHighScore(raw)).toBe(0);
    }
  });

  it('never throws when storage is unavailable', () => {
    expect(loadHighScore(throwingStore)).toBe(0);
    expect(() => saveHighScore(throwingStore, 10)).not.toThrow();
    expect(loadHighScore(null)).toBe(0);
    expect(() => saveHighScore(null, 10)).not.toThrow();
  });

  it('ignores non-finite scores when saving', () => {
    const store = memoryStore();
    saveHighScore(store, Number.NaN);
    expect(store.data.size).toBe(0);
  });
});

describe('settings persistence', () => {
  it('uses defaults when nothing is stored, honouring prefers-reduced-motion', () => {
    expect(loadSettings(memoryStore(), defaultSettings(true))).toEqual({
      muted: false,
      reducedMotion: true,
      showHints: true,
    });
  });

  it('round-trips settings', () => {
    const store = memoryStore();
    saveSettings(store, { muted: true, reducedMotion: true, showHints: false });
    expect(store.data.has(SETTINGS_KEY)).toBe(true);
    expect(loadSettings(store, defaultSettings())).toEqual({
      muted: true,
      reducedMotion: true,
      showHints: false,
    });
  });

  it('falls back per field for corrupt data', () => {
    const defaults = defaultSettings();
    for (const raw of ['not json', 'null', '42', '[]', '{"muted":"yes"}']) {
      expect(loadSettings(memoryStore({ [SETTINGS_KEY]: raw }), defaults)).toEqual(defaults);
    }
    const partial = memoryStore({ [SETTINGS_KEY]: '{"muted":true,"showHints":7}' });
    expect(loadSettings(partial, defaults)).toEqual({ ...defaults, muted: true });
  });

  it('never throws when storage is unavailable', () => {
    expect(loadSettings(throwingStore, defaultSettings())).toEqual(defaultSettings());
    expect(() => saveSettings(throwingStore, defaultSettings())).not.toThrow();
  });
});
