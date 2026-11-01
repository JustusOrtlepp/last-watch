import { CONFIG } from '../config';
import { ENEMIES } from '../content/entities';
import { checkCharge } from '../sim/abilities';
import { circleOverlapsBox } from '../sim/collision';
import { enemyBox } from '../sim/enemies';
import type { SimEvent } from '../sim/events';
import { NO_INPUT, isGrounded, type SimInput } from '../sim/player';
import { isDead, stepWorld, type World } from '../sim/world';

/**
 * Perfect-play autopilot (SPEC 7.4 rule 5, 14.1), used by the fairness tests only.
 *
 * The sim is deterministic and the hazard stream does not depend on the player, so the bot plays
 * with perfect information: it keeps a "frontier" copy of the world simulated ahead of the real one
 * under its planned actions. When the frontier dies, a depth-first search repairs the plan: it finds
 * the first death under the current plan and tries one more action in the ticks before it, then
 * recurses on the next death. Actions are tried in a fixed preference order (jump, short hop,
 * Charge, War Stomp; Kodo -> War Stomp first; mid harpy -> Charge, then War Stomp, never a jump,
 * since SPEC 6.2 says it cannot be jumped) so abilities are only spent when a jump cannot solve the
 * situation, and as late as possible.
 */

export type ActionKind = 'jump' | 'hop' | 'charge' | 'stomp';

export interface Action {
  /** Tick on which the key is pressed. */
  tick: number;
  kind: ActionKind;
}

export interface Autopilot {
  /** Planned and in-progress actions, by tick. */
  actions: Action[];
  /** World copy simulated ahead under `actions` (null until the first plan). */
  frontier: World | null;
  /** No surviving plan was found; the bot keeps its last plan until this tick. */
  stuckUntil: number;
  /** Plan repairs (searches) so far. */
  repairs: number;
}

const DT_MS = 1000 / CONFIG.simHz;
/** A full jump holds the key past the point where a release would cut it short (SPEC 5.1). */
const JUMP_HOLD =
  Math.ceil(
    ((CONFIG.player.shortHopVelocity - CONFIG.player.jumpVelocity) / CONFIG.player.gravity) *
      CONFIG.simHz,
  ) + 2;
/** The frontier is kept at least MIN_AHEAD ticks ahead and extended to HORIZON ticks ahead. */
const HORIZON = 180;
const MIN_AHEAD = 120;
/** Ticks before a death in which a fixing action is searched. */
const LOOKBACK = 60;
const MAX_DEPTH = 8;
/** Search nodes per repair before giving up. */
const NODE_BUDGET = 600;
/** First tick tried for a jump / hop, in ticks before the contact (apex near the hazard). */
const JUMP_LEAD = 15;
const HOP_LEAD = 8;

const DEFAULT_ORDER: readonly ActionKind[] = ['jump', 'hop', 'charge', 'stomp'];
const ORDER: Readonly<Record<string, readonly ActionKind[]>> = {
  kodo: ['stomp', 'jump', 'hop', 'charge'],
  harpyMid: ['charge', 'stomp'],
};

export function createAutopilot(): Autopilot {
  return { actions: [], frontier: null, stuckUntil: -1, repairs: 0 };
}

/** Deep copy of plain simulation data (the world holds only objects, arrays and primitives). */
export function cloneWorld(world: World): World {
  return clonePlain(world);
}

function clonePlain<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map(clonePlain) as T;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value))
    out[key] = clonePlain((value as Record<string, unknown>)[key]);
  return out as T;
}

/** Held keys on `tick` for a list of actions. */
export function inputAt(actions: readonly Action[], tick: number): SimInput {
  let jump = false;
  let charge = false;
  let stomp = false;
  for (const a of actions) {
    if (a.kind === 'jump') jump ||= tick >= a.tick && tick < a.tick + JUMP_HOLD;
    else if (a.tick === tick) {
      if (a.kind === 'hop') jump = true;
      else if (a.kind === 'charge') charge = true;
      else stomp = true;
    }
  }
  return jump || charge || stomp ? { jump, down: false, charge, stomp } : NO_INPUT;
}

/** Input for the world's current tick. Call once per tick, before `stepWorld`. */
export function autopilotInput(bot: Autopilot, world: World): SimInput {
  if (
    world.tick >= bot.stuckUntil &&
    (!bot.frontier || bot.frontier.tick < world.tick + MIN_AHEAD)
  ) {
    extend(bot, world);
  }
  return inputAt(bot.actions, world.tick);
}

interface Outcome {
  /** Tick of the fatal step, or -1 when the world survived to `end`. */
  death: number;
  cause: string;
}

