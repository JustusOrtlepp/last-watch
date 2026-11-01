import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../src/config';
import { TIERS } from '../../src/content/encounters';
import { ENEMIES, OBSTACLES, type EnemyKind } from '../../src/content/entities';
import { NO_INPUT } from '../../src/sim/player';
import { groundGap, minGap } from '../../src/sim/spawner';
import { speedAtTick } from '../../src/sim/travel';
import { createWorld, isDead, stepWorld } from '../../src/sim/world';

/**
 * Fairness rules 1-4 (SPEC 7.4), checked on hazards observed in a real world. A ghost player (it
 * does nothing and is revived after every death) lets the spawner run to distanceRage 10,000 on
 * each seed; every hazard's arrival at the player is measured from the sim, not from the spawner's
 * own plan. The perfect-play autopilot (rule 5) is P4c.
 *
 * FAIRNESS_SEEDS (default 1000) sets the number of seeds; only the default counts for a gate (R15).
 * On a violation the seed and a compact trace go to .tmp/fairness-fail.txt (R16).
 */
const SEEDS = Math.max(1, Math.floor(Number(process.env['FAIRNESS_SEEDS'] ?? 1000)) || 1000);
const TARGET_RAGE = 10_000;
const MAX_TICKS = 40_000;

const FRONT = CONFIG.player.homeX + CONFIG.player.hitbox.w / 2;
const ticks = (ms: number): number => Math.round((ms * CONFIG.simHz) / 1000);
const STOMP_CD = ticks(CONFIG.stomp.cooldownMs);
const CHARGE_CD = ticks(CONFIG.charge.cooldownMs);
const GCD = ticks(CONFIG.gcdMs);
const AIR_SEC = (2 * -CONFIG.player.jumpVelocity) / CONFIG.player.gravity;
const NEEDS: Partial<Record<string, 'stomp' | 'either'>> = { kodo: 'stomp', harpyMid: 'either' };
const TIER_OF: Record<string, number> = {
  thornbush: 0,
  boulder: 0,
  totem: 1,
  quilboar: 1,
  kodo: 2,
  plainstrider: 3,
  harpyLow: 3,
  harpyHigh: 3,
  harpyMid: 4,
  centaur: 5,
};

interface Hazard {
  kind: string;
  spawnTick: number;
  rageAtSpawn: number;
  /** Tick its left edge reached the player's front edge (-1 while on its way). */
  arrival: number;
  /** Ticks at which an enemy first came within War Stomp / Charge reach. */
  reachStomp: number;
  reachCharge: number;
  width: number;
  members: number;
}

function stompReachX(kind: EnemyKind): number {
  const lift = ENEMIES[kind].bottom;
  return CONFIG.player.homeX + Math.sqrt(CONFIG.stomp.radius ** 2 - lift ** 2);
}

/** Runs one seed; returns every hazard group that arrived, in arrival order. */
function observe(seed: number): Hazard[] {
  const world = createWorld(seed);
  const byEntity = new Map<number, Hazard>();
  const groups = new Map<string, Hazard>();
  const all: Hazard[] = [];

  const adopt = (id: number, kind: string, width: number, tick: number): Hazard => {
    const key = `${kind}@${tick}`;
    let group = groups.get(key);
    if (group) {
      group.width +=
        width + (OBSTACLES[kind as keyof typeof OBSTACLES] ? CONFIG.spawn.clusterGapPx : 0);
      group.members++;
    } else {
      group = {
        kind,
        spawnTick: tick,
        rageAtSpawn: world.rage.distanceRage,
        arrival: -1,
        reachStomp: -1,
        reachCharge: -1,
        width,
        members: 1,
      };
      groups.set(key, group);
      all.push(group);
    }
    byEntity.set(id, group);
    return group;
  };

  while (world.rage.distanceRage < TARGET_RAGE && world.tick < MAX_TICKS) {
    stepWorld(world, NO_INPUT);
    if (isDead(world)) world.player.state = 'Running';
    const tick = world.tick - 1;
    for (const o of world.obstacles) {
      const g = byEntity.get(o.id) ?? adopt(o.id, o.kind, OBSTACLES[o.kind].w, tick);
      if (g.arrival < 0 && o.x <= FRONT) g.arrival = tick;
    }
    for (const e of world.enemies) {
      const g = byEntity.get(e.id) ?? adopt(e.id, e.kind, ENEMIES[e.kind].w, tick);
      if (g.reachStomp < 0 && e.x <= stompReachX(e.kind)) g.reachStomp = tick;
      if (g.reachCharge < 0 && e.x - FRONT <= CONFIG.charge.maxRange) g.reachCharge = tick;
      if (g.arrival < 0 && e.x <= FRONT) g.arrival = tick;
    }
    // Keep the group map small: spawn ticks older than the screen crossing can no longer gain members.
    if (tick % 600 === 0) {
      for (const [key, g] of groups) if (g.spawnTick < tick - 599) groups.delete(key);
    }
  }
  return all.filter((h) => h.arrival >= 0).sort((a, b) => a.arrival - b.arrival);
}

