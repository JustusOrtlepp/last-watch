import { CONFIG } from '../config';
import type { Box } from './collision';
import type { SimEvent } from './events';
import { countdown } from './timers';

export const PLAYER_STATES = [
  'Running',
  'Airborne',
  'Stomping',
  'Charging',
  'Recovering',
  'Dead',
] as const;
export type PlayerState = (typeof PLAYER_STATES)[number];

/** Held-key state for one sim tick. The sim derives press/release edges itself. */
export interface SimInput {
  jump: boolean;
  down: boolean;
  /** Optional: absent means not held. Charge / War Stomp presses are derived from edges too. */
  charge?: boolean;
  stomp?: boolean;
}

export const NO_INPUT: SimInput = { jump: false, down: false };

/**
 * `x` is the hitbox centre (home x = 120, SPEC 5.1). `feetY` is the hitbox bottom in screen
 * coordinates (groundY when grounded); `vy` is positive downwards, so a jump is negative.
 */
export interface Player {
  state: PlayerState;
  x: number;
  feetY: number;
  vy: number;
  jumpBufferMs: number;
  coyoteMs: number;
  jumpHeld: boolean;
  /** War Stomp animation lock left (no jumping while `Stomping`). */
  lockMs: number;
  /** Charge dash time left while `Charging`. */
  dashMs: number;
  /** Enemy id the current dash is aimed at (0 = none). */
  dashTargetId: number;
}

export function createPlayer(): Player {
  return {
    state: 'Running',
    x: CONFIG.player.homeX,
    feetY: CONFIG.groundY,
    vy: 0,
    jumpBufferMs: 0,
    coyoteMs: CONFIG.player.coyoteMs,
    jumpHeld: false,
    lockMs: 0,
    dashMs: 0,
    dashTargetId: 0,
  };
}

/** Grounded state: `Recovering` while still drifting back to the home x, else `Running`. */
export function groundedState(p: Player): 'Running' | 'Recovering' {
  return p.x > CONFIG.player.homeX ? 'Recovering' : 'Running';
}

/** On the ground and free to act (jump, Charge, War Stomp). */
export function isGrounded(p: Player): boolean {
  return p.state === 'Running' || p.state === 'Recovering';
}

export function playerBox(p: Player): Box {
  const { w, h } = CONFIG.player.hitbox;
  return { x: p.x - w / 2, y: p.feetY - h, w, h };
}

/**
 * Advances the player by one fixed tick: timers, recovery drift, jump input (buffer, coyote,
 * variable height) and gravity. Charge and War Stomp are started in abilities.ts.
 */
export function updatePlayer(p: Player, input: SimInput, events: SimEvent[]): void {
  const dt = 1 / CONFIG.simHz;
  const dtMs = 1000 * dt;
  const cfg = CONFIG.player;

  const pressed = input.jump && !p.jumpHeld;
  const released = !input.jump && p.jumpHeld;
  p.jumpHeld = input.jump;
  if (p.state === 'Dead') return;

  p.jumpBufferMs = pressed ? cfg.jumpBufferMs : Math.max(0, p.jumpBufferMs - dtMs);
  p.coyoteMs = p.state === 'Airborne' ? Math.max(0, p.coyoteMs - dtMs) : cfg.coyoteMs;

  if (p.state === 'Stomping') {
    p.lockMs = countdown(p.lockMs, dtMs);
    if (p.lockMs <= 0) p.state = groundedState(p);
  }

  // SPEC 5.2: after a dash the player drifts back to the home x (also while airborne or stomping).
  if (p.state !== 'Charging' && p.x > cfg.homeX) {
    p.x = Math.max(cfg.homeX, p.x - cfg.recoverSpeed * dt);
  }
  if (isGrounded(p)) p.state = groundedState(p);

  if (released && p.state === 'Airborne' && p.vy < cfg.shortHopVelocity) {
    p.vy = cfg.shortHopVelocity;
  }

  const canJump = isGrounded(p) || (p.state === 'Airborne' && p.coyoteMs > 0);
  if (p.jumpBufferMs > 0 && canJump) {
    p.state = 'Airborne';
    p.vy = input.jump ? cfg.jumpVelocity : Math.max(cfg.jumpVelocity, cfg.shortHopVelocity);
    p.jumpBufferMs = 0;
    p.coyoteMs = 0;
    events.push({ type: 'PlayerJumped' });
  }

  if (p.state === 'Airborne') {
    const g = cfg.gravity * (input.down ? cfg.fastFallMultiplier : 1);
    p.feetY += p.vy * dt + 0.5 * g * dt * dt;
    p.vy += g * dt;
    if (p.feetY >= CONFIG.groundY) {
      p.feetY = CONFIG.groundY;
      p.vy = 0;
      p.state = groundedState(p);
      events.push({ type: 'PlayerLanded' });
    }
  }
}
