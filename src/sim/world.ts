import { CONFIG } from '../config';
import { ENEMY_KINDS, type EnemyKind, type ObstacleKind } from '../content/entities';
import {
  createAbilities,
  handleAbilityInput,
  tickAbilities,
  updateCharge,
  type AbilityState,
} from './abilities';
import { overlaps } from './collision';
import { createEnemy, enemyBox, isLethal, updateEnemies, type Enemy } from './enemies';
import { obstacleBox, scrollObstacles, type Obstacle } from './entities';
import { ABILITY_ERROR_REASONS, type SimEvent } from './events';
import { arrowBox, resolveEnemies, updateArrows, type Arrow } from './hazards';
import {
  PLAYER_STATES,
  createPlayer,
  playerBox,
  updatePlayer,
  type Player,
  type SimInput,
} from './player';
import { addDistance, createRage, totalRage, type Rage } from './rage';
import { createRng, type Rng } from './rng';
import {
  createSpawner,
  isEnemyKind,
  spawnerSignature,
  updateSpawner,
  type SpawnerState,
} from './spawner';
import { speedAtTick } from './travel';

export interface World {
  seed: number;
  /** Fixed ticks simulated so far. */
  tick: number;
  /** Ground scroll speed (px/s) used by the most recent tick. */
  speed: number;
  player: Player;
  obstacles: Obstacle[];
  enemies: Enemy[];
  /** Centaur arrows in flight (SPEC 6.2). */
  arrows: Arrow[];
  abilities: AbilityState;
  rage: Rage;
  rng: Rng;
  spawner: SpawnerState;
  nextId: number;
  /** Events since the last `drainEvents`. */
  events: SimEvent[];
  /** Tests may disable the encounter spawner and place hazards by hand. */
  spawning: boolean;
}

export interface WorldOptions {
  spawning?: boolean;
}

export function createWorld(seed: number, options: WorldOptions = {}): World {
  return {
    seed,
    tick: 0,
    speed: CONFIG.speed.start,
    player: createPlayer(),
    obstacles: [],
    enemies: [],
    arrows: [],
    abilities: createAbilities(),
    rage: createRage(),
    rng: createRng(seed),
    spawner: createSpawner(),
    nextId: 1,
    events: [],
    spawning: options.spawning ?? true,
  };
}

export { speedAtTick };

export function addObstacle(world: World, kind: ObstacleKind, x: number): Obstacle {
  const obstacle: Obstacle = { id: world.nextId++, kind, x };
  world.obstacles.push(obstacle);
  return obstacle;
}

export function addEnemy(world: World, kind: EnemyKind, x: number): Enemy {
  const enemy = createEnemy(world.nextId++, kind, x);
  world.enemies.push(enemy);
  return enemy;
}

export function isDead(world: World): boolean {
  return world.player.state === 'Dead';
}

export function score(world: World): number {
  return totalRage(world.rage);
}

/** Advances the world by exactly one fixed tick (1 / simHz). No-op once the player is dead. */
export function stepWorld(world: World, input: SimInput): void {
  if (isDead(world)) return;

  const dt = 1 / CONFIG.simHz;
  world.speed = speedAtTick(world.tick);
  const dx = world.speed * dt;

  tickAbilities(world.abilities, 1000 * dt);
  updatePlayer(world.player, input, world.events);
  handleAbilityInput(world, input);

  world.obstacles = scrollObstacles(world.obstacles, dx);
  world.enemies = updateEnemies(world.enemies, dx);
  world.arrows = updateArrows(world.arrows, dx);
  updateCharge(world, world.speed);
  addDistance(world.rage, dx);

  if (world.spawning) {
    const due = updateSpawner(world.spawner, {
      tick: world.tick,
      distanceRage: world.rage.distanceRage,
      rng: world.rng,
    });
    for (const hazard of due) {
      for (const x of hazard.xs) {
        if (isEnemyKind(hazard.kind)) addEnemy(world, hazard.kind, x);
        else addObstacle(world, hazard.kind, x);
      }
      if (hazard.hint) world.events.push({ type: 'HintTriggered', hint: hazard.hint });
    }
  }

  // SPEC 5.2: the player is invulnerable during the Charge dash.
  if (world.player.state !== 'Charging') {
    const box = playerBox(world.player);
    const obstacle = world.obstacles.find((o) => overlaps(box, obstacleBox(o)));
    const enemy = obstacle
      ? undefined
      : world.enemies.find((e) => isLethal(e) && overlaps(box, enemyBox(e)));
    const arrow =
      obstacle || enemy ? undefined : world.arrows.find((a) => overlaps(box, arrowBox(a)));
    const cause = obstacle?.kind ?? enemy?.kind ?? (arrow ? 'arrow' : undefined);
    if (cause) {
      world.player.state = 'Dead';
      world.events.push({ type: 'PlayerDied', cause });
    }
  }

  resolveEnemies(world);

  world.tick++;
}

/** Shared result for a frame without events, so an idle frame allocates nothing. */
const NO_EVENTS: SimEvent[] = Object.freeze([]) as unknown as SimEvent[];

/** Returns and clears the pending events. The result must not be mutated. */
export function drainEvents(world: World): SimEvent[] {
  const events = world.events;
  if (events.length === 0) return NO_EVENTS;
  world.events = [];
  return events;
}

/** Deterministic 32-bit FNV-1a hash (hex) of all simulation state, for replay tests. */
export function hashWorld(world: World): string {
  const view = new DataView(new ArrayBuffer(8));
  let h = 0x811c9dc5;
  const feed = (n: number): void => {
    view.setFloat64(0, n);
    for (let i = 0; i < 8; i++) {
      h ^= view.getUint8(i);
      h = Math.imul(h, 0x01000193);
    }
  };

  const p = world.player;
  feed(world.tick);
  feed(world.speed);
  feed(PLAYER_STATES.indexOf(p.state));
  feed(p.x);
  feed(p.feetY);
  feed(p.vy);
  feed(p.jumpBufferMs);
  feed(p.coyoteMs);
  feed(p.jumpHeld ? 1 : 0);
  feed(p.lockMs);
  feed(p.dashMs);
  feed(p.dashTargetId);
  const a = world.abilities;
  feed(a.gcdMs);
  feed(a.chargeCdMs);
  feed(a.stompCdMs);
  feed(a.chargeHeld ? 1 : 0);
  feed(a.stompHeld ? 1 : 0);
  feed(a.errorReason === null ? -1 : ABILITY_ERROR_REASONS.indexOf(a.errorReason));
  feed(a.errorMs);
  feed(world.rage.distanceRage);
  feed(world.rage.combatRage);
  feed(world.rng.state);
  for (const n of spawnerSignature(world.spawner)) feed(n);
  feed(world.nextId);
  for (const o of world.obstacles) {
    feed(o.id);
    feed(o.x);
  }
  for (const e of world.enemies) {
    feed(e.id);
    feed(ENEMY_KINDS.indexOf(e.kind));
    feed(e.x);
    feed(e.lift);
    feed(e.fallVy);
    feed(e.stunMs);
    feed(e.defeated ? 1 : 0);
    feed(e.fadeMs);
    feed(e.fireMs);
    feed(e.justLanded ? 1 : 0);
  }
  for (const a of world.arrows) {
    feed(a.id);
    feed(a.x);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
