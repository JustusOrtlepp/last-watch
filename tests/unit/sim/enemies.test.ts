import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/config';
import { ARROW, ENEMIES, ENEMY_KINDS, type EnemyKind } from '../../../src/content/entities';
import { createEnemy, enemyBox, isTelegraphing, telegraphX } from '../../../src/sim/enemies';
import type { SimEvent } from '../../../src/sim/events';
import { arrowBox, resolveEnemies, type HazardContext } from '../../../src/sim/hazards';
import { createPlayer, NO_INPUT, type SimInput } from '../../../src/sim/player';
import { createRage } from '../../../src/sim/rage';
import {
  addEnemy,
  createWorld,
  hashWorld,
  isDead,
  stepWorld,
  type World,
} from '../../../src/sim/world';
import { eventCount, run } from './helpers';

const CHARGE: SimInput = { jump: false, down: false, charge: true };
const STOMP: SimInput = { jump: false, down: false, stomp: true };

const FRONT = CONFIG.player.homeX + CONFIG.player.hitbox.w / 2;
const TICK_MS = 1000 / CONFIG.simHz;
const ticksOf = (ms: number): number => Math.round(ms / TICK_MS);

function fresh(): World {
  return createWorld(1, { spawning: false });
}

function eventsOfType<T extends SimEvent['type']>(
  w: World,
  type: T,
): Extract<SimEvent, { type: T }>[] {
  return w.events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}

/** True if a full-height jump started at tick `delay` carries the player past an enemy at `x`. */
function jumpSurvives(kind: EnemyKind, x: number, delay: number, silent = false): boolean {
  const w = fresh();
  const e = addEnemy(w, kind, x);
  if (silent) e.fireMs = 1e9; // an archer that never shoots: only its body is under test
  run(w, 160, (i) => ({ jump: i >= delay && i < delay + 50, down: false }));
  return !isDead(w);
}

function anyJumpSurvives(kind: EnemyKind, x: number, silent = false): boolean {
  for (let delay = 0; delay <= 100; delay++) if (jumpSurvives(kind, x, delay, silent)) return true;
  return false;
}

/** True if some jump timing gets the player killed by the enemy while still in the air. */
function canDieInAir(kind: EnemyKind, x: number): boolean {
  for (let delay = 0; delay <= 100; delay++) {
    const w = fresh();
    addEnemy(w, kind, x);
    for (let i = 0; i < 160 && !isDead(w); i++) {
      const airborne = w.player.state === 'Airborne';
      stepWorld(w, { jump: i >= delay && i < delay + 50, down: false });
      if (isDead(w) && airborne) return true;
    }
  }
  return false;
}

describe('enemy definitions (SPEC 6.2, 6.4)', () => {
  it('has the SPEC hitboxes, heights and own speeds', () => {
    const box = (k: EnemyKind): [number, number, number, number] => {
      const d = ENEMIES[k];
      return [d.w, d.h, d.bottom, d.speed];
    };
    expect(box('quilboar')).toEqual([40, 36, 0, 60]);
    expect(box('plainstrider')).toEqual([36, 48, 0, 220]);
    expect(box('harpyLow')).toEqual([40, 28, 10, 80]);
    expect(box('harpyMid')).toEqual([40, 28, 50, 80]);
    expect(box('harpyHigh')).toEqual([40, 28, 90, 80]);
    expect(box('centaur')).toEqual([48, 60, 0, 0]);
    expect(box('kodo')).toEqual([128, 120, 0, 40]);
    expect(ARROW).toEqual({ w: 20, h: 4, bottom: 20, speed: 300 });
  });

  it('has the SPEC kill and trample Rage', () => {
    const rage = (k: EnemyKind): [number, number] => [
      ENEMIES[k].chargeKillRage,
      ENEMIES[k].trampleRage,
    ];
    expect(rage('quilboar')).toEqual([50, 25]);
    expect(rage('plainstrider')).toEqual([75, 40]);
    expect(rage('harpyLow')).toEqual([100, 50]);
    expect(rage('harpyMid')).toEqual([100, 50]);
    expect(rage('centaur')).toEqual([150, 75]);
    expect(rage('kodo')).toEqual([0, 200]);
  });

  it('places the enemy hitbox on its height above the ground', () => {
    const e = createEnemy(1, 'harpyMid', 300);
    expect(enemyBox(e)).toEqual({ x: 300, y: CONFIG.groundY - 50 - 28, w: 40, h: 28 });
  });
});

