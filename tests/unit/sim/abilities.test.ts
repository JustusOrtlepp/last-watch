import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/config';
import { ENEMIES, type EnemyKind } from '../../../src/content/entities';
import { ABILITY_ERROR_TEXT, checkCharge } from '../../../src/sim/abilities';
import { createEnemy, updateEnemies } from '../../../src/sim/enemies';
import type { AbilityErrorReason, SimEvent } from '../../../src/sim/events';
import { NO_INPUT, type SimInput } from '../../../src/sim/player';
import {
  addEnemy,
  addObstacle,
  createWorld,
  hashWorld,
  isDead,
  stepWorld,
  type World,
} from '../../../src/sim/world';
import { eventCount, run } from './helpers';

const CHARGE: SimInput = { jump: false, down: false, charge: true };
const STOMP: SimInput = { jump: false, down: false, stomp: true };
const JUMP: SimInput = { jump: true, down: false };

const FRONT = CONFIG.player.homeX + CONFIG.player.hitbox.w / 2;
const TICK_MS = 1000 / CONFIG.simHz;
const ticksOf = (ms: number): number => Math.round(ms / TICK_MS);

function fresh(): World {
  return createWorld(1, { spawning: false });
}

/** Places an enemy whose back edge is `distance` px ahead of the player's front edge. */
function ahead(w: World, kind: EnemyKind, distance: number) {
  return addEnemy(w, kind, FRONT + distance);
}

function errors(w: World): AbilityErrorReason[] {
  return w.events.flatMap((e: SimEvent) => (e.type === 'AbilityError' ? [e.reason] : []));
}

/** Presses Charge for one tick, then releases it (so the next press is a new edge). */
function tapCharge(w: World): void {
  stepWorld(w, CHARGE);
}

