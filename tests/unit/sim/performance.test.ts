import { describe, expect, it } from 'vitest';
import { autopilotInput, createAutopilot } from '../../../src/bot/autopilot';
import { scrollObstacles } from '../../../src/sim/entities';
import { updateEnemies } from '../../../src/sim/enemies';
import { updateArrows } from '../../../src/sim/hazards';
import { addObstacle, createWorld, drainEvents, isDead, stepWorld } from '../../../src/sim/world';

/** SPEC 12: steady 60 fps on a mid-range phone, no per-frame allocations in the hot loop. */
describe('performance budgets', () => {
  it('one sim tick costs far less than a frame (mean < 0.1 ms over real play)', () => {
    let ticks = 0;
    let spentMs = 0;
    for (const seed of [1, 2, 3]) {
      const world = createWorld(seed);
      const bot = createAutopilot();
      while (world.rage.distanceRage < 2000 && !isDead(world)) {
        const input = autopilotInput(bot, world);
        const t0 = performance.now();
        stepWorld(world, input);
        spentMs += performance.now() - t0;
        ticks++;
        drainEvents(world);
      }
    }
    expect(ticks).toBeGreaterThan(3000);
    expect(spentMs / ticks).toBeLessThan(0.1);
  });

  it('scrolling and culling reuse their arrays', () => {
    const world = createWorld(1, { spawning: false });
    addObstacle(world, 'thornbush', 100);
    const obstacles = world.obstacles;
    expect(scrollObstacles(obstacles, 1)).toBe(obstacles);
    expect(updateEnemies(world.enemies, 1)).toBe(world.enemies);
    expect(updateArrows(world.arrows, 1)).toBe(world.arrows);
  });

  it('culling removes obstacles that left the screen, in place', () => {
    const world = createWorld(1, { spawning: false });
    addObstacle(world, 'thornbush', -500);
    addObstacle(world, 'thornbush', 300);
    const kept = scrollObstacles(world.obstacles, 1);
    expect(kept).toBe(world.obstacles);
    expect(kept.map((o) => o.x)).toEqual([299]);
  });

  it('an idle frame drains the same empty list without allocating', () => {
    const world = createWorld(1, { spawning: false });
    expect(drainEvents(world)).toBe(drainEvents(world));
    expect(world.events).toHaveLength(0);
    world.events.push({ type: 'PlayerJumped' });
    expect(drainEvents(world)).toHaveLength(1);
    expect(world.events).toHaveLength(0);
  });
});
