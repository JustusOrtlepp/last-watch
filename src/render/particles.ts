import { CONFIG } from '../config';
import { ENEMIES } from '../content/entities';
import { createRng, nextFloat, type Rng } from '../sim/rng';
import type { SimEvent } from '../sim/events';
import type { World } from '../sim/world';

/** SPEC 5.2: War Stomp screen shake is 4 px for 150 ms (off with reduced motion, SPEC 10.4). */
export const SHAKE_PX = 4;
export const SHAKE_MS = 150;

export const MAX_PARTICLES = 96;
export const MOTE_COUNT = 14;

const GRAVITY = 900;
/** A small dust puff is kicked up behind the running Tauren this often. */
const RUN_DUST_MS = 140;
const STOMP_PUFFS = 16;
const HIT_PUFFS = 7;
/** Motes drift left at this fraction of the ground speed (further than the 0.2x spires). */
const MOTE_DEPTH_MIN = 0.08;
const MOTE_DEPTH_MAX = 0.3;

/** A pooled dust particle; `active` false means the slot is free. Mutated in place, never reallocated. */
export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ageMs: number;
  lifeMs: number;
  size: number;
}

/** A slow, decorative dust mote drifting across the sky (SPEC 4.3, optional). */
export interface Mote {
  x: number;
  baseY: number;
  y: number;
  /** Fraction of the ground speed the mote drifts at. */
  depth: number;
  phase: number;
  size: number;
}

/**
 * Presentation-only particles, screen shake and dust motes. Fed with the sim's events, never
 * mutates the sim (SPEC 4.2); uses its own PRNG so the sim stays deterministic. All state lives in
 * pre-allocated pools (SPEC 14.1: no per-frame allocations).
 */
export interface Particles {
  readonly pool: readonly Particle[];
  readonly motes: readonly Mote[];
  /** Whole-pixel camera offset for this frame; 0 when idle or with reduced motion. */
  readonly shakeX: number;
  readonly shakeY: number;
  handle(events: readonly SimEvent[], world: World): void;
  update(dtMs: number, world: World): void;
  clear(): void;
}

export function createParticles(reducedMotion: () => boolean, seed = 0x7a0e): Particles {
  const rng: Rng = createRng(seed);
  const rand = (min: number, max: number): number => min + nextFloat(rng) * (max - min);

  const pool: Particle[] = Array.from({ length: MAX_PARTICLES }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    ageMs: 0,
    lifeMs: 0,
    size: 1,
  }));
  const motes: Mote[] = Array.from({ length: MOTE_COUNT }, () => {
    const baseY = rand(16, CONFIG.groundY - 40);
    return {
      x: rand(0, CONFIG.logicalWidth),
      baseY,
      y: baseY,
      depth: rand(MOTE_DEPTH_MIN, MOTE_DEPTH_MAX),
      phase: rand(0, Math.PI * 2),
      size: nextFloat(rng) < 0.7 ? 1 : 2,
    };
  });

  let shakeLeftMs = 0;
  let shakeX = 0;
  let shakeY = 0;
  let runDustMs = 0;

  const spawn = (
    x: number,
    y: number,
    vx: number,
    vy: number,
    lifeMs: number,
    size: number,
  ): void => {
    const slot = pool.find((p) => !p.active);
    if (!slot) return;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.vx = vx;
    slot.vy = vy;
    slot.ageMs = 0;
    slot.lifeMs = lifeMs;
    slot.size = size;
  };

  const burst = (x: number, y: number, count: number, speed: number, up: number): void => {
    for (let i = 0; i < count; i += 1) {
      const dir = nextFloat(rng) < 0.5 ? -1 : 1;
      spawn(
        x,
        y,
        dir * rand(speed * 0.3, speed),
        -rand(up * 0.3, up),
        rand(350, 650),
        nextFloat(rng) < 0.6 ? 2 : 3,
      );
    }
  };

  return {
    pool,
    motes,
    get shakeX() {
      return shakeX;
    },
    get shakeY() {
      return shakeY;
    },

    handle(events) {
      for (const ev of events) {
        if (ev.type === 'StompUsed') {
          if (!reducedMotion()) shakeLeftMs = SHAKE_MS;
          burst(ev.x, CONFIG.groundY - 2, STOMP_PUFFS, 280, 220);
        } else if (ev.type === 'ChargeHit') {
          const def = ENEMIES[ev.kind];
          burst(ev.x, CONFIG.groundY - def.bottom - def.h / 2, HIT_PUFFS, 240, 200);
        }
      }
    },

    update(dtMs, world) {
      const dt = dtMs / 1000;
      const speed = world.speed;

      if (shakeLeftMs > 0 && !reducedMotion()) {
        shakeLeftMs = Math.max(0, shakeLeftMs - dtMs);
        const amp = SHAKE_PX * (shakeLeftMs / SHAKE_MS);
        shakeX = Math.round(Math.sin(shakeLeftMs / 11) * amp);
        shakeY = Math.round(Math.cos(shakeLeftMs / 7) * amp * 0.5);
      } else {
        shakeLeftMs = 0;
        shakeX = 0;
        shakeY = 0;
      }

      for (const p of pool) {
        if (!p.active) continue;
        p.ageMs += dtMs;
        if (p.ageMs >= p.lifeMs) {
          p.active = false;
          continue;
        }
        p.vy += GRAVITY * dt;
        p.x += (p.vx - speed) * dt;
        p.y += p.vy * dt;
        const floor = CONFIG.groundY - p.size;
        if (p.y > floor) {
          p.y = floor;
          p.vy = 0;
          p.vx *= 0.9;
        }
      }

      if (world.player.state === 'Running') {
        runDustMs -= dtMs;
        if (runDustMs <= 0) {
          runDustMs = RUN_DUST_MS;
          spawn(
            world.player.x - CONFIG.player.hitbox.w / 2,
            CONFIG.groundY - 3,
            -rand(10, 50),
            -rand(60, 160),
            rand(250, 400),
            2,
          );
        }
      } else {
        runDustMs = 0;
      }

      for (const m of motes) {
        m.x -= speed * m.depth * dt;
        if (m.x < -m.size) m.x += CONFIG.logicalWidth + m.size * 2;
        m.phase += dt * 1.5;
        m.y = m.baseY + Math.sin(m.phase) * 4;
      }
    },

    clear() {
      for (const p of pool) p.active = false;
      shakeLeftMs = 0;
      shakeX = 0;
      shakeY = 0;
      runDustMs = 0;
    },
  };
}