describe('walkers and sprinters', () => {
  it.each(ENEMY_KINDS.filter((k) => !ENEMIES[k].shoots && k !== 'harpyHigh'))(
    'a %s kills a standing player and is lethal on contact',
    (kind) => {
      const w = fresh();
      addEnemy(w, kind, 400);
      run(w, 200);
      expect(isDead(w)).toBe(true);
      expect(eventsOfType(w, 'PlayerDied')[0]).toMatchObject({ cause: kind });
    },
  );

  it('moves at ground speed plus its own speed', () => {
    for (const kind of ['quilboar', 'plainstrider', 'harpyLow'] as const) {
      const w = fresh();
      const e = addEnemy(w, kind, 800);
      const x0 = e.x;
      run(w, 1);
      expect(x0 - e.x).toBeCloseTo((w.speed + ENEMIES[kind].speed) / CONFIG.simHz, 6);
    }
  });

  it('the centaur stands: it moves only with the ground', () => {
    const w = fresh();
    const e = addEnemy(w, 'centaur', 1200);
    const x0 = e.x;
    run(w, 1);
    expect(x0 - e.x).toBeCloseTo(w.speed / CONFIG.simHz, 6);
  });
});

describe('Plainstrider telegraph (SPEC 6.2)', () => {
  it('waits off-screen and enters about 1 s after it appears', () => {
    const w = fresh();
    const e = addEnemy(w, 'plainstrider', telegraphX('plainstrider', CONFIG.speed.start));
    expect(isTelegraphing(e)).toBe(true);
    let ticks = 0;
    while (isTelegraphing(e) && ticks < 200) {
      run(w, 1);
      ticks++;
    }
    expect(w.enemies).toContain(e);
    expect(ticks / CONFIG.simHz).toBeGreaterThan(0.9 * CONFIG.enemy.telegraphSec);
    expect(ticks / CONFIG.simHz).toBeLessThan(1.05 * CONFIG.enemy.telegraphSec);
  });

  it('only the Plainstrider is telegraphed', () => {
    expect(ENEMY_KINDS.filter((k) => ENEMIES[k].telegraphed)).toEqual(['plainstrider']);
    const q = createEnemy(1, 'quilboar', 2000);
    expect(isTelegraphing(q)).toBe(false);
  });
});

describe('jumping (SPEC 6.2)', () => {
  it.each(['quilboar', 'plainstrider', 'harpyLow', 'centaur'] as const)(
    'a %s can be jumped',
    (kind) => {
      expect(anyJumpSurvives(kind, 500, true)).toBe(true);
    },
  );

  it('the Kodo cannot be jumped, whatever the timing (physics check, SPEC 6.2)', () => {
    for (let delay = 0; delay <= 100; delay++) {
      expect(jumpSurvives('kodo', 500, delay), `jump delay ${delay}`).toBe(false);
    }
  });

  it('a mid harpy kills a standing player and can kill a jumping one', () => {
    expect(jumpSurvives('harpyMid', 500, 1000)).toBe(false); // never jumps
    expect(canDieInAir('harpyMid', 500)).toBe(true);
  });

  it('a high harpy passes over a grounded player but hits a jumping one', () => {
    expect(jumpSurvives('harpyHigh', 500, 1000)).toBe(true); // stays grounded
    expect(canDieInAir('harpyHigh', 500)).toBe(true);
  });

  it('records that a perfectly timed full jump clears the mid and high harpy (SPEC says Jump: no)', () => {
    // Flight needs the player box above the harpy top: 78 / 118 px; a full jump peaks at ~140 px.
    // See DECISIONS (P4a): this is physics from SPEC 5.2 / 6.2 numbers, left for P4b fairness.
    expect(anyJumpSurvives('harpyMid', 500)).toBe(true);
    expect(anyJumpSurvives('harpyHigh', 500)).toBe(true);
  });
});

