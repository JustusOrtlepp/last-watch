import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/config';
import { OBSTACLES, OBSTACLE_KINDS } from '../../../src/content/entities';
import { overlaps } from '../../../src/sim/collision';
import { obstacleBox } from '../../../src/sim/entities';
import { NO_INPUT, playerBox } from '../../../src/sim/player';
import { totalRage } from '../../../src/sim/rage';
import {
  addObstacle,
  createWorld,
  drainEvents,
  hashWorld,
  isDead,
  score,
  speedAtTick,
  stepWorld,
} from '../../../src/sim/world';
import { eventCount, run } from './helpers';

const HOLD = { jump: true, down: false };
const newWorld = () => createWorld(7, { spawning: false });

/** World whose speed has already hit the cap. */
function maxSpeedWorld() {
  const w = newWorld();
  w.tick = CONFIG.speed.max * CONFIG.simHz; // far beyond the ramp
  return w;
}

describe('speed ramp (SPEC 7.1)', () => {
  it('starts at 360, gains 6 px/s per second, caps at 900', () => {
    expect(speedAtTick(0)).toBe(CONFIG.speed.start);
    expect(speedAtTick(CONFIG.simHz)).toBeCloseTo(CONFIG.speed.start + CONFIG.speed.accelPerSec, 9);
    expect(speedAtTick(10 * CONFIG.simHz)).toBeCloseTo(
      CONFIG.speed.start + 10 * CONFIG.speed.accelPerSec,
      9,
    );
    expect(speedAtTick(1e7)).toBe(CONFIG.speed.max);
  });

  it('is applied by the world each tick', () => {
    const w = newWorld();
    run(w, 600);
    expect(w.speed).toBeCloseTo(speedAtTick(599), 9);
    expect(w.speed).toBeGreaterThan(CONFIG.speed.start);
  });

  it('reaches the cap after (max - start) / accel seconds', () => {
    const secs = (CONFIG.speed.max - CONFIG.speed.start) / CONFIG.speed.accelPerSec;
    expect(speedAtTick(Math.ceil(secs * CONFIG.simHz))).toBe(CONFIG.speed.max);
    expect(speedAtTick(Math.floor(secs * CONFIG.simHz) - 1)).toBeLessThan(CONFIG.speed.max);
  });
});

describe('continuous Rage (SPEC 5.3)', () => {
  it('accrues 1 Rage per 10 px (~36 per second at start speed)', () => {
    const w = newWorld();
    run(w, CONFIG.simHz);
    expect(w.rage.distanceRage).toBeGreaterThan(35.9);
    expect(w.rage.distanceRage).toBeLessThan(36.5);
  });

  it('equals the distance travelled divided by pxPerRage', () => {
    const w = newWorld();
    let px = 0;
    for (let i = 0; i < 500; i++) {
      stepWorld(w, NO_INPUT);
      px += w.speed / CONFIG.simHz;
    }
    expect(w.rage.distanceRage).toBeCloseTo(px / CONFIG.rage.pxPerRage, 6);
  });

  it('never decreases, and the score is distance + combat components', () => {
    const w = newWorld();
    let last = 0;
    for (let i = 0; i < 1200; i++) {
      stepWorld(w, { jump: i % 90 < 20, down: i % 7 === 0 });
      expect(w.rage.distanceRage).toBeGreaterThanOrEqual(last);
      last = w.rage.distanceRage;
    }
    expect(w.rage.combatRage).toBe(0);
    expect(score(w)).toBe(Math.floor(w.rage.distanceRage + w.rage.combatRage));
    expect(totalRage({ distanceRage: 10.6, combatRage: 5 })).toBe(15);
  });

  it('accrues faster at higher speed', () => {
    const slow = newWorld();
    const fast = maxSpeedWorld();
    run(slow, 60);
    run(fast, 60);
    expect(fast.rage.distanceRage).toBeGreaterThan(slow.rage.distanceRage * 2);
  });

  it('stops when the player is dead', () => {
    const w = newWorld();
    addObstacle(w, 'boulder', CONFIG.player.homeX + 100);
    run(w, 200);
    expect(isDead(w)).toBe(true);
    const frozen = w.rage.distanceRage;
    run(w, 60);
    expect(w.rage.distanceRage).toBe(frozen);
  });
});

describe('collision', () => {
  it('touching boxes do not overlap, intersecting ones do', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(overlaps(a, { x: 10, y: 0, w: 5, h: 5 })).toBe(false);
    expect(overlaps(a, { x: 0, y: 10, w: 5, h: 5 })).toBe(false);
    expect(overlaps(a, { x: 9.9, y: 9.9, w: 5, h: 5 })).toBe(true);
  });

  it('uses the SPEC hitboxes (player 40 x 52, obstacles per SPEC 6.1)', () => {
    const w = newWorld();
    const box = playerBox(w.player);
    expect(box).toEqual({ x: 100, y: CONFIG.groundY - 52, w: 40, h: 52 });
    expect(OBSTACLES).toEqual({
      thornbush: { w: 24, h: 28 },
      boulder: { w: 40, h: 36 },
      totem: { w: 22, h: 56 },
    });
    const o = addObstacle(w, 'totem', 300);
    expect(obstacleBox(o)).toEqual({ x: 300, y: CONFIG.groundY - 56, w: 22, h: 56 });
  });

  it.each(OBSTACLE_KINDS)('a %s kills a player who does not jump', (kind) => {
    const w = newWorld();
    addObstacle(w, kind, 400);
    run(w, 120);
    expect(isDead(w)).toBe(true);
    expect(w.player.state).toBe('Dead');
    const died = drainEvents(w).filter((e) => e.type === 'PlayerDied');
    expect(died).toEqual([{ type: 'PlayerDied', cause: kind }]);
  });

  it('a dead world no longer advances', () => {
    const w = newWorld();
    addObstacle(w, 'boulder', 200);
    run(w, 120);
    expect(isDead(w)).toBe(true);
    const tick = w.tick;
    const hash = hashWorld(w);
    run(w, 30, HOLD);
    expect(w.tick).toBe(tick);
    expect(hashWorld(w)).toBe(hash);
  });

  it('removes obstacles that scrolled off the left edge', () => {
    const w = newWorld();
    addObstacle(w, 'thornbush', -23);
    run(w, 1);
    expect(w.obstacles).toHaveLength(0);
  });

  describe.each([
    ['start speed', () => newWorld()],
    ['max speed', () => maxSpeedWorld()],
  ])('every static obstacle is jumpable at %s', (_label, make) => {
    it.each(OBSTACLE_KINDS)('%s', (kind) => {
      // Brute-force the best-case jump timing: some press tick must clear the obstacle.
      let survivors = 0;
      for (let press = 0; press < 90; press++) {
        const w = make();
        addObstacle(w, kind, 500);
        run(w, 120, (i) => (i === press ? HOLD : i > press && i < press + 90 ? HOLD : NO_INPUT));
        if (!isDead(w)) survivors++;
      }
      expect(survivors).toBeGreaterThan(0);
    });
  });

  it('a jump that is too early or too late dies', () => {
    const w = newWorld();
    addObstacle(w, 'totem', 300);
    run(w, 120, (i) => (i === 0 ? HOLD : NO_INPUT)); // short, immediate hop: lands before the totem arrives
    expect(eventCount(w, 'PlayerDied')).toBe(1);
  });
});
