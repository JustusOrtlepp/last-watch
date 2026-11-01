import { CONFIG } from '../config';
import { ARROW, ENEMIES, OBSTACLES, type EnemyKind, type ObstacleKind } from '../content/entities';
import {
  ENCOUNTERS,
  FALLBACK_ENCOUNTER_ID,
  HINT_IDS,
  TIERS,
  tierAt,
  type Encounter,
  type EncounterItem,
  type HazardKind,
  type HintId,
} from '../content/encounters';
import { telegraphX } from './enemies';
import { nextFloat, type Rng } from './rng';
import { groundDistance, speedAtTick, travelEndTick } from './travel';

/**
 * Encounter spawner (SPEC 7.2 - 7.4).
 *
 * Everything is planned in ticks. A hazard "arrives" on the tick its left edge reaches the player's
 * front edge; the spawner picks each hazard's spawn tick so that its arrival lands where the fairness
 * rules need it, predicting enemy walking, the Plainstrider's dust-cloud lead and the speed ramp
 * exactly (`travel.ts` mirrors the world's per-tick movement).
 *
 * Fairness rules (SPEC 7.4), enforced at planning time and re-checked by tests/fairness:
 *  1. Ground gap between consecutive hazards >= max(gapMin, speed * 0.35 s + previous width). The
 *     gap is the ground scroll between the two arrivals minus the previous hazard's width. Placement
 *     uses a larger "comfort" gap (a full jump plus the reaction time), so this is only a floor.
 *  2. Kodo (stomp) and mid harpy (stomp or Charge) are only placed when the ability is predicted to
 *     be off cooldown (and the GCD free) when the hazard comes into range, assuming the player uses
 *     abilities no later than needed. `Ledger` tracks the latest possible use of each ability.
 *  3. Two stomp-required hazards are at least cooldown + 1 s of travel apart.
 *  4. A high harpy never shares a jump window with another hazard: every neighbour is at least a
 *     full jump plus reaction time away (the comfort gap, which rule 1 already floors).
 */

/** Distance from the player's x to the front edge of its hitbox is the arrival line. */
const FRONT = CONFIG.player.homeX + CONFIG.player.hitbox.w / 2;
const AIR_SEC = (2 * -CONFIG.player.jumpVelocity) / CONFIG.player.gravity;
const ticks = (ms: number): number => Math.round((ms * CONFIG.simHz) / 1000);
const STOMP_CD = ticks(CONFIG.stomp.cooldownMs);
const CHARGE_CD = ticks(CONFIG.charge.cooldownMs);
const GCD = ticks(CONFIG.gcdMs);
const STOMP_SPACING = STOMP_CD + Math.round(CONFIG.spawn.stompExtraSec * CONFIG.simHz);

export const HAZARD_KINDS: readonly HazardKind[] = [
  ...(Object.keys(OBSTACLES) as ObstacleKind[]),
  ...(Object.keys(ENEMIES) as EnemyKind[]),
];

export function isEnemyKind(kind: HazardKind): kind is EnemyKind {
  return kind in ENEMIES;
}

/** Which ability a hazard forces: Kodo needs War Stomp, a mid harpy needs Stomp or Charge. */
export const ABILITY_NEED: Readonly<Partial<Record<HazardKind, 'stomp' | 'either'>>> = {
  kodo: 'stomp',
  harpyMid: 'either',
};

/** Total width of an encounter item (a thornbush cluster is one wide hazard). */
export function itemWidth(item: EncounterItem): number {
  if (isEnemyKind(item.kind)) return ENEMIES[item.kind].w;
  const count = item.count ?? 1;
  return count * OBSTACLES[item.kind].w + (count - 1) * CONFIG.spawn.clusterGapPx;
}

function ownSpeed(kind: HazardKind): number {
  return isEnemyKind(kind) ? ENEMIES[kind].speed : 0;
}

/** x at which a hazard appears when it spawns on `tick` (a Plainstrider starts a dust-cloud lead out). */
export function spawnX(kind: HazardKind, tick: number): number {
  return isEnemyKind(kind) && ENEMIES[kind].telegraphed
    ? telegraphX(kind, speedAtTick(tick))
    : CONFIG.logicalWidth;
}

/** Hazard waiting for its spawn tick. */
export interface Pending {
  spawnTick: number;
  kind: HazardKind;
  /** Thornbush cluster size (1 for everything else). */
  count: number;
  width: number;
  hint?: HintId;
}

/** A hazard handed to the world: one entity per `xs` entry (several for a thornbush cluster). */
export interface SpawnedHazard {
  kind: HazardKind;
  xs: number[];
  width: number;
  hint?: HintId;
}

/** Latest possible use of each ability according to the planned hazards, in ticks. */
interface Ledger {
  stompReady: number;
  /** Rule 3: the next stomp-required hazard may arrive no earlier than this. */
  stompNext: number;
  chargeReady: number;
  gcdReady: number;
}

interface Last {
  /** Arrival tick of its left edge at the player. */
  body: number;
  width: number;
}

