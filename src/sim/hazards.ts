import { CONFIG } from '../config';
import { ARROW, ENEMIES } from '../content/entities';
import { overlaps, type Box } from './collision';
import { enemyBox, isStunned, type Enemy } from './enemies';
import type { SimEvent } from './events';
import { playerBox, type Player } from './player';
import { surgeRage, type Rage } from './rage';
import { countdown } from './timers';

/** Centaur arrow in flight (SPEC 6.2). `x` is the left edge; it flies left, relative to the ground. */
export interface Arrow {
  id: number;
  x: number;
}

export function arrowBox(a: Arrow): Box {
  return { x: a.x, y: CONFIG.groundY - ARROW.bottom - ARROW.h, w: ARROW.w, h: ARROW.h };
}

/**
 * Moves arrows left by the ground scroll `dx` plus their own speed and drops those that left the
 * screen (in place, no allocation). Arrows are not affected by War Stomp or stuns (SPEC 5.2).
 */
export function updateArrows(arrows: Arrow[], dx: number): Arrow[] {
  const own = ARROW.speed / CONFIG.simHz;
  let n = 0;
  for (const a of arrows) {
    a.x -= dx + own;
    if (a.x + ARROW.w > 0) arrows[n++] = a;
  }
  arrows.length = n;
  return arrows;
}

/** The slice of the world the enemy behaviours touch (the `World` satisfies it structurally). */
export interface HazardContext {
  player: Player;
  enemies: Enemy[];
  arrows: Arrow[];
  rage: Rage;
  events: SimEvent[];
  nextId: number;
}

/** Distance (px) from the player's front edge to the enemy's back edge. */
function distanceAhead(player: Player, e: Enemy): number {
  return e.x - (player.x + CONFIG.player.hitbox.w / 2);
}

/**
 * Centaur Archer: while 200-700 px ahead and not stunned, fires an arrow every 1.6 s (SPEC 6.2).
 * The timer counts down whenever the archer is active, so it is ready as it enters the zone.
 */
function shoot(ctx: HazardContext, e: Enemy): void {
  if (e.defeated || isStunned(e)) return;
  e.fireMs = countdown(e.fireMs, 1000 / CONFIG.simHz);
  if (e.fireMs > 0) return;
  const d = distanceAhead(ctx.player, e);
  if (d < CONFIG.enemy.shootMinRange || d > CONFIG.enemy.shootMaxRange) return;
  e.fireMs = CONFIG.enemy.arrowIntervalMs;
  const arrow: Arrow = { id: ctx.nextId++, x: e.x - ARROW.w };
  ctx.arrows.push(arrow);
  ctx.events.push({ type: 'ArrowFired', id: arrow.id, x: arrow.x });
}

function defeat(ctx: HazardContext, e: Enemy, cause: 'trample' | 'fall'): void {
  const def = ENEMIES[e.kind];
  if (cause === 'trample') {
    e.defeated = true;
    e.fadeMs = CONFIG.enemy.defeatFadeMs;
  }
  ctx.events.push({ type: 'EnemyDefeated', id: e.id, kind: e.kind, cause });
  surgeRage(ctx.rage, ctx.events, def.trampleRage, 'trample', enemyBox(e));
}

/**
 * Per-tick enemy behaviours after movement: fall Rage for harpies that just landed (SPEC 6.4),
 * the archer's arrows, and trampling (SPEC 6.3): a player who touches a stunned enemy knocks it
 * aside and gains its trample Rage. Jumping clear of it, or dashing (the Charge target is handled
 * by the Charge itself), awards nothing.
 */
export function resolveEnemies(ctx: HazardContext): void {
  const box = playerBox(ctx.player);
  const canTrample = ctx.player.state !== 'Charging' && ctx.player.state !== 'Dead';
  for (const e of ctx.enemies) {
    if (e.justLanded) {
      e.justLanded = false;
      defeat(ctx, e, 'fall');
    }
    if (ENEMIES[e.kind].shoots) shoot(ctx, e);
    if (canTrample && !e.defeated && isStunned(e) && overlaps(box, enemyBox(e))) {
      defeat(ctx, e, 'trample');
    }
  }
}
