import { CONFIG } from '../config';
import { ENEMIES } from '../content/entities';
import { circleOverlapsBox } from './collision';
import { enemyBox, enemyVelocity, type Enemy } from './enemies';
import type { AbilityErrorReason, SimEvent } from './events';
import { groundedState, isGrounded, type Player, type SimInput } from './player';
import { surgeRage, type Rage } from './rage';
import { countdown } from './timers';

/** SPEC 5.2 error text. */
export const ABILITY_ERROR_TEXT: Readonly<Record<AbilityErrorReason, string>> = {
  NotReady: 'Ability is not ready yet.',
  OutOfRange: 'Out of range.',
  TooClose: 'Target too close.',
  Immune: 'Immune.',
};

/** Cooldowns, the shared GCD, press-edge memory and error throttling (SPEC 5.2). */
export interface AbilityState {
  gcdMs: number;
  chargeCdMs: number;
  stompCdMs: number;
  chargeHeld: boolean;
  stompHeld: boolean;
  /** Last error emitted and the time left before the same error may be emitted again. */
  errorReason: AbilityErrorReason | null;
  errorMs: number;
}

export function createAbilities(): AbilityState {
  return {
    gcdMs: 0,
    chargeCdMs: 0,
    stompCdMs: 0,
    chargeHeld: false,
    stompHeld: false,
    errorReason: null,
    errorMs: 0,
  };
}

/** The slice of the world the abilities touch (the `World` satisfies it structurally). */
export interface AbilityContext {
  player: Player;
  enemies: Enemy[];
  rage: Rage;
  abilities: AbilityState;
  events: SimEvent[];
}

export function tickAbilities(a: AbilityState, dtMs: number): void {
  a.gcdMs = countdown(a.gcdMs, dtMs);
  a.chargeCdMs = countdown(a.chargeCdMs, dtMs);
  a.stompCdMs = countdown(a.stompCdMs, dtMs);
  a.errorMs = countdown(a.errorMs, dtMs);
}

export type ChargeCheck =
  | { ok: true; target: Enemy; distance: number }
  | { ok: false; reason: 'OutOfRange' | 'TooClose' | 'Immune' };

/**
 * Charge targeting (SPEC 5.2): the nearest chargeable enemy ahead whose distance (player front
 * edge -> target back edge) is within [minRange, maxRange]. Pure; presentation uses it for the
 * target marker and the range tint.
 */
export function checkCharge(player: Player, enemies: readonly Enemy[]): ChargeCheck {
  const { minRange, maxRange } = CONFIG.charge;
  const front = player.x + CONFIG.player.hitbox.w / 2;
  let best: Enemy | null = null;
  let bestDistance = Infinity;
  let tooClose = false;
  let immune = false;

  for (const e of enemies) {
    const def = ENEMIES[e.kind];
    const distance = e.x - front;
    if (e.defeated || !def.chargeable || distance < 0 || distance > maxRange) continue;
    if (def.chargeImmune) immune = true;
    else if (distance < minRange) tooClose = true;
    else if (distance < bestDistance) {
      best = e;
      bestDistance = distance;
    }
  }

  if (best) return { ok: true, target: best, distance: bestDistance };
  if (tooClose) return { ok: false, reason: 'TooClose' };
  if (immune) return { ok: false, reason: 'Immune' };
  return { ok: false, reason: 'OutOfRange' };
}

function fail(ctx: AbilityContext, reason: AbilityErrorReason): void {
  const a = ctx.abilities;
  if (a.errorReason === reason && a.errorMs > 0) return; // identical errors: 1 per throttle window
  a.errorReason = reason;
  a.errorMs = CONFIG.errors.throttleMs;
  ctx.events.push({ type: 'AbilityError', reason });
}

function surge(
  ctx: AbilityContext,
  amount: number,
  source: 'stomp' | 'chargeHit' | 'kill',
  enemy: Enemy,
): void {
  surgeRage(ctx.rage, ctx.events, amount, source, enemyBox(enemy));
}