export interface SpawnerState {
  queue: Pending[];
  last: Last | null;
  ledger: Ledger;
  /** Index of the next tier whose intro has not been handled yet. */
  introsDone: number;
  planned: number;
}

export function createSpawner(): SpawnerState {
  return {
    queue: [],
    last: null,
    ledger: { stompReady: 0, stompNext: 0, chargeReady: 0, gcdReady: 0 },
    introsDone: 0,
    planned: 0,
  };
}

export interface SpawnContext {
  /** The world tick the call happens in (hazards due on or before it spawn now). */
  tick: number;
  distanceRage: number;
  rng: Rng;
}

export interface Arrivals {
  /** First tick of the hazard's threat: the arrow for an archer, else its left edge arriving. */
  lead: number;
  /** Tick its left edge reaches the player's front edge. */
  body: number;
}

/** Predicted arrival ticks of a hazard that spawns at the end of `spawnTick`. */
export function arrivals(kind: HazardKind, spawnTick: number): Arrivals {
  const x0 = spawnX(kind, spawnTick);
  const body = travelEndTick(spawnTick, x0 - FRONT, ownSpeed(kind));
  if (kind !== 'centaur') return { lead: body, body };
  // The archer fires as it enters range; the arrow flies ahead of it (SPEC 6.2).
  const zoneX = FRONT + CONFIG.enemy.shootMaxRange;
  const fire = travelEndTick(spawnTick, x0 - zoneX, 0);
  return { lead: travelEndTick(fire, zoneX - ARROW.w - FRONT, ARROW.speed), body };
}

