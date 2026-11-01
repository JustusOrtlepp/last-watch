import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/config';
import {
  ENCOUNTERS,
  HINT_IDS,
  HINT_TEXT,
  TIERS,
  tierAt,
  type HintId,
} from '../../../src/content/encounters';
import { createRng } from '../../../src/sim/rng';
import {
  ABILITY_NEED,
  arrivals,
  createSpawner,
  groundGap,
  isEnemyKind,
  itemWidth,
  minGap,
  spawnX,
  updateSpawner,
  type SpawnedHazard,
} from '../../../src/sim/spawner';
import { groundDistance, speedAtTick, travelEndTick } from '../../../src/sim/travel';
import { createWorld, addEnemy, drainEvents, hashWorld } from '../../../src/sim/world';
import { run } from './helpers';

describe('travel prediction', () => {
  const brute = (from: number, to: number): number => {
    let sum = 0;
    for (let t = from; t < to; t++) sum += speedAtTick(t) / CONFIG.simHz;
    return sum;
  };

  it('groundDistance equals the per-tick sum, across the speed cap', () => {
    for (const [from, to] of [
      [0, 1],
      [0, 600],
      [37, 4000],
      [5300, 5500],
      [6000, 6400],
    ] as const) {
      expect(groundDistance(from, to)).toBeCloseTo(brute(from, to), 6);
    }
    expect(groundDistance(10, 10)).toBe(0);
  });

  it('travelEndTick is the first tick whose accumulated movement covers the distance', () => {
    for (const [start, distance, own] of [
      [0, 600, 0],
      [100, 700, 60],
      [5300, 2000, 220],
      [900, 1500, 40],
    ] as const) {
      const end = travelEndTick(start, distance, own);
      const moved = (t: number): number =>
        brute(start + 1, t + 1) + (own * (t - start)) / CONFIG.simHz;
      expect(moved(end)).toBeGreaterThanOrEqual(distance);
      expect(moved(end - 1)).toBeLessThan(distance);
    }
  });

  it('predicts the real arrival tick of a hazard in a running world', () => {
    const front = CONFIG.player.homeX + CONFIG.player.hitbox.w / 2;
    for (const kind of ['kodo', 'quilboar', 'plainstrider', 'harpyHigh'] as const) {
      const w = createWorld(1, { spawning: false });
      run(w, 1); // tick 0; the hazard spawns at its end
      const enemy = addEnemy(w, kind, spawnX(kind, 0));
      let arrival = -1;
      for (let i = 0; i < 4000 && arrival < 0; i++) {
        run(w, 1);
        w.player.state = 'Running';
        if (enemy.x <= front) arrival = w.tick - 1;
      }
      expect(arrival).toBe(arrivals(kind, 0).body);
    }
  });
});