describe('War Stomp (SPEC 5.2, 6.3)', () => {
  it('stuns enemies inside the radius for 2.0 s, awards +5 Rage each, ignores the rest', () => {
    const w = fresh();
    const near = ahead(w, 'quilboar', 130); // x = 270, nearest point 150 px away
    const far = ahead(w, 'quilboar', 170); // x = 310, nearest point 190 px away
    const mid = addEnemy(w, 'harpyMid', 200);
    const high = addEnemy(w, 'harpyHigh', 200);
    stepWorld(w, STOMP);

    expect(near.stunMs).toBeGreaterThan(0);
    expect(mid.stunMs).toBeGreaterThan(0);
    expect(far.stunMs).toBe(0);
    expect(high.stunMs).toBe(0); // out of reach (SPEC 6.2)
    expect(w.rage.combatRage).toBe(2 * CONFIG.rage.stompPerTarget);
    expect(eventCount(w, 'EnemyStunned')).toBe(2);
    const used = w.events.find((e) => e.type === 'StompUsed');
    expect(used).toMatchObject({ stunned: 2 });
  });

  it('is usable with no enemies around (uses cooldown and GCD, no error)', () => {
    const w = fresh();
    stepWorld(w, STOMP);
    expect(w.player.state).toBe('Stomping');
    expect(errors(w)).toEqual([]);
    expect(w.abilities.stompCdMs).toBeGreaterThan(0);
    expect(w.abilities.gcdMs).toBeGreaterThan(0);
  });

  it('stun lasts exactly stunMs of ticks', () => {
    // Observed on a standalone enemy: at 360+ px/s the ground scroll carries it off-screen first.
    const e = createEnemy(1, 'centaur', 400);
    e.stunMs = CONFIG.stomp.stunMs;
    let list = [e];
    const stunTicks = ticksOf(CONFIG.stomp.stunMs);
    for (let i = 0; i < stunTicks - 1; i++) list = updateEnemies(list, 0);
    expect(e.stunMs).toBeGreaterThan(0);
    list = updateEnemies(list, 0);
    expect(e.stunMs).toBe(0);
    const x = e.x;
    updateEnemies(list, 0);
    expect(e.x).toBe(x); // the centaur stands still (own speed 0)
    const q = createEnemy(2, 'quilboar', 400);
    updateEnemies([q], 0);
    expect(q.x).toBeLessThan(400); // an unstunned quilboar resumes walking
  });

  it('a stunned enemy moves only with the ground; an unstunned one walks on', () => {
    const w = fresh();
    const stunned = ahead(w, 'quilboar', 100);
    stepWorld(w, STOMP);
    const x0 = stunned.x;
    run(w, 1);
    expect(x0 - stunned.x).toBeCloseTo(w.speed / CONFIG.simHz, 6);

    const w2 = fresh();
    const walker = ahead(w2, 'quilboar', 100);
    const y0 = walker.x;
    run(w2, 1);
    expect(y0 - walker.x).toBeCloseTo((w2.speed + ENEMIES.quilboar.speed) / CONFIG.simHz, 6);
  });

  it('stunned enemies are harmless; unstunned ones are lethal', () => {
    const lethal = fresh();
    addEnemy(lethal, 'quilboar', 100);
    run(lethal, 1);
    expect(isDead(lethal)).toBe(true);
    expect(lethal.events.some((e) => e.type === 'PlayerDied' && e.cause === 'quilboar')).toBe(true);

    const safe = fresh();
    addEnemy(safe, 'quilboar', 100);
    stepWorld(safe, STOMP);
    run(safe, 10);
    expect(isDead(safe)).toBe(false);
  });

  it('locks jumping for lockMs, but a buffered press fires when the lock ends', () => {
    const lockTicks = ticksOf(CONFIG.stomp.lockMs);
    const early = fresh();
    stepWorld(early, STOMP);
    stepWorld(early, JUMP); // buffer expires (100 ms) before the 150 ms lock ends
    run(early, lockTicks + 2, JUMP);
    expect(early.player.state).not.toBe('Airborne');

    const late = fresh();
    stepWorld(late, STOMP);
    run(late, 4);
    stepWorld(late, JUMP); // tick 5: still buffered when the lock ends at tick 9
    expect(late.player.state).toBe('Stomping');
    run(late, 3, JUMP);
    expect(late.player.state).toBe('Stomping');
    run(late, 1, JUMP);
    expect(late.player.state).toBe('Airborne');
  });

  it('cooldown is 10 s: not ready one tick early, ready on time', () => {
    const cd = ticksOf(CONFIG.stomp.cooldownMs);
    const early = fresh();
    stepWorld(early, STOMP);
    run(early, cd - 2);
    early.events = [];
    stepWorld(early, STOMP);
    expect(errors(early)).toEqual(['NotReady']);

    const onTime = fresh();
    stepWorld(onTime, STOMP);
    run(onTime, cd - 1);
    onTime.events = [];
    stepWorld(onTime, STOMP);
    expect(errors(onTime)).toEqual([]);
    expect(eventCount(onTime, 'StompUsed')).toBe(1);
  });

  it('holding the key does not re-trigger when the cooldown ends', () => {
    const w = fresh();
    run(w, ticksOf(CONFIG.stomp.cooldownMs) + 60, STOMP);
    expect(eventCount(w, 'StompUsed')).toBe(1);
  });

  it('is silently ignored while airborne (no cooldown spent)', () => {
    const w = fresh();
    stepWorld(w, JUMP);
    run(w, 5, JUMP);
    expect(w.player.state).toBe('Airborne');
    w.events = [];
    stepWorld(w, { ...STOMP, jump: true });
    expect(w.player.state).toBe('Airborne');
    expect(w.events.filter((e) => e.type !== 'PlayerLanded')).toEqual([]);
    expect(w.abilities.stompCdMs).toBe(0);
  });
});