/** Smallest spawn tick >= `earliest` whose lead arrival is >= `target`. */
function spawnTickFor(kind: HazardKind, target: number, earliest: number): number {
  if (arrivals(kind, earliest).lead >= target) return earliest;
  let lo = earliest; // lead(lo) < target
  let hi = Math.max(target, earliest + 1); // lead(hi) > hi >= target
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arrivals(kind, mid).lead >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Tick the hazard's left edge reaches `reachX`. */
function reachTick(kind: HazardKind, spawnTick: number, reachX: number): number {
  return travelEndTick(spawnTick, spawnX(kind, spawnTick) - reachX, ownSpeed(kind));
}

/** Left-edge x at which a hazard first touches the War Stomp circle (player on the ground). */
function stompReachX(kind: EnemyKind): number {
  const { radius } = CONFIG.stomp;
  const lift = ENEMIES[kind].bottom;
  return CONFIG.player.homeX + Math.sqrt(radius * radius - lift * lift);
}

/** Claims the ability a hazard forces; null when none is predicted to be ready (rule 2). */
function reserve(kind: HazardKind, spawnTick: number, body: number, ledger: Ledger): Ledger | null {
  const need = ABILITY_NEED[kind];
  if (!need || !isEnemyKind(kind)) return ledger;
  if (need === 'either') {
    const chargeIn = reachTick(kind, spawnTick, FRONT + CONFIG.charge.maxRange);
    if (ledger.chargeReady <= chargeIn && ledger.gcdReady <= chargeIn) {
      return { ...ledger, chargeReady: body + CHARGE_CD, gcdReady: body + GCD };
    }
  }
  const stompIn = reachTick(kind, spawnTick, stompReachX(kind));
  if (ledger.stompReady <= stompIn && ledger.gcdReady <= stompIn && ledger.stompNext <= body) {
    return {
      ...ledger,
      stompReady: body + STOMP_CD,
      stompNext: body + STOMP_SPACING,
      gcdReady: body + GCD,
    };
  }
  return null;
}

/** Ground gap between two arrivals, minus the earlier hazard's width (rule 1's measure). */
export function groundGap(
  previousBody: number,
  laterArrival: number,
  previousWidth: number,
): number {
  return groundDistance(previousBody + 1, laterArrival + 1) - previousWidth;
}

/** Rule 1: the minimum gap that must separate a hazard arriving at `laterArrival`. */
export function minGap(laterArrival: number, previousWidth: number): number {
  return Math.max(
    CONFIG.spawn.gapMinPx,
    CONFIG.spawn.reactionSec * speedAtTick(laterArrival) + previousWidth,
  );
}

/** Earliest arrival that leaves `mult` times the comfort gap (a full jump plus reaction time). */
function arriveAfter(previous: Last, mult: number): number {
  const comfort = speedAtTick(previous.body) * (AIR_SEC + CONFIG.spawn.reactionSec) * mult;
  const edge = Math.max(CONFIG.spawn.gapMinPx, comfort);
  let t = travelEndTick(previous.body, previous.width + edge, 0);
  while (groundGap(previous.body, t, previous.width) < minGap(t, previous.width)) t++;
  return t;
}

interface Layout {
  pending: Pending[];
  last: Last;
  ledger: Ledger;
}

/** Lays an encounter out after the previous hazard; null when rule 2 / 3 cannot be met. */
function place(
  encounter: Encounter,
  state: SpawnerState,
  earliest: number,
  firstMult: number,
  delay: number,
): Layout | null {
  let previous = state.last;
  let ledger = state.ledger;
  const pending: Pending[] = [];
  for (let i = 0; i < encounter.items.length; i++) {
    const item = encounter.items[i]!;
    const mult = i === 0 ? firstMult : CONFIG.spawn.gapMult[item.gap ?? 'normal'];
    let target = previous ? arriveAfter(previous, mult) : 0;
    if (i === 0) target += delay;
    const spawnTick = spawnTickFor(item.kind, target, earliest);
    const { body } = arrivals(item.kind, spawnTick);
    const claimed = reserve(item.kind, spawnTick, body, ledger);
    if (!claimed) return null;
    ledger = claimed;
    const width = itemWidth(item);
    pending.push({
      spawnTick,
      kind: item.kind,
      count: item.count ?? 1,
      width,
      ...(i === 0 && encounter.intro ? { hint: encounter.intro } : {}),
    });
    previous = { body, width };
  }
  return { pending, last: previous!, ledger };
}

const BY_ID = new Map(ENCOUNTERS.map((e) => [e.id, e]));
const FALLBACK = BY_ID.get(FALLBACK_ENCOUNTER_ID)!;

/** The next tier intro that is due, or null. Advances `introsDone` past tiers without one. */
function dueIntro(state: SpawnerState, distanceRage: number): Encounter | null {
  const tier = tierAt(distanceRage);
  while (state.introsDone <= tier) {
    const id = TIERS[state.introsDone++]!.intro;
    if (id) return BY_ID.get(id)!;
  }
  return null;
}

/** Weighted draw among the encounters unlocked at `distanceRage` (intros are never drawn). */
function draw(rng: Rng, distanceRage: number): Encounter {
  const pool = ENCOUNTERS.filter((e) => e.weight > 0 && TIERS[e.tier]!.fromRage <= distanceRage);
  let roll = nextFloat(rng) * pool.reduce((sum, e) => sum + e.weight, 0);
  for (const e of pool) {
    roll -= e.weight;
    if (roll < 0) return e;
  }
  return pool[pool.length - 1]!;
}

function plan(state: SpawnerState, ctx: SpawnContext): void {
  const first = state.planned === 0 ? travelEndTick(0, CONFIG.spawn.firstGapPx, 0) : 0;
  const earliest = Math.max(ctx.tick + 1, first);
  const firstMult = CONFIG.spawn.gapMult.normal * (1 + nextFloat(ctx.rng) * CONFIG.spawn.gapJitter);

  let layout: Layout | null = null;
  const intro = dueIntro(state, ctx.distanceRage);
  if (intro) {
    // An intro must appear: wait for the abilities it needs rather than skipping it.
    for (let delay = 0; !layout && delay <= 60 * CONFIG.simHz; delay += GCD) {
      layout = place(intro, state, earliest, firstMult, delay);
    }
  } else {
    for (let i = 0; !layout && i < CONFIG.spawn.attempts; i++) {
      layout = place(draw(ctx.rng, ctx.distanceRage), state, earliest, firstMult, 0);
    }
  }
  layout ??= place(FALLBACK, state, earliest, firstMult, 0)!;

  state.queue.push(...layout.pending);
  state.queue.sort((a, b) => a.spawnTick - b.spawnTick);
  state.last = layout.last;
  state.ledger = layout.ledger;
  state.planned++;
}

function materialise(p: Pending, tick: number): SpawnedHazard {
  const x = spawnX(p.kind, tick);
  const step = isEnemyKind(p.kind) ? 0 : OBSTACLES[p.kind].w + CONFIG.spawn.clusterGapPx;
  const xs = Array.from({ length: p.count }, (_, i) => x + i * step);
  return { kind: p.kind, xs, width: p.width, ...(p.hint ? { hint: p.hint } : {}) };
}

/**
 * Call once per tick (after the world scrolled). Plans the next encounter when the previous one has
 * fully spawned, and returns the hazards due this tick.
 */
export function updateSpawner(state: SpawnerState, ctx: SpawnContext): SpawnedHazard[] {
  if (state.queue.length === 0) plan(state, ctx);
  const due: SpawnedHazard[] = [];
  while (state.queue.length > 0 && state.queue[0]!.spawnTick <= ctx.tick) {
    due.push(materialise(state.queue.shift()!, ctx.tick));
  }
  return due;
}

/** Numbers describing the spawner state, for the determinism hash. */
export function spawnerSignature(state: SpawnerState): number[] {
  const out = [
    state.planned,
    state.introsDone,
    state.last?.body ?? -1,
    state.last?.width ?? -1,
    state.ledger.stompReady,
    state.ledger.stompNext,
    state.ledger.chargeReady,
    state.ledger.gcdReady,
    state.queue.length,
  ];
  for (const p of state.queue) {
    out.push(
      p.spawnTick,
      HAZARD_KINDS.indexOf(p.kind),
      p.count,
      p.hint ? HINT_IDS.indexOf(p.hint) : -1,
    );
  }
  return out;
}
