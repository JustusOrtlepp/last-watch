import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/config';
import { HINT_TEXT } from '../../../src/content/encounters';
import { createHintTooltip, syncHintElement } from '../../../src/render/hint';
import {
  HINTS_KEY,
  loadSeenHints,
  parseSeenHints,
  saveSeenHints,
  type KeyValueStore,
} from '../../../src/storage/persistence';

function memoryStore(
  initial: Record<string, string> = {},
): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('tutorial hint tooltip (SPEC 7.2)', () => {
  it('shows a hint once, for displayMs, then hides it', () => {
    const calls: string[][] = [];
    const tip = createHintTooltip(new Set(), true, (seen) => calls.push([...seen]));
    expect(tip.text).toBeNull();
    expect(tip.trigger('jump')).toBe(true);
    expect(tip.text).toBe(HINT_TEXT.jump);
    expect(calls).toEqual([['jump']]);
    tip.tick(CONFIG.hints.displayMs - 1);
    expect(tip.text).toBe(HINT_TEXT.jump);
    tip.tick(1);
    expect(tip.text).toBeNull();
    // Never again, even in a later run.
    expect(tip.trigger('jump')).toBe(false);
    expect(tip.text).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('ignores hints that were already seen in an earlier session', () => {
    const tip = createHintTooltip(new Set(['charge']), true, () => undefined);
    expect(tip.trigger('charge')).toBe(false);
    expect(tip.text).toBeNull();
    expect(tip.trigger('stomp')).toBe(true);
    expect(tip.text).toBe(HINT_TEXT.stomp);
  });

  it('shows nothing when hints are turned off in settings', () => {
    let saved = 0;
    const tip = createHintTooltip(new Set(), false, () => saved++);
    expect(tip.trigger('jump')).toBe(false);
    expect(tip.text).toBeNull();
    expect(saved).toBe(0);
  });

  it('setEnabled switches hints off (hiding the current one) and back on', () => {
    const tip = createHintTooltip(new Set(), true, () => undefined);
    tip.trigger('jump');
    tip.setEnabled(false);
    expect(tip.text).toBeNull();
    expect(tip.trigger('charge')).toBe(false);
    tip.setEnabled(true);
    expect(tip.trigger('charge')).toBe(true);
    expect(tip.text).toBe(HINT_TEXT.charge);
  });

  it('a newer hint replaces the current one and restarts the timer; clear hides it', () => {
    const tip = createHintTooltip(new Set(), true, () => undefined);
    tip.trigger('jump');
    tip.tick(CONFIG.hints.displayMs - 100);
    tip.trigger('charge');
    tip.tick(200);
    expect(tip.text).toBe(HINT_TEXT.charge);
    tip.clear();
    expect(tip.text).toBeNull();
    expect(tip.seen.has('jump') && tip.seen.has('charge')).toBe(true);
  });

  it('syncHintElement toggles the element only when the text changes', () => {
    const el = { hidden: true, textContent: '' } as unknown as HTMLElement;
    syncHintElement(el, 'Press Space to jump');
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe('Press Space to jump');
    syncHintElement(el, null);
    expect(el.hidden).toBe(true);
  });
});

describe('seen-hint persistence', () => {
  it('round-trips and tolerates missing, corrupt and unknown data', () => {
    const store = memoryStore();
    expect(loadSeenHints(store).size).toBe(0);
    saveSeenHints(store, new Set(['jump', 'stomp']));
    expect([...loadSeenHints(store)].sort()).toEqual(['jump', 'stomp']);

    expect(parseSeenHints(null).size).toBe(0);
    expect(parseSeenHints('not json').size).toBe(0);
    expect(parseSeenHints('{"jump":true}').size).toBe(0);
    expect([...parseSeenHints('["jump", 7, "bogus", "charge"]')].sort()).toEqual([
      'charge',
      'jump',
    ]);
  });

  it('never throws when storage is unavailable', () => {
    const broken: KeyValueStore = {
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
    expect(loadSeenHints(broken).size).toBe(0);
    expect(() => saveSeenHints(broken, new Set(['jump']))).not.toThrow();
    expect(loadSeenHints(null).size).toBe(0);
    expect(() => saveSeenHints(null, new Set(['jump']))).not.toThrow();
  });

  it('uses its own versioned key', () => {
    const store = memoryStore();
    saveSeenHints(store, new Set(['jump']));
    expect(store.data.get(HINTS_KEY)).toBe('["jump"]');
    expect(HINTS_KEY).toBe('tauren-runner:v1:hints');
  });
});