describe('Centaur Archer and arrows (SPEC 6.2)', () => {
  it('does not fire from outside the 200-700 px zone', () => {
    const w = fresh();
    addEnemy(w, 'centaur', FRONT + 900);
    run(w, 5);
    expect(w.arrows).toHaveLength(0);
    const near = fresh();
    addEnemy(near, 'centaur', FRONT + 150);
    run(near, 1);
    expect(near.arrows).toHaveLength(0);
  });

  it('fires as soon as it enters the zone, an arrow at h = 20, 20 x 4', () => {
    const w = fresh();
    const e = addEnemy(w, 'centaur', FRONT + 900);
    let ticks = 0;
    while (w.arrows.length === 0 && ticks < 200) {
      run(w, 1);
      ticks++;
    }
    const distance = e.x - FRONT;
    expect(distance).toBeLessThanOrEqual(CONFIG.enemy.shootMaxRange);
    expect(distance).toBeGreaterThan(CONFIG.enemy.shootMaxRange - 12);
    const arrow = w.arrows[0]!;
    expect(arrow.x).toBe(e.x - ARROW.w);
    expect(arrowBox(arrow)).toEqual({
      x: arrow.x,
      y: CONFIG.groundY - 20 - 4,
      w: 20,
      h: 4,
    });
    expect(eventCount(w, 'ArrowFired')).toBe(1);
  });

  it('fires every 1.6 s while it stays in the zone', () => {
    const ctx: HazardContext = {
      player: createPlayer(),
      enemies: [createEnemy(1, 'centaur', FRONT + 400)],
      arrows: [],
      rage: createRage(),
      events: [],
      nextId: 10,
    };
    const fired: number[] = [];
    for (let tick = 0; tick < 300; tick++) {
      const before = ctx.arrows.length;
      resolveEnemies(ctx);
      if (ctx.arrows.length > before) fired.push(tick);
    }
    expect(fired.length).toBe(4);
    const interval = ticksOf(CONFIG.enemy.arrowIntervalMs);
    expect(fired[0]).toBe(0);
    expect(fired[1]! - fired[0]!).toBe(interval);
    expect(fired[2]! - fired[1]!).toBe(interval);
  });

  it('arrows fly left at ground speed + 300 px/s', () => {
    const w = fresh();
    addEnemy(w, 'centaur', FRONT + 600);
    run(w, 1);
    const arrow = w.arrows[0]!;
    const x0 = arrow.x;
    run(w, 1);
    expect(x0 - arrow.x).toBeCloseTo((w.speed + ARROW.speed) / CONFIG.simHz, 6);
  });

  it('an arrow kills a standing player; a jump clears it', () => {
    const hit = fresh();
    hit.arrows.push({ id: 90, x: 400 });
    run(hit, 60);
    expect(isDead(hit)).toBe(true);
    expect(eventsOfType(hit, 'PlayerDied')[0]).toMatchObject({ cause: 'arrow' });

    const dodged = fresh();
    dodged.arrows.push({ id: 90, x: 400 });
    run(dodged, 60, (i) => ({ jump: i < 45, down: false }));
    expect(isDead(dodged)).toBe(false);
  });

  it('the Charge dash is invulnerable to arrows', () => {
    const w = fresh();
    w.player.state = 'Charging';
    w.player.dashMs = 100;
    w.arrows.push({ id: 90, x: 110 });
    run(w, 1);
    expect(isDead(w)).toBe(false);
  });

  it('a stunned or defeated archer does not fire', () => {
    const stunned = fresh();
    const a = addEnemy(stunned, 'centaur', FRONT + 400);
    a.stunMs = CONFIG.stomp.stunMs;
    run(stunned, 20);
    expect(stunned.arrows).toHaveLength(0);

    const defeated = fresh();
    const b = addEnemy(defeated, 'centaur', FRONT + 400);
    b.defeated = true;
    b.fadeMs = CONFIG.enemy.defeatFadeMs;
    run(defeated, 5);
    expect(defeated.arrows).toHaveLength(0);
  });

  it('arrows are not stunned or removed by War Stomp', () => {
    const w = fresh();
    w.arrows.push({ id: 90, x: 300 });
    const x0 = w.arrows[0]!.x;
    stepWorld(w, STOMP);
    expect(w.arrows).toHaveLength(1);
    expect(x0 - w.arrows[0]!.x).toBeCloseTo((w.speed + ARROW.speed) / CONFIG.simHz, 6);
  });

  it('leaves the screen and is removed', () => {
    const w = fresh();
    w.arrows.push({ id: 90, x: -15 });
    run(w, 1);
    expect(w.arrows).toHaveLength(0);
  });
});

