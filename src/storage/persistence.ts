/**
 * localStorage persistence (SPEC 10.3). Every read is parsed defensively: corrupt, missing or
 * out-of-range values fall back to defaults, and no function here ever throws (private mode,
 * disabled storage, quota errors).
 */
import { HINT_IDS, type HintId } from '../content/encounters';

export const HIGHSCORE_KEY = 'tauren-runner:v1:highscore';
export const SETTINGS_KEY = 'tauren-runner:v1:settings';
export const HINTS_KEY = 'tauren-runner:v1:hints';

/** Upper bound for a plausible best Rage; anything above is treated as corrupt. */
export const MAX_STORED_RAGE = 1_000_000_000;

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface Settings {
  muted: boolean;
  reducedMotion: boolean;
  showHints: boolean;
}

export function defaultSettings(prefersReducedMotion = false): Settings {
  return { muted: false, reducedMotion: prefersReducedMotion, showHints: true };
}

/** The browser store, or null when storage is unavailable. Never throws. */
export function browserStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(store: KeyValueStore | null, key: string): string | null {
  try {
    return store ? store.getItem(key) : null;
  } catch {
    return null;
  }
}

function write(store: KeyValueStore | null, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    // Storage disabled or full: the game keeps working without persistence.
  }
}

export function parseHighScore(raw: string | null): number {
  if (raw === null || !/^\d{1,10}$/.test(raw)) return 0;
  const value = Number(raw);
  return value <= MAX_STORED_RAGE ? value : 0;
}

export function loadHighScore(store: KeyValueStore | null): number {
  return parseHighScore(read(store, HIGHSCORE_KEY));
}

export function saveHighScore(store: KeyValueStore | null, rage: number): void {
  if (!Number.isFinite(rage)) return;
  const value = Math.min(MAX_STORED_RAGE, Math.max(0, Math.floor(rage)));
  write(store, HIGHSCORE_KEY, String(value));
}

export function parseSettings(raw: string | null, defaults: Settings): Settings {
  if (raw === null) return { ...defaults };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...defaults };
  }
  if (typeof data !== 'object' || data === null) return { ...defaults };
  const record = data as Record<string, unknown>;
  const pick = (key: keyof Settings): boolean => {
    const value = record[key];
    return typeof value === 'boolean' ? value : defaults[key];
  };
  return {
    muted: pick('muted'),
    reducedMotion: pick('reducedMotion'),
    showHints: pick('showHints'),
  };
}

export function loadSettings(store: KeyValueStore | null, defaults: Settings): Settings {
  return parseSettings(read(store, SETTINGS_KEY), defaults);
}

export function saveSettings(store: KeyValueStore | null, settings: Settings): void {
  write(store, SETTINGS_KEY, JSON.stringify(settings));
}

/** Tutorial hints already shown (SPEC 7.2): a JSON array of ids; unknown ids and corrupt data are dropped. */
export function parseSeenHints(raw: string | null): Set<HintId> {
  const seen = new Set<HintId>();
  if (raw === null) return seen;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return seen;
  }
  if (!Array.isArray(data)) return seen;
  for (const id of data) {
    if (typeof id === 'string' && (HINT_IDS as readonly string[]).includes(id))
      seen.add(id as HintId);
  }
  return seen;
}

export function loadSeenHints(store: KeyValueStore | null): Set<HintId> {
  return parseSeenHints(read(store, HINTS_KEY));
}

export function saveSeenHints(store: KeyValueStore | null, seen: ReadonlySet<HintId>): void {
  write(store, HINTS_KEY, JSON.stringify([...seen]));
}
