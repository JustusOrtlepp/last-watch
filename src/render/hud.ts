import { CONFIG } from '../config';

/** `RAGE 00000` style counter text: 5-digit zero-padded, growing past 5 digits when needed. */
export function formatRage(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(5, '0');
}

/** Top-centre error text (SPEC 5.2): one message at a time, shown for `CONFIG.errors.displayMs`. */
export interface ErrorMessage {
  /** Shows a message, replacing any current one and restarting the timer. */
  show(text: string): void;
  /** Advances the timer; the message disappears once it has been shown long enough. */
  tick(dtMs: number): void;
  clear(): void;
  /** Current text, or null when nothing is shown. */
  readonly text: string | null;
}

export function createErrorMessage(): ErrorMessage {
  let text: string | null = null;
  let leftMs = 0;
  return {
    show(next) {
      text = next;
      leftMs = CONFIG.errors.displayMs;
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
  };
}

export interface Hud {
  /** Updates the DOM only when a value actually changed. */
  update(rage: number, best: number): void;
  /** Shows an error message top-centre (SPEC 5.2). */
  showError(text: string): void;
  /** Advances the error timer by a frame's worth of running time. */
  tick(dtMs: number): void;
  clearError(): void;
}

export function createHud(rageEl: HTMLElement, bestEl: HTMLElement, errorEl: HTMLElement): Hud {
  let rageText = rageEl.textContent;
  let bestText = bestEl.textContent;
  const error = createErrorMessage();
  const syncError = (): void => {
    const next = error.text;
    if (next === null) {
      if (!errorEl.hidden) errorEl.hidden = true;
    } else if (errorEl.hidden || errorEl.textContent !== next) {
      errorEl.textContent = next;
      errorEl.hidden = false;
    }
  };
  return {
    update(rage, best) {
      const nextRage = formatRage(rage);
      if (nextRage !== rageText) {
        rageText = nextRage;
        rageEl.textContent = nextRage;
      }
      const nextBest = formatRage(best);
      if (nextBest !== bestText) {
        bestText = nextBest;
        bestEl.textContent = nextBest;
      }
    },
    showError(text) {
      error.show(text);
      syncError();
    },
    tick(dtMs) {
      error.tick(dtMs);
      syncError();
    },
    clearError() {
      error.clear();
      syncError();
    },
  };
}