describe('stun and trample (SPEC 6.3, 6.4)', () => {
  const STOMPABLE = ENEMY_KINDS.filter((k) => ENEMIES[k].stompable);

  it.each(STOMPABLE)('stunning a %s and running into it tramples it for its Rage', (kind) => {
    const w = fresh();
    addEnemy(w, kind, 250);
    stepWorld(w, STOMP);
    expect(w.rage.combatRage).toBe(CONFIG.rage.stompPerTarget);
    run(w, 90);
    expect(isDead(w)).toBe(false);
    expect(w.rage.combatRage).toBe(CONFIG.rage.stompPerTarget + ENEMIES[kind].trampleRage);
    const defeated = eventsOfType(w, 'EnemyDefeated');
    expect(defeated).toHaveLength(1);
    expect(defeated[0]!.cause).toBe(kind === 'harpyMid' ? 'fall' : 'trample');
  });

  it('a trampled enemy is knocked aside and fades out', () => {
    const w = fresh();
    const e = addEnemy(w, 'quilboar', 200);
    stepWorld(w, STOMP);
    run(w, 60);
    expect(e.defeated).toBe(true);
    run(w, ticksOf(CONFIG.enemy.defeatFadeMs) + 2);
    expect(w.enemies).not.toContain(e);
  });

  it('a trampled enemy awards its Rage once', () => {
    const w = fresh();
    addEnemy(w, 'quilboar', 200);
    stepWorld(w, STOMP);
    run(w, 200);
    expect(w.rage.combatRage).toBe(CONFIG.rage.stompPerTarget + ENEMIES.quilboar.trampleRage);
  });

  it('the Kodo needs a stun: unstunned it kills, stunned it is trampled for 200', () => {
    const lethal = fresh();
    addEnemy(lethal, 'kodo', 400);
    run(lethal, 120);
    expect(isDead(lethal)).toBe(true);

    const stomped = fresh();
    addEnemy(stomped, 'kodo', 250);
    stepWorld(stomped, STOMP);
    run(stomped, 90);
    expect(isDead(stomped)).toBe(false);
    expect(stomped.rage.combatRage).toBe(CONFIG.rage.stompPerTarget + 200);
  });

  it('jumping over a stunned enemy awards no kill Rage', () => {
    let cleared = false;
    for (let delay = 0; delay <= 40 && !cleared; delay++) {
      const w = fresh();
      const e = addEnemy(w, 'quilboar', 400);
      e.stunMs = 5000;
      run(w, 160, (i) => ({ jump: i >= delay && i < delay + 50, down: false }));
      cleared = w.rage.combatRage === 0 && !isDead(w);
    }
    expect(cleared).toBe(true);
  });

  it('the enemy is lethal again once the stun expires', () => {
    const w = fresh();
    const e = addEnemy(w, 'quilboar', 400);
    e.stunMs = 200;
    run(w, 120);
    expect(isDead(w)).toBe(true);
    expect(eventsOfType(w, 'PlayerDied')[0]).toMatchObject({ cause: 'quilboar' });
  });

  it('a stunned enemy does not trample while the player dashes; the Charge hit still lands', () => {
    const w = fresh();
    const e = addEnemy(w, 'quilboar', FRONT + 200);
    e.stunMs = 5000;
    stepWorld(w, CHARGE);
    run(w, ticksOf(CONFIG.charge.dashMs) + 2);
    expect(e.defeated).toBe(true);
    expect(w.rage.combatRage).toBe(CONFIG.rage.chargeHit + ENEMIES.quilboar.chargeKillRage);
    expect(eventsOfType(w, 'EnemyDefeated')[0]!.cause).toBe('charge');
  });
});