/** Returns the first rule violation found in a seed's hazards, or null. */
function violation(hazards: readonly Hazard[]): { message: string; at: number } | null {
  let stompReady = 0;
  let chargeReady = 0;
  let gcdReady = 0;
  let lastStompUse = -Infinity;

  for (let i = 0; i < hazards.length; i++) {
    const h = hazards[i]!;
    if (h.rageAtSpawn < TIERS[TIER_OF[h.kind]!]!.fromRage) {
      return {
        at: i,
        message: `${h.kind} spawned at rage ${h.rageAtSpawn.toFixed(0)}, before tier ${TIER_OF[h.kind]}`,
      };
    }

    // Rule 1.
    const prev = hazards[i - 1];
    if (prev) {
      const gap = groundGap(prev.arrival, h.arrival, prev.width);
      const need = minGap(h.arrival, prev.width);
      if (gap < need - 1e-6) {
        return {
          at: i,
          message: `rule 1: gap ${gap.toFixed(0)} < ${need.toFixed(0)} (${prev.kind} -> ${h.kind})`,
        };
      }
      // Rule 4: a high harpy never shares a jump window with a neighbour.
      if (prev.kind === 'harpyHigh' || h.kind === 'harpyHigh') {
        const jump = speedAtTick(h.arrival) * AIR_SEC;
        if (gap < jump) {
          return {
            at: i,
            message: `rule 4: gap ${gap.toFixed(0)} < jump ${jump.toFixed(0)} (${prev.kind} -> ${h.kind})`,
          };
        }
      }
    }

    // Rules 2 and 3: the player uses abilities no earlier than needed (at the hazard's arrival).
    const need = NEEDS[h.kind];
    if (!need) continue;
    if (need === 'either' && chargeReady <= h.reachCharge && gcdReady <= h.reachCharge) {
      chargeReady = h.arrival + CHARGE_CD;
      gcdReady = h.arrival + GCD;
      continue;
    }
    if (!(stompReady <= h.reachStomp && gcdReady <= h.reachStomp)) {
      return {
        at: i,
        message: `rule 2: ${h.kind} in reach at ${h.reachStomp} but stomp ready ${stompReady}, gcd ${gcdReady}`,
      };
    }
    if (h.arrival - lastStompUse < STOMP_CD + CONFIG.simHz * CONFIG.spawn.stompExtraSec) {
      return {
        at: i,
        message: `rule 3: stomp-required hazards ${h.arrival - lastStompUse} ticks apart`,
      };
    }
    lastStompUse = h.arrival;
    stompReady = h.arrival + STOMP_CD;
    gcdReady = h.arrival + GCD;
  }
  return null;
}

function writeFailure(
  seed: number,
  hazards: readonly Hazard[],
  v: { message: string; at: number },
): void {
  const from = Math.max(0, v.at - 8);
  const lines = [
    `seed ${seed}: ${v.message}`,
    `hazards ${from}..${v.at} (kind spawn arrival width rage):`,
  ];
  for (let i = from; i <= Math.min(v.at, from + 24); i++) {
    const h = hazards[i]!;
    lines.push(
      `${i === v.at ? '>' : ' '} ${i} ${h.kind} s${h.spawnTick} a${h.arrival} w${h.width} r${h.rageAtSpawn.toFixed(0)}`,
    );
  }
  mkdirSync('.tmp', { recursive: true });
  writeFileSync('.tmp/fairness-fail.txt', `${lines.slice(0, 30).join('\n')}\n`, 'utf8');
}

describe('spawner fairness (SPEC 7.4 rules 1-4)', () => {
  it(`holds on ${SEEDS} seeded runs to distanceRage ${TARGET_RAGE}`, { timeout: 1_800_000 }, () => {
    let total = 0;
    const kinds = new Set<string>();
    for (let seed = 1; seed <= SEEDS; seed++) {
      const hazards = observe(seed);
      total += hazards.length;
      for (const h of hazards) kinds.add(h.kind);
      const v = violation(hazards);
      if (v) {
        writeFailure(seed, hazards, v);
        expect.fail(`seed ${seed}: ${v.message} (see .tmp/fairness-fail.txt)`);
      }
    }
    // The runs actually exercised the whole content set.
    expect(kinds.size).toBe(Object.keys(TIER_OF).length);
    expect(total).toBeGreaterThan(SEEDS * 20);
  });
});
