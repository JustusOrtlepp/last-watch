import { CONFIG } from '../config';
import { ENEMIES, type EnemyKind } from '../content/entities';
import type { Box } from './collision';
import { countdown } from './timers';

/**
 * Enemy (SPEC 6.2). `x` is the left edge; the hitbox bottom sits `lift` above the ground
 * (initially `ENEMIES[kind].bottom`, falling to 0 for a stunned mid harpy, SPEC 6.3).
 */
export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  /** Hitbox bottom above the ground line. */
  lift: number;
  /** Downward fall speed (px/s) of a stunned or defeated mid harpy. */
  fallVy: number;
  /** Remaining stun time; > 0 means stunned (harmless, stops its own movement, SPEC 6.3). */
  stunMs: number;
  /** Defeated (Charge, trample or fall): knocked forward, fading out, harmless and untargetable. */
  defeated: boolean;
  fadeMs: number;
  /** Time until the next arrow may be fired (Centaur Archer only). */
  fireMs: number;
  /** Set on the tick a stunned harpy lands; consumed by `resolveEnemies` (fall Rage). */
  justLanded: boolean;
}

export function createEnemy(id: number, kind: EnemyKind, x: number): Enemy {
  return {
    id,
    kind,
    x,
    lift: ENEMIES[kind].bottom,
    fallVy: 0,
    stunMs: 0,
    defeated: false,
    fadeMs: 0,
    fireMs: 0,
    justLanded: false,
  };
}

export function enemyBox(e: Enemy): Box {
  const { w, h } = ENEMIES[e.kind];
  return { x: e.x, y: CONFIG.groundY - e.lift - h, w, h };
}

/** Spawn x that gives a Plainstrider its dust-cloud lead before it reaches the right edge. */
export function telegraphX(kind: EnemyKind, groundSpeed: number): number {
  return CONFIG.logicalWidth + (groundSpeed + ENEMIES[kind].speed) * CONFIG.enemy.telegraphSec;
}

/** A telegraphed enemy still off-screen to the right: presentation shows the dust cloud. */
export function isTelegraphing(e: Enemy): boolean {
  return ENEMIES[e.kind].telegraphed && !e.defeated && e.x >= CONFIG.logicalWidth;
}

export function isStunned(e: Enemy): boolean {
  return e.stunMs > 0;
}

/** Alive and not stunned: lethal on contact. */
export function isLethal(e: Enemy): boolean {
  return !e.defeated && e.stunMs <= 0;
}

/** Leftward speed (px/s) on screen: ground scroll plus own walking, which stops while stunned. */
export function enemyVelocity(e: Enemy, groundSpeed: number): number {
  return groundSpeed + (e.defeated || e.stunMs > 0 ? 0 : ENEMIES[e.kind].speed);
}

/**
 * Advances enemies one tick: stun timers, own movement (only while not stunned), the fall of a
 * stunned mid harpy, defeat fade. `dx` is the ground scroll this tick. Returns the enemies still
 * on or ahead of the screen (enemies may wait off-screen to the right, e.g. a telegraphed
 * Plainstrider).
 */
export function updateEnemies(enemies: Enemy[], dx: number): Enemy[] {
  const dt = 1 / CONFIG.simHz;
  const dtMs = 1000 * dt;
  let n = 0;
  for (const e of enemies) {
    const def = ENEMIES[e.kind];
    if (e.defeated) {
      e.fadeMs -= dtMs;
      e.x += CONFIG.enemy.knockbackSpeed * dt - dx;
      if (def.fallsWhenStunned) fall(e, dt);
      if (e.fadeMs <= 0) continue;
    } else {
      e.stunMs = countdown(e.stunMs, dtMs);
      e.x -= dx + (e.stunMs > 0 ? 0 : def.speed * dt);
      if (def.fallsWhenStunned && e.stunMs > 0) fall(e, dt);
    }
    if (e.x + def.w > 0) enemies[n++] = e;
  }
  enemies.length = n;
  return enemies;
}

/** Stunned mid harpies drop to the ground and are defeated on landing (SPEC 6.3). */
function fall(e: Enemy, dt: number): void {
  if (e.lift <= 0) return;
  e.fallVy += CONFIG.enemy.fallGravity * dt;
  e.lift -= e.fallVy * dt;
  if (e.lift > 0) return;
  e.lift = 0;
  e.fallVy = 0;
  if (!e.defeated) {
    e.defeated = true;
    e.fadeMs = CONFIG.enemy.defeatFadeMs;
    e.justLanded = true;
  }
}
