import { CONFIG } from '../config';
import type { ButtonAction } from '../input/input';
import { checkCharge } from '../sim/abilities';
import { isGrounded } from '../sim/player';
import type { World } from '../sim/world';
import { drawFrame, frameKey, type Atlas } from './sprites';

export const BUTTON_IDS = ['jump', 'charge', 'stomp'] as const;
export type ButtonId = (typeof BUTTON_IDS)[number];

const ACTION_OF: Readonly<Record<ButtonId, ButtonAction>> = {
  jump: 'Jump',
  charge: 'Charge',
  stomp: 'Stomp',
};

/** What one action button shows (SPEC 9.2). Pure data, derived from the sim each frame. */
export interface ButtonState {
  /** Share of the clockwise cooldown sweep still dark: 1 right after use, 0 when ready. */
  remaining: number;
  /** Remaining cooldown seconds; empty unless the ability's own cooldown is running. */
  text: string;
  /** Red tint: unusable or (Charge) no valid target in range. */
  tint: boolean;
  /** Charge only: a valid target exists and the button is usable (WoW "lit" button). */
  lit: boolean;
  /** Any cooldown or the GCD is running. */
  cooling: boolean;
}

/** Whole seconds from 2 s up, one decimal below; rounded up so "0.0" never shows. */
export function formatCooldown(ms: number): string {
  if (ms <= 0) return '';
  if (ms >= 2000) return String(Math.ceil(ms / 1000));
  return (Math.ceil(ms / 100) / 10).toFixed(1);
}

function cooldown(
  cdMs: number,
  cdTotalMs: number,
  gcdMs: number,
): Pick<ButtonState, 'remaining' | 'text' | 'cooling'> {
  // The sweep follows whichever lock ends later (the GCD never shows seconds, like WoW).
  const remaining = cdMs >= gcdMs ? cdMs / cdTotalMs : gcdMs / CONFIG.gcdMs;
  return {
    remaining: Math.min(1, Math.max(0, remaining)),
    text: formatCooldown(cdMs),
    cooling: cdMs > 0 || gcdMs > 0,
  };
}

export function actionBarState(world: World): Record<ButtonId, ButtonState> {
  const { abilities: a, player } = world;
  const grounded = isGrounded(player);
  const target = checkCharge(player, world.enemies).ok;
  return {
    jump: { remaining: 0, text: '', tint: false, lit: false, cooling: false },
    charge: {
      ...cooldown(a.chargeCdMs, CONFIG.charge.cooldownMs, a.gcdMs),
      tint: !target || !grounded,
      lit: target && grounded,
    },
    stomp: {
      ...cooldown(a.stompCdMs, CONFIG.stomp.cooldownMs, a.gcdMs),
      tint: !grounded,
      lit: false,
    },
  };
}

export interface ActionBar {
  /** Updates the DOM only for values that changed. */
  update(world: World): void;
}

export interface ActionBarHandlers {
  press(action: ButtonAction): void;
  release(action: ButtonAction): void;
}

interface ButtonView {
  root: HTMLElement;
  sweep: HTMLElement;
  time: HTMLElement;
  last: { sweep: string; text: string; tint: boolean; lit: boolean; cooling: boolean };
}

function child<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Action bar: missing ${selector}`);
  return node;
}

/** Wires the static action-bar buttons: icons from the atlas, pointer input, state sync. */
export function createActionBar(
  root: HTMLElement,
  atlas: Atlas,
  handlers: ActionBarHandlers,
): ActionBar {
  const views = {} as Record<ButtonId, ButtonView>;
  for (const id of BUTTON_IDS) {
    const button = child<HTMLButtonElement>(root, `[data-ability="${id}"]`);
    const icon = child<HTMLCanvasElement>(button, '.action-icon');
    const ctx = icon.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.imageSmoothingEnabled = false;
    drawFrame(ctx, atlas, frameKey('icons', id, 0), 0, 0);

    const action = ACTION_OF[id];
    // Pointer events only: keys have their own bindings and must not "click" a focused button.
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      handlers.press(action);
    });
    const up = (): void => handlers.release(action);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('mousedown', (e) => e.preventDefault()); // never take focus

    button.dataset.tint = 'false';
    button.dataset.lit = 'false';
    button.dataset.cooling = 'false';

    views[id] = {
      root: button,
      sweep: child(button, '.action-sweep'),
      time: child(button, '.action-time'),
      last: { sweep: '', text: '', tint: false, lit: false, cooling: false },
    };
  }

  return {
    update(world) {
      const state = actionBarState(world);
      for (const id of BUTTON_IDS) {
        const v = views[id];
        const s = state[id];
        const sweep = `${Math.round((1 - s.remaining) * 200) / 2}%`;
        if (sweep !== v.last.sweep) {
          v.last.sweep = sweep;
          v.sweep.style.setProperty('--elapsed', sweep);
        }
        if (s.text !== v.last.text) {
          v.last.text = s.text;
          v.time.textContent = s.text;
        }
        if (s.tint !== v.last.tint) {
          v.last.tint = s.tint;
          v.root.dataset.tint = String(s.tint);
        }
        if (s.lit !== v.last.lit) {
          v.last.lit = s.lit;
          v.root.dataset.lit = String(s.lit);
        }
        if (s.cooling !== v.last.cooling) {
          v.last.cooling = s.cooling;
          v.root.dataset.cooling = String(s.cooling);
        }
      }
    },
  };
}