function tryStomp(ctx: AbilityContext): void {
  const a = ctx.abilities;
  const p = ctx.player;
  if (a.gcdMs > 0 || a.stompCdMs > 0) {
    fail(ctx, 'NotReady');
    return;
  }
  if (!isGrounded(p)) return; // SPEC 5.2: grounded only; no error is specified, so stay silent

  p.state = 'Stomping';
  p.lockMs = CONFIG.stomp.lockMs;
  a.stompCdMs = CONFIG.stomp.cooldownMs;
  a.gcdMs = CONFIG.gcdMs;

  let stunned = 0;
  for (const e of ctx.enemies) {
    if (e.defeated || !ENEMIES[e.kind].stompable) continue;
    if (!circleOverlapsBox(p.x, p.feetY, CONFIG.stomp.radius, enemyBox(e))) continue;
    e.stunMs = CONFIG.stomp.stunMs;
    stunned++;
    ctx.events.push({ type: 'EnemyStunned', id: e.id, kind: e.kind });
    surge(ctx, CONFIG.rage.stompPerTarget, 'stomp', e);
  }
  ctx.events.push({ type: 'StompUsed', x: p.x, stunned });
}

function tryCharge(ctx: AbilityContext): void {
  const a = ctx.abilities;
  const p = ctx.player;
  if (a.gcdMs > 0 || a.chargeCdMs > 0) {
    fail(ctx, 'NotReady');
    return;
  }
  if (!isGrounded(p)) return;

  const check = checkCharge(p, ctx.enemies);
  if (!check.ok) {
    fail(ctx, check.reason);
    return;
  }

  const fromX = p.x;
  p.state = 'Charging';
  p.dashMs = CONFIG.charge.dashMs;
  p.dashTargetId = check.target.id;
  a.chargeCdMs = CONFIG.charge.cooldownMs;
  a.gcdMs = CONFIG.gcdMs;
  ctx.events.push({ type: 'ChargeStarted', targetId: check.target.id, fromX });
}

/** Derives Charge / War Stomp press edges from the held state and starts the abilities. */
export function handleAbilityInput(ctx: AbilityContext, input: SimInput): void {
  const a = ctx.abilities;
  const charge = input.charge === true;
  const stomp = input.stomp === true;
  const chargePressed = charge && !a.chargeHeld;
  const stompPressed = stomp && !a.stompHeld;
  a.chargeHeld = charge;
  a.stompHeld = stomp;
  if (chargePressed) tryCharge(ctx);
  if (stompPressed) tryStomp(ctx);
}

/**
 * Moves a charging player toward its target (call after the enemies have scrolled this tick).
 * The player aims at where the target will be when the dash ends, so the motion is smooth and
 * never backwards. On arrival the target is defeated: +25 Rage for the hit plus the kill Rage
 * (SPEC 5.2, 6.4); the player is then `Recovering`, and normal collision applies again.
 */
export function updateCharge(ctx: AbilityContext, groundSpeed: number): void {
  const p = ctx.player;
  if (p.state !== 'Charging') return;

  const dtMs = 1000 / CONFIG.simHz;
  const target = ctx.enemies.find((e) => e.id === p.dashTargetId && !e.defeated);
  const fraction = Math.min(1, dtMs / p.dashMs);
  if (target) {
    const msAfterTick = Math.max(0, p.dashMs - dtMs);
    const arrivalX = target.x - (enemyVelocity(target, groundSpeed) * msAfterTick) / 1000;
    const goal = Math.min(CONFIG.player.maxX, arrivalX - CONFIG.player.hitbox.w / 2);
    p.x = Math.max(p.x, p.x + (goal - p.x) * fraction);
  }
  p.dashMs = countdown(p.dashMs, dtMs);
  if (p.dashMs > 0) return;

  p.x = Math.min(CONFIG.player.maxX, p.x);
  p.dashTargetId = 0;
  p.state = groundedState(p);
  if (!target) return;

  target.defeated = true;
  target.fadeMs = CONFIG.enemy.defeatFadeMs;
  const def = ENEMIES[target.kind];
  const box = enemyBox(target);
  ctx.events.push({ type: 'ChargeHit', targetId: target.id, kind: target.kind, x: box.x });
  ctx.events.push({ type: 'EnemyDefeated', id: target.id, kind: target.kind, cause: 'charge' });
  surge(ctx, CONFIG.rage.chargeHit, 'chargeHit', target);
  surge(ctx, def.chargeKillRage, 'kill', target);
}