/** Steps `w` in place under `actions` until it dies or reaches tick `end`. */
function simulate(w: World, actions: readonly Action[], end: number): Outcome {
  while (w.tick < end) {
    const tick = w.tick;
    stepWorld(w, inputAt(actions, tick));
    if (isDead(w)) return { death: tick, cause: deathCause(w.events) };
    w.events.length = 0;
  }
  return { death: -1, cause: '' };
}

function deathCause(events: readonly SimEvent[]): string {
  for (const e of events) if (e.type === 'PlayerDied') return e.cause;
  return '';
}

function extend(bot: Autopilot, world: World): void {
  const now = world.tick;
  const end = now + HORIZON;
  bot.actions = bot.actions.filter((a) => a.tick >= now - JUMP_HOLD);
  if (!bot.frontier || bot.frontier.tick < now) bot.frontier = cloneWorld(world);
  const outcome = simulate(bot.frontier, bot.actions, end);
  if (outcome.death < 0) return;

  bot.repairs++;
  // First keep the actions already verified up to the death; then re-plan everything not started.
  const keepBefore = Math.max(now, outcome.death - LOOKBACK);
  const attempts = [keepBefore, now];
  for (const from of attempts) {
    const kept = bot.actions.filter((a) => a.tick < from);
    const plan = solve(world, kept, from, end, -1, MAX_DEPTH, { left: NODE_BUDGET });
    if (plan) {
      bot.actions = plan.actions;
      bot.frontier = plan.final;
      return;
    }
  }
  bot.frontier = null;
  bot.stuckUntil = outcome.death + 1;
}

interface Plan {
  actions: Action[];
  final: World;
}

/**
 * Finds actions (added to `actions`, none before `earliest`) that keep `root` alive to `end`.
 * A branch must die later than `mustPass` to be worth expanding.
 */
function solve(
  root: World,
  actions: Action[],
  earliest: number,
  end: number,
  mustPass: number,
  depth: number,
  budget: { left: number },
): Plan | null {
  if (budget.left-- <= 0) return null;
  const w = cloneWorld(root);
  w.events = [];
  const outcome = simulate(w, actions, end);
  if (outcome.death < 0) return { actions, final: w };
  const death = outcome.death;
  if (death <= mustPass || depth === 0) return null;

  const from = Math.max(earliest, death - LOOKBACK);
  if (from >= death) return null;
  const snaps: World[] = [];
  const s = cloneWorld(root);
  s.events = [];
  simulate(s, actions, from);
  for (let t = from; t < death; t++) {
    snaps.push(cloneWorld(s));
    stepWorld(s, inputAt(actions, t));
    s.events.length = 0;
  }

  for (const kind of ORDER[outcome.cause] ?? DEFAULT_ORDER) {
    for (const t of candidateTicks(kind, from, death)) {
      const snap = snaps[t - from]!;
      if (!canAct(kind, snap)) continue;
      const plan = solve(
        snap,
        [...actions, { tick: t, kind }],
        t + 1,
        end,
        death,
        depth - 1,
        budget,
      );
      if (plan) return plan;
      if (budget.left <= 0) return null;
    }
  }
  return null;
}

/** Jumps: outward from the tick that puts the apex near the hazard. Abilities: latest first. */
function candidateTicks(kind: ActionKind, from: number, death: number): number[] {
  const last = death - 1;
  if (kind === 'charge' || kind === 'stomp') {
    const out: number[] = [];
    for (let t = last; t >= from; t--) out.push(t);
    return out;
  }
  const centre = Math.min(last, Math.max(from, death - (kind === 'jump' ? JUMP_LEAD : HOP_LEAD)));
  const out = [centre];
  for (let k = 1; centre + k <= last || centre - k >= from; k++) {
    if (centre + k <= last) out.push(centre + k);
    if (centre - k >= from) out.push(centre - k);
  }
  return out;
}

/** Whether the action can start on the tick that follows snapshot `w` (cheap pruning only). */
function canAct(kind: ActionKind, w: World): boolean {
  const p = w.player;
  if (!isGrounded(p)) return false;
  if (kind === 'jump' || kind === 'hop') return true;
  const a = w.abilities;
  if (a.gcdMs > DT_MS) return false;
  if (kind === 'charge') return a.chargeCdMs <= DT_MS && checkCharge(p, w.enemies).ok;
  return (
    a.stompCdMs <= DT_MS &&
    w.enemies.some(
      (e) =>
        !e.defeated &&
        ENEMIES[e.kind].stompable &&
        circleOverlapsBox(p.x, p.feetY, CONFIG.stomp.radius, enemyBox(e)),
    )
  );
}
