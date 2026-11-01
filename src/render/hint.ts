import { CONFIG } from '../config';
import { HINT_TEXT, type HintId } from '../content/encounters';

/**
 * First-encounter tutorial hints (SPEC 7.2): each hint shows once per browser, for
 * `CONFIG.hints.displayMs`, without pausing the game. Seen hints persist (storage/persistence.ts);
 * the `showHints` setting turns them off entirely.
 */
export interface HintTooltip {
  /** Shows the hint when enabled and not yet seen; returns true when it was shown (and is now seen). */
  trigger(id: HintId): boolean;
  /** Advances the display timer by a frame's worth of running time. */
  tick(dtMs: number): void;
  /** Turns hints on or off (settings screen); turning them off hides the current one. */
  setEnabled(enabled: boolean): void;
  /** Hides the tooltip (a new run or a game over); seen hints stay seen. */
  clear(): void;
  /** Current text, or null when nothing is shown. */
  readonly text: string | null;
  readonly seen: ReadonlySet<HintId>;
}

export function createHintTooltip(
  seen: ReadonlySet<HintId>,
  enabled: boolean,
  onSeen: (seen: ReadonlySet<HintId>) => void,
): HintTooltip {
  const known = new Set<HintId>(seen);
  let text: string | null = null;
  let leftMs = 0;
  return {
    setEnabled(next) {
      enabled = next;
      if (!enabled) {
        text = null;
        leftMs = 0;
      }
    },
    trigger(id) {
      if (!enabled || known.has(id)) return false;
      known.add(id);
      text = HINT_TEXT[id];
      leftMs = CONFIG.hints.displayMs;
      onSeen(known);
      return true;
    },
    tick(dtMs) {
      if (text === null) return;
      leftMs -= dtMs;
      if (leftMs <= 0) text = null;
    },
    clear() {
      text = null;
      leftMs = 0;
    },
    get text() {
      return text;
    },
    get seen() {
      return known;
    },
  };
}

/** Mirrors the tooltip's text into a DOM element, touching the DOM only when it changes. */
export function syncHintElement(el: HTMLElement, text: string | null): void {
  if (text === null) {
    if (!el.hidden) el.hidden = true;
  } else if (el.hidden || el.textContent !== text) {
    el.textContent = text;
    el.hidden = false;
  }
}