describe('encounter content (SPEC 7.2, 7.3)', () => {
  it('matches the SPEC tier table', () => {
    expect(TIERS.map((t) => t.fromRage)).toEqual([0, 300, 700, 1200, 1800, 2500, 3500]);
    expect(HINT_TEXT).toEqual({
      jump: 'Press Space to jump',
      charge: 'Press Q to Charge an enemy',
      stomp: "Kodo can't be jumped. Press E to War Stomp!",
      harpyMid: 'Harpy at head height - Stomp or Charge it',
    });
  });

  it('tierAt returns the highest unlocked tier', () => {
    expect(tierAt(0)).toBe(0);
    expect(tierAt(299.9)).toBe(0);
    expect(tierAt(300)).toBe(1);
    expect(tierAt(699)).toBe(1);
    expect(tierAt(700)).toBe(2);
    expect(tierAt(1200)).toBe(3);
    expect(tierAt(1800)).toBe(4);
    expect(tierAt(2500)).toBe(5);
    expect(tierAt(3500)).toBe(6);
    expect(tierAt(1e6)).toBe(6);
  });

  it('has unique ids, valid tiers and positive weights for drawable encounters', () => {
    const ids = new Set(ENCOUNTERS.map((e) => e.id));
    expect(ids.size).toBe(ENCOUNTERS.length);
    for (const e of ENCOUNTERS) {
      expect(TIERS[e.tier]).toBeDefined();
      expect(e.items.length).toBeGreaterThan(0);
      if (e.intro) expect(e.weight).toBe(0);
      else expect(e.weight).toBeGreaterThan(0);
    }
  });

  it('every tier intro names an existing intro encounter of that tier with the right hint', () => {
    TIERS.forEach((tier, index) => {
      if (!tier.intro) return;
      const e = ENCOUNTERS.find((x) => x.id === tier.intro);
      expect(e?.tier).toBe(index);
      expect(e?.intro).toBeDefined();
      expect(HINT_IDS).toContain(e?.intro);
    });
  });

  it('adds only the SPEC kinds to each tier', () => {
    const added: string[][] = [
      ['thornbush', 'boulder'],
      ['totem', 'quilboar'],
      ['kodo'],
      ['plainstrider', 'harpyLow', 'harpyHigh'],
      ['harpyMid'],
      ['centaur'],
      [], // tier 6: packs of existing kinds only
    ];
    added.forEach((_, tier) => {
      const unlocked = added.slice(0, tier + 1).flat();
      for (const e of ENCOUNTERS.filter((x) => x.tier === tier)) {
        for (const item of e.items) expect(unlocked).toContain(item.kind);
      }
    });
    for (const e of ENCOUNTERS.filter((x) => x.tier === 6)) {
      expect(e.items.length).toBeGreaterThanOrEqual(2);
      expect(e.items.length).toBeLessThanOrEqual(3);
      expect(e.items.filter((i) => isEnemyKind(i.kind)).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('thornbush clusters are 2-3 wide', () => {
    for (const e of ENCOUNTERS) {
      for (const i of e.items) expect([undefined, 1, 2, 3]).toContain(i.count);
    }
    expect(itemWidth({ kind: 'thornbush', count: 3 })).toBe(3 * 24 + 2 * CONFIG.spawn.clusterGapPx);
  });
});

interface Seen {
  tick: number;
  hazard: SpawnedHazard;
}

/** Drives the spawner alone at the world's pace (ground speed ramp, distance Rage). */
function drive(seed: number, ticks: number): Seen[] {
  const state = createSpawner();
  const rng = createRng(seed);
  const seen: Seen[] = [];
  let distance = 0;
  for (let tick = 0; tick < ticks; tick++) {
    distance += speedAtTick(tick) / CONFIG.simHz;
    const due = updateSpawner(state, {
      tick,
      distanceRage: distance / CONFIG.rage.pxPerRage,
      rng,
    });
    for (const hazard of due) seen.push({ tick, hazard });
  }
  return seen;
}

describe('spawner', () => {
  it('is deterministic per seed and differs between seeds', () => {
    expect(drive(5, 6000)).toEqual(drive(5, 6000));
    expect(drive(5, 6000)).not.toEqual(drive(6, 6000));
  });

  it('spawns the first hazard no sooner than firstGapPx of scroll, and it is the jump intro', () => {
    const first = drive(3, 1200)[0]!;
    expect(first.hazard.kind).toBe('thornbush');
    expect(first.hazard.hint).toBe('jump');
    expect(groundDistance(0, first.tick + 1)).toBeGreaterThanOrEqual(CONFIG.spawn.firstGapPx);
  });

  it('introduces each tier with exactly one hint, in tier order', () => {
    const hints: HintId[] = [];
    for (const { hazard } of drive(11, 12000)) if (hazard.hint) hints.push(hazard.hint);
    expect(hints).toEqual(['jump', 'charge', 'stomp', 'harpyMid']);
  });

  it('never spawns a kind before its tier unlocks', () => {
    const needTier: Record<string, number> = {
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
    const state = createSpawner();
    const rng = createRng(21);
    let distance = 0;
    const kinds = new Set<string>();
    for (let tick = 0; tick < 12000; tick++) {
      distance += speedAtTick(tick) / CONFIG.simHz;
      const rage = distance / CONFIG.rage.pxPerRage;
      for (const hazard of updateSpawner(state, { tick, distanceRage: rage, rng })) {
        kinds.add(hazard.kind);
        expect(needTier[hazard.kind]).toBeLessThanOrEqual(tierAt(rage));
      }
    }
    expect(kinds.size).toBeGreaterThan(6);
  });

  it('keeps the rule 1 gap between every pair of consecutive planned hazards', () => {
    const arrivalsOf = drive(8, 9000).map(({ tick, hazard }) => ({
      body: arrivals(hazard.kind, tick - 0).body,
      width: hazard.width,
    }));
    for (let i = 1; i < arrivalsOf.length; i++) {
      const a = arrivalsOf[i - 1]!;
      const b = arrivalsOf[i]!;
      expect(groundGap(a.body, b.body, a.width)).toBeGreaterThanOrEqual(
        minGap(b.body, a.width) - 1e-6,
      );
    }
  });

  it('forces ability only for Kodo and the mid harpy', () => {
    expect(ABILITY_NEED).toEqual({ kodo: 'stomp', harpyMid: 'either' });
  });

  it('spawns a Plainstrider far off-screen (dust-cloud lead) and other hazards at the right edge', () => {
    const w = createWorld(4);
    let lead = false;
    const edge = new Set<number>();
    for (let i = 0; i < 30000 && !lead; i++) {
      run(w, 1);
      w.player.state = 'Running';
      for (const e of w.enemies) {
        if (e.kind === 'plainstrider' && e.x > CONFIG.logicalWidth + 100) lead = true;
        else if (e.x >= CONFIG.logicalWidth - 20 && e.kind !== 'plainstrider')
          edge.add(Math.round(e.x));
      }
    }
    expect(lead).toBe(true);
    expect(edge.size).toBeGreaterThan(0);
  });

  it('raises HintTriggered for the first encounter of a world run', () => {
    const w = createWorld(2);
    for (let i = 0; i < 600 && w.events.every((e) => e.type !== 'HintTriggered'); i++) {
      run(w, 1);
      w.player.state = 'Running';
    }
    const hints = drainEvents(w).filter((e) => e.type === 'HintTriggered');
    expect(hints).toEqual([{ type: 'HintTriggered', hint: 'jump' }]);
  });

  it('world state hash includes the spawner (different seeds diverge after the first plan)', () => {
    const a = createWorld(1);
    const b = createWorld(2);
    run(a, 5);
    run(b, 5);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
