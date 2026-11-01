import type { SimInput } from '../sim/player';

/**
 * Raw events -> abstract actions (SPEC 10.1). `Confirm` (Enter) is a UI-only extra used by the
 * overlays; the sim never sees it.
 */
export type Action =
  'Jump' | 'JumpRelease' | 'FastFall' | 'Charge' | 'Stomp' | 'Pause' | 'Mute' | 'Confirm';

/** `KeyboardEvent.code` -> action. Codes are layout independent. */
export const KEY_ACTIONS: Readonly<Record<string, Action>> = {
  Space: 'Jump',
  KeyW: 'Jump',
  ArrowUp: 'Jump',
  ArrowDown: 'FastFall',
  KeyS: 'FastFall',
  KeyQ: 'Charge',
  Digit1: 'Charge',
  KeyE: 'Stomp',
  Digit2: 'Stomp',
  KeyP: 'Pause',
  Escape: 'Pause',
  KeyM: 'Mute',
  Enter: 'Confirm',
};

/** Touch: a press in the left 60% of the game area jumps (SPEC 10.1). */
export const TOUCH_JUMP_FRACTION = 0.6;
/** Touch: a downward drag of at least this many CSS px triggers fast-fall. */
export const SWIPE_DOWN_PX = 24;

export function isJumpZone(x: number, width: number): boolean {
  return width > 0 && x / width < TOUCH_JUMP_FRACTION;
}

export interface InputController {
  /** Held-state for the next sim ticks. A press shorter than one frame still yields one tick. */
  sample(): SimInput;
  /** Call after `advance`; a latched press is dropped once at least one tick has consumed it. */
  afterAdvance(ticks: number): void;
  /** Forgets held keys, e.g. when a run starts from a Space press (no instant jump). */
  reset(): void;
  /** On-screen action buttons (SPEC 9.2): same effect as holding the matching key. */
  pressButton(action: ButtonAction): void;
  releaseButton(action: ButtonAction): void;
}

export type ButtonAction = 'Jump' | 'Charge' | 'Stomp';

/**
 * Keyboard (window) and Pointer Events (game area) to abstract actions. `onAction` receives
 * discrete actions; `sample()` exposes the held jump/down state for the sim.
 */
export function createInput(
  area: HTMLElement,
  onAction: (action: Action) => void,
): InputController {
  let jumpHeld = false;
  let jumpLatch = false;
  let downHeld = false;
  let chargeHeld = false;
  let chargeLatch = false;
  let stompHeld = false;
  let stompLatch = false;
  const keysDown = new Set<string>();

  const press = (action: Action): void => {
    if (action === 'Jump') {
      jumpHeld = true;
      jumpLatch = true;
    } else if (action === 'FastFall') {
      downHeld = true;
    } else if (action === 'Charge') {
      chargeHeld = true;
      chargeLatch = true;
    } else if (action === 'Stomp') {
      stompHeld = true;
      stompLatch = true;
    }
    onAction(action);
  };

  window.addEventListener('keydown', (e) => {
    const action = KEY_ACTIONS[e.code];
    if (!action || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    if (e.repeat || keysDown.has(e.code)) return; // key repeat must not re-trigger (SPEC 10.1)
    keysDown.add(e.code);
    press(action);
  });

  const keyHeld = (action: Action): boolean => [...keysDown].some((c) => KEY_ACTIONS[c] === action);

  /** Updates the held state after a key or button went up, still honouring other held sources. */
  const release = (action: Action): void => {
    if (action === 'Jump') {
      jumpHeld = keyHeld('Jump');
      if (!jumpHeld) onAction('JumpRelease');
    } else if (action === 'FastFall') {
      downHeld = keyHeld('FastFall');
    } else if (action === 'Charge') {
      chargeHeld = keyHeld('Charge');
    } else if (action === 'Stomp') {
      stompHeld = keyHeld('Stomp');
    }
  };

  window.addEventListener('keyup', (e) => {
    const action = KEY_ACTIONS[e.code];
    if (!action) return;
    keysDown.delete(e.code);
    release(action);
  });

  window.addEventListener('blur', () => {
    keysDown.clear();
    jumpHeld = false;
    downHeld = false;
    chargeHeld = false;
    stompHeld = false;
  });

  // Touch / pointer: one gesture at a time, tracked by pointerId.
  let pointerId: number | null = null;
  let startY = 0;
  let pointerJump = false;

  area.addEventListener('pointerdown', (e) => {
    if (pointerId !== null) return;
    const rect = area.getBoundingClientRect();
    if (!isJumpZone(e.clientX - rect.left, rect.width)) return;
    pointerId = e.pointerId;
    startY = e.clientY;
    pointerJump = true;
    area.setPointerCapture(e.pointerId);
    press('Jump');
  });

  area.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId || downHeld) return;
    if (e.clientY - startY >= SWIPE_DOWN_PX) press('FastFall');
  });

  const endPointer = (e: PointerEvent): void => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    downHeld = [...keysDown].some((c) => KEY_ACTIONS[c] === 'FastFall');
    if (pointerJump) {
      pointerJump = false;
      jumpHeld = [...keysDown].some((c) => KEY_ACTIONS[c] === 'Jump');
      if (!jumpHeld) onAction('JumpRelease');
    }
  };
  area.addEventListener('pointerup', endPointer);
  area.addEventListener('pointercancel', endPointer);

  return {
    sample: () => ({
      jump: jumpHeld || jumpLatch,
      down: downHeld,
      charge: chargeHeld || chargeLatch,
      stomp: stompHeld || stompLatch,
    }),
    pressButton: (action) => press(action),
    releaseButton: (action) => release(action),
    afterAdvance: (ticks) => {
      if (ticks > 0) {
        jumpLatch = false;
        chargeLatch = false;
        stompLatch = false;
      }
    },
    reset: () => {
      jumpHeld = false;
      jumpLatch = false;
      downHeld = false;
      chargeHeld = false;
      chargeLatch = false;
      stompHeld = false;
      stompLatch = false;
      keysDown.clear();
      pointerJump = false;
    },
  };
}
