import { CONFIG } from '../config';

/** Text of the milestone toast for the `tier`-th 1,000 Rage (SPEC 8): "Level N", capped at 60. */
export function milestoneText(tier: number): string {
  const level = tier + 1;
  return level > CONFIG.progression.maxLevel ? 'Max level reached!' : `Level ${level}`;
}

/**
 * WoW-style level-up toast (SPEC 8): every `CONFIG.progression.milestoneEvery` total Rage shows
 * "Level N" for `CONFIG.toast.displayMs`. Purely cosmetic and derived from the score, so it lives
 * outside the sim. The chime is audio (P5b).
 */
export interface MilestoneToast {
  /** Feed the current total Rage; returns true when a new milestone was just reached. */
  observe(rage: number): boolean;
  /** Advances the display timer by a frame's worth of running time. */
  tick(dtMs: number): void;
  /** Hides the toast and forgets reached milestones (a new run or a game over). */
  reset(): void;
  /** Current text, or null when nothing is shown. */
  readonly text: string | null;
}

export function createMilestoneToast(): MilestoneToast {
  let reached = 0;
  let text: string | null = null;
  let leftMs = 0;
  return {
    observe(rage) {
      const tier = Math.floor(Math.max(0, rage) / CONFIG.progression.milestoneEvery);
      if (tier <= reached) return false;
      reached = tier;
      text = milestoneText(tier);
      leftMs = CONFIG.toast.displayMs;
      return true;
    },
    tick(dtMs) {
      if (text === null) return;
      leftMs -= dtMs;
      if (leftMs <= 0) text = null;
    },
    reset() {
      reached = 0;
      text = null;
      leftMs = 0;
    },
    get text() {
      return text;
    },
  };
}

/** Mirrors the toast text into the level line of the toast element; touches the DOM on change only. */
export function syncToastElement(el: HTMLElement, levelEl: HTMLElement, text: string | null): void {
  if (text === null) {
    if (!el.hidden) el.hidden = true;
  } else if (el.hidden || levelEl.textContent !== text) {
    levelEl.textContent = text;
    el.hidden = false;
  }
}