describe('stunned mid harpy falls (SPEC 6.3)', () => {
  it('drops to the ground, is harmless, and is defeated on landing for 50', () => {
    const w = fresh();
    const e = addEnemy(w, 'harpyMid', 260);
    stepWorld(w, STOMP);
    expect(e.stunMs).toBeGreaterThan(0);
    expect(e.lift).toBeLessThan(ENEMIES.harpyMid.bottom);

    let ticks = 1;
    while (e.lift > 0 && ticks < 60) {
      run(w, 1);
      expect(isDead(w)).toBe(false);
      ticks++;
    }
    expect(e.lift).toBe(0);
    expect(e.defeated).toBe(true);
    expect(ticks * TICK_MS).toBeLessThan(300);
    expect(w.rage.combatRage).toBe(CONFIG.rage.stompPerTarget + ENEMIES.harpyMid.trampleRage);
    const defeated = eventsOfType(w, 'EnemyDefeated');
    expect(defeated).toHaveLength(1);
    expect(defeated[0]).toMatchObject({ kind: 'harpyMid', cause: 'fall' });
  });

  it('the other harpies do not fall; the high harpy is out of reach of the stomp', () => {
    const w = fresh();
    const low = addEnemy(w, 'harpyLow', 200);
    const high = addEnemy(w, 'harpyHigh', 200);
    stepWorld(w, STOMP);
    run(w, 10);
    expect(low.stunMs).toBeGreaterThan(0);
    expect(low.lift).toBe(ENEMIES.harpyLow.bottom);
    expect(high.stunMs).toBe(0);
    expect(high.lift).toBe(ENEMIES.harpyHigh.bottom);
  });

  it('a mid harpy defeated by Charge keeps its Charge Rage and falls without extra Rage', () => {
    const w = fresh();
    addEnemy(w, 'harpyMid', FRONT + 200);
    stepWorld(w, CHARGE);
    run(w, 40);
    expect(w.rage.combatRage).toBe(CONFIG.rage.chargeHit + ENEMIES.harpyMid.chargeKillRage);
  });
});

describe('Charge kill Rage (SPEC 6.4)', () => {
  const CHARGEABLE = ENEMY_KINDS.filter((k) => ENEMIES[k].chargeable && !ENEMIES[k].chargeImmune);

  it.each(CHARGEABLE)('charging a %s gives +25 plus its kill Rage', (kind) => {
    const w = fresh();
    addEnemy(w, kind, FRONT + 200);
    stepWorld(w, CHARGE);
    run(w, ticksOf(CONFIG.charge.dashMs) + 1);
    expect(w.rage.combatRage).toBe(CONFIG.rage.chargeHit + ENEMIES[kind].chargeKillRage);
  });

  it('the high harpy cannot be charged', () => {
    const w = fresh();
    addEnemy(w, 'harpyHigh', FRONT + 200);
    stepWorld(w, CHARGE);
    expect(w.player.state).not.toBe('Charging');
  });
});

describe('determinism with enemy behaviours', () => {
  function scripted(): World {
    const w = createWorld(7, { spawning: false });
    addEnemy(w, 'centaur', FRONT + 800);
    addEnemy(w, 'harpyMid', FRONT + 300);
    addEnemy(w, 'kodo', FRONT + 500);
    run(w, 240, (i) => ({
      jump: i % 90 === 10,
      down: false,
      stomp: i === 30,
      charge: i === 100,
    }));
    return w;
  }

  it('replays to the same hash, and arrows are part of it', () => {
    const a = scripted();
    expect(hashWorld(a)).toBe(hashWorld(scripted()));
    const b = createWorld(7, { spawning: false });
    run(b, 1, NO_INPUT);
    const before = hashWorld(b);
    b.arrows.push({ id: 99, x: 500 });
    expect(hashWorld(b)).not.toBe(before);
  });
});