describe('Charge (SPEC 5.2)', () => {
  it('targets the nearest valid enemy in [60, 420]', () => {
    const w = fresh();
    ahead(w, 'quilboar', 300);
    const nearest = ahead(w, 'plainstrider', 150);
    ahead(w, 'centaur', 5); // too close, ignored while a valid target exists
    const check = checkCharge(w.player, w.enemies);
    expect(check.ok && check.target.id).toBe(nearest.id);
  });

  it('dashes for dashMs, defeats the target and awards 25 + kill Rage', () => {
    const w = fresh();
    const target = ahead(w, 'quilboar', 200);
    tapCharge(w);
    expect(w.player.state).toBe('Charging');
    expect(eventCount(w, 'ChargeStarted')).toBe(1);

    let ticks = 1;
    let prevX = w.player.x;
    while (w.player.state === 'Charging') {
      stepWorld(w, NO_INPUT);
      expect(w.player.x).toBeGreaterThanOrEqual(prevX);
      prevX = w.player.x;
      ticks++;
    }
    const dash = CONFIG.charge.dashMs / TICK_MS;
    expect(ticks).toBeGreaterThanOrEqual(Math.floor(dash));
    expect(ticks).toBeLessThanOrEqual(Math.ceil(dash) + 1);

    expect(target.defeated).toBe(true);
    expect(w.rage.combatRage).toBe(CONFIG.rage.chargeHit + ENEMIES.quilboar.chargeKillRage);
    expect(w.player.x).toBeCloseTo(target.x - CONFIG.player.hitbox.w / 2, 6);
    expect(w.player.state).toBe('Recovering');
    expect(isDead(w)).toBe(false);
    expect(eventCount(w, 'ChargeHit')).toBe(1);
    expect(eventCount(w, 'EnemyDefeated')).toBe(1);
  });

  it.each<EnemyKind>(['quilboar', 'plainstrider', 'harpyLow', 'harpyMid', 'centaur'])(
    'awards the SPEC 6.4 kill Rage for %s',
    (kind) => {
      const w = fresh();
      ahead(w, kind, 200);
      tapCharge(w);
      run(w, ticksOf(CONFIG.charge.dashMs) + 2);
      expect(w.rage.combatRage).toBe(CONFIG.rage.chargeHit + ENEMIES[kind].chargeKillRage);
    },
  );

  it('is invulnerable during the dash and passes through anything between', () => {
    const w = fresh();
    addObstacle(w, 'totem', FRONT + 20);
    ahead(w, 'quilboar', 100); // unstunned blocker in the way
    ahead(w, 'plainstrider', 250);
    const check = checkCharge(w.player, w.enemies);
    expect(check.ok && check.target.kind).toBe('quilboar'); // nearest is the blocker
    tapCharge(w);
    run(w, 3);
    expect(w.player.state).toBe('Charging');
    expect(isDead(w)).toBe(false);

    // The same totem kills a player that does not charge.
    const control = fresh();
    addObstacle(control, 'totem', FRONT + 20);
    run(control, 10);
    expect(isDead(control)).toBe(true);
  });

  it('normal collision applies again after the dash', () => {
    const w = fresh();
    ahead(w, 'quilboar', 200);
    tapCharge(w);
    run(w, ticksOf(CONFIG.charge.dashMs) + 2);
    expect(w.player.state).toBe('Recovering');
    addObstacle(w, 'boulder', w.player.x);
    run(w, 1);
    expect(isDead(w)).toBe(true);
  });

  it('recovers toward the home x at recoverSpeed, then runs normally', () => {
    const w = fresh();
    ahead(w, 'quilboar', 300);
    tapCharge(w);
    while (w.player.state === 'Charging') stepWorld(w, NO_INPUT);
    const x0 = w.player.x;
    expect(x0).toBeGreaterThan(CONFIG.player.homeX);
    expect(x0).toBeLessThanOrEqual(CONFIG.player.maxX);
    run(w, 1);
    expect(x0 - w.player.x).toBeCloseTo(CONFIG.player.recoverSpeed / CONFIG.simHz, 6);
    run(w, Math.ceil(((x0 - CONFIG.player.homeX) / CONFIG.player.recoverSpeed) * CONFIG.simHz));
    expect(w.player.x).toBe(CONFIG.player.homeX);
    expect(w.player.state).toBe('Running');
  });

  it('never moves the player past maxX for any valid range and speed', () => {
    for (const tick of [0, 3000, 9000]) {
      for (
        let distance = CONFIG.charge.minRange;
        distance <= CONFIG.charge.maxRange;
        distance += 40
      ) {
        for (const kind of ['quilboar', 'centaur'] as const) {
          const w = fresh();
          w.tick = tick;
          ahead(w, kind, distance);
          tapCharge(w);
          while (w.player.state === 'Charging') {
            stepWorld(w, NO_INPUT);
            expect(w.player.x).toBeLessThanOrEqual(CONFIG.player.maxX);
          }
        }
      }
    }
  });

  it('may jump and cast while recovering; the drift continues in the air', () => {
    const w = fresh();
    ahead(w, 'quilboar', 400);
    tapCharge(w);
    while (w.player.state === 'Charging') stepWorld(w, NO_INPUT);
    expect(w.player.state).toBe('Recovering');
    const x0 = w.player.x;
    stepWorld(w, JUMP);
    expect(w.player.state).toBe('Airborne');
    expect(w.player.x).toBeLessThan(x0);
    run(w, 80);
    expect(w.player.state).toBe('Recovering'); // landed, still left of the home x
    expect(w.player.x).toBeGreaterThan(CONFIG.player.homeX);
    run(w, 200);
    expect(w.player.state).toBe('Running');
  });

  it('a held jump press during the dash fires after it ends', () => {
    const w = fresh();
    ahead(w, 'quilboar', 200);
    tapCharge(w);
    run(w, 8);
    stepWorld(w, JUMP); // within 100 ms of the dash end
    expect(w.player.state).toBe('Charging');
    run(w, 3, JUMP);
    expect(w.player.state).toBe('Airborne');
  });
});

describe('ability errors (SPEC 5.2)', () => {
  it('nothing in range -> "Out of range." and nothing is spent', () => {
    const w = fresh();
    tapCharge(w);
    expect(errors(w)).toEqual(['OutOfRange']);
    expect(ABILITY_ERROR_TEXT.OutOfRange).toBe('Out of range.');
    expect(w.abilities.chargeCdMs).toBe(0);
    expect(w.abilities.gcdMs).toBe(0);
    expect(w.player.state).toBe('Running');

    const far = fresh();
    ahead(far, 'quilboar', CONFIG.charge.maxRange + 40);
    tapCharge(far);
    expect(errors(far)).toEqual(['OutOfRange']);
  });

  it('range limits are inclusive-ish: 59 px is too close, 60 px is valid, 420 px is valid', () => {
    const tooClose = fresh();
    ahead(tooClose, 'quilboar', CONFIG.charge.minRange - 1);
    tapCharge(tooClose);
    expect(errors(tooClose)).toEqual(['TooClose']);
    expect(ABILITY_ERROR_TEXT.TooClose).toBe('Target too close.');

    for (const distance of [CONFIG.charge.minRange, CONFIG.charge.maxRange]) {
      const w = fresh();
      ahead(w, 'quilboar', distance);
      tapCharge(w);
      expect(errors(w)).toEqual([]);
      expect(w.player.state).toBe('Charging');
    }
  });

  it('only immune targets (Kodo) -> "Immune."', () => {
    const w = fresh();
    ahead(w, 'kodo', 200);
    tapCharge(w);
    expect(errors(w)).toEqual(['Immune']);
    expect(ABILITY_ERROR_TEXT.Immune).toBe('Immune.');
    expect(w.abilities.chargeCdMs).toBe(0);
  });

  it('charges a valid target standing behind a Kodo', () => {
    const w = fresh();
    ahead(w, 'kodo', 100);
    const quilboar = ahead(w, 'quilboar', 300);
    tapCharge(w);
    expect(errors(w)).toEqual([]);
    expect(w.player.dashTargetId).toBe(quilboar.id);
  });

  it('a high harpy cannot be charged (out of reach)', () => {
    const w = fresh();
    ahead(w, 'harpyHigh', 200);
    tapCharge(w);
    expect(errors(w)).toEqual(['OutOfRange']);
  });

  it('enemies behind the player are not targets', () => {
    const w = fresh();
    addEnemy(w, 'quilboar', 20);
    tapCharge(w);
    expect(errors(w)).toEqual(['OutOfRange']);
  });

  it('GCD (0.5 s) is shared: Stomp right after Charge is "not ready"', () => {
    const gcd = ticksOf(CONFIG.gcdMs);
    for (const [wait, expectedErrors] of [
      [gcd - 2, ['NotReady']],
      [gcd - 1, []],
    ] as const) {
      const w = fresh();
      ahead(w, 'quilboar', 200);
      tapCharge(w);
      run(w, wait);
      w.events = [];
      stepWorld(w, STOMP);
      expect(errors(w)).toEqual(expectedErrors);
    }
    expect(ABILITY_ERROR_TEXT.NotReady).toBe('Ability is not ready yet.');
  });

  it('GCD also blocks Charge after Stomp, and Stomp after Charge does not use its cooldown', () => {
    const w = fresh();
    stepWorld(w, STOMP);
    run(w, 5);
    ahead(w, 'quilboar', 200);
    w.events = [];
    tapCharge(w);
    expect(errors(w)).toEqual(['NotReady']);
    expect(w.abilities.chargeCdMs).toBe(0);
    expect(w.player.state).not.toBe('Charging');

    const w2 = fresh();
    ahead(w2, 'quilboar', 200);
    tapCharge(w2);
    run(w2, 5);
    w2.events = [];
    stepWorld(w2, STOMP);
    expect(w2.abilities.stompCdMs).toBe(0);
  });

  it('Charge cooldown is 5 s', () => {
    const cd = ticksOf(CONFIG.charge.cooldownMs);
    for (const [wait, expectedErrors] of [
      [cd - 2, ['NotReady']],
      [cd - 1, []],
    ] as const) {
      const w = fresh();
      ahead(w, 'quilboar', 200);
      tapCharge(w);
      run(w, wait);
      ahead(w, 'quilboar', 200);
      w.events = [];
      tapCharge(w);
      expect(errors(w)).toEqual(expectedErrors);
    }
  });

  it('is silently ignored while airborne', () => {
    const w = fresh();
    stepWorld(w, JUMP);
    run(w, 5, JUMP);
    ahead(w, 'quilboar', 200);
    w.events = [];
    stepWorld(w, { ...CHARGE, jump: true });
    expect(w.player.state).toBe('Airborne');
    expect(errors(w)).toEqual([]);
    expect(w.abilities.chargeCdMs).toBe(0);
  });

  it('identical errors are throttled to 1 per 0.5 s; other errors are not', () => {
    const throttle = ticksOf(CONFIG.errors.throttleMs);
    const w = fresh();
    let count = 0;
    const press = (): void => {
      w.events = [];
      tapCharge(w);
      count += errors(w).length;
      stepWorld(w, NO_INPUT); // release
    };
    press(); // tick 0 -> emitted
    run(w, 8);
    press(); // within the window -> suppressed
    expect(count).toBe(1);
    run(w, throttle - w.tick);
    press(); // window over -> emitted again
    expect(count).toBe(2);

    w.events = [];
    ahead(w, 'quilboar', 20);
    tapCharge(w); // different reason (TooClose) is not throttled
    expect(errors(w)).toEqual(['TooClose']);
  });
});

describe('Rage surges (SPEC 5.3)', () => {
  it('only ever increases and distance Rage is untouched by combat', () => {
    const base = fresh();
    const w = fresh();
    ahead(w, 'quilboar', 200);
    let prev = 0;
    for (let i = 0; i < 400; i++) {
      stepWorld(base, NO_INPUT);
      stepWorld(w, i === 0 ? CHARGE : i === 40 ? STOMP : NO_INPUT);
      const total = w.rage.distanceRage + w.rage.combatRage;
      expect(total).toBeGreaterThanOrEqual(prev);
      prev = total;
    }
    expect(isDead(w)).toBe(false);
    expect(w.rage.combatRage).toBe(CONFIG.rage.chargeHit + ENEMIES.quilboar.chargeKillRage);
    expect(w.rage.distanceRage).toBeCloseTo(base.rage.distanceRage, 9);
  });

  it('surge events carry the amount and source for floating text', () => {
    const w = fresh();
    ahead(w, 'quilboar', 200);
    tapCharge(w);
    run(w, ticksOf(CONFIG.charge.dashMs) + 2);
    const surges = w.events.flatMap((e) => (e.type === 'RageSurge' ? [e] : []));
    expect(surges.map((s) => [s.source, s.amount])).toEqual([
      ['chargeHit', CONFIG.rage.chargeHit],
      ['kill', ENEMIES.quilboar.chargeKillRage],
    ]);
  });
});

describe('determinism with abilities (SPEC 14.1)', () => {
  const script = (tick: number): SimInput => ({
    jump: tick % 97 < 12,
    down: false,
    charge: tick % 130 === 20,
    stomp: tick % 210 === 100,
  });

  function play(seed: number): World {
    const w = createWorld(seed);
    for (let i = 0; i < 1500 && !isDead(w); i++) {
      if (i % 150 === 10) ahead(w, i % 300 === 10 ? 'quilboar' : 'centaur', 300);
      stepWorld(w, script(i));
    }
    return w;
  }

  it('same seed and inputs -> identical hash and events', () => {
    const a = play(5);
    const b = play(5);
    expect(a.tick).toBeGreaterThan(30);
    expect(hashWorld(a)).toBe(hashWorld(b));
    expect(a.events).toEqual(b.events);
  });

  it('an extra ability press changes the hash', () => {
    const a = fresh();
    const b = fresh();
    run(a, 30);
    run(b, 30);
    expect(hashWorld(a)).toBe(hashWorld(b));
    stepWorld(a, STOMP);
    stepWorld(b, NO_INPUT);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });
});
