import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/config';
import {
  MAX_PARTICLES,
  MOTE_COUNT,
  SHAKE_MS,
  SHAKE_PX,
  createParticles,
} from '../../../src/render/particles';
import { createMilestoneToast, milestoneText, syncToastElement } from '../../../src/render/toast';
import { addEnemy, createWorld, drainEvents, stepWorld, type World } from '../../../src/sim/world';
import { run } from '../sim/helpers';

const FRONT = CONFIG.player.homeX + CONFIG.player.hitbox.w / 2;
const STOMP = { jump: false, down: false, stomp: true };
const CHARGE = { jump: false, down: false, charge: true };
const fresh = (): World => createWorld(1, { spawning: false });
const active = (p: ReturnType<typeof createParticles>): number =>
  p.pool.filter((x) => x.active).length;

function stomped(): { world: World; events: ReturnType<typeof drainEvents> } {
  const world = fresh();
  stepWorld(world, STOMP);
  return { world, events: drainEvents(world) };
}

describe('screen shake (SPEC 5.2, 10.4)', () => {
  it('shakes at most 4 px for 150 ms after War Stomp, then stops', () => {
    const { world, events } = stomped();
    const p = createParticles(() => false);
    p.handle(events, world);
    let seenOffset = false;
    for (let t = 0; t < SHAKE_MS; t += 10) {
      p.update(10, world);
      expect(Math.abs(p.shakeX)).toBeLessThanOrEqual(SHAKE_PX);
      expect(Math.abs(p.shakeY)).toBeLessThanOrEqual(SHAKE_PX);
      if (p.shakeX !== 0 || p.shakeY !== 0) seenOffset = true;
    }
    expect(seenOffset).toBe(true);
    p.update(10, world);
    expect([p.shakeX, p.shakeY]).toEqual([0, 0]);
  });

  it('never shakes with reduced motion', () => {
    const { world, events } = stomped();
    const p = createParticles(() => true);
    p.handle(events, world);
    for (let t = 0; t < SHAKE_MS; t += 10) {
      p.update(10, world);
      expect([p.shakeX, p.shakeY]).toEqual([0, 0]);
    }
  });

  it('does not shake for a Charge hit', () => {
    const world = fresh();
    addEnemy(world, 'quilboar', FRONT + 200);
    stepWorld(world, CHARGE);
    run(world, 20);
    const p = createParticles(() => false);
    p.handle(drainEvents(world), world);
    p.update(10, world);
    expect([p.shakeX, p.shakeY]).toEqual([0, 0]);
  });
});

describe('particles', () => {
  it('bursts dust on War Stomp, which settles on the ground and dies', () => {
    const { world, events } = stomped();
    const p = createParticles(() => false);
    p.handle(events, world);
    expect(active(p)).toBeGreaterThan(8);
    for (let t = 0; t < 1000; t += 16) {
      p.update(16, world);
      for (const x of p.pool) if (x.active) expect(x.y).toBeLessThanOrEqual(CONFIG.groundY);
    }
    // Only the continuous run dust may remain after the burst has expired.
    expect(active(p)).toBeLessThan(8);
  });

  it('sprays debris on a Charge hit', () => {
    const world = fresh();
    addEnemy(world, 'quilboar', FRONT + 200);
    stepWorld(world, CHARGE);
    run(world, 20);
    const p = createParticles(() => false);
    p.handle(drainEvents(world), world);
    expect(active(p)).toBeGreaterThan(0);
  });

  it('never exceeds the pool and clears on demand', () => {
    const { world, events } = stomped();
    const p = createParticles(() => false);
    for (let i = 0; i < 20; i += 1) p.handle(events, world);
    expect(p.pool).toHaveLength(MAX_PARTICLES);
    expect(active(p)).toBeLessThanOrEqual(MAX_PARTICLES);
    p.clear();
    expect(active(p)).toBe(0);
  });

  it('kicks up small run dust behind the running Tauren', () => {
    const world = fresh();
    const p = createParticles(() => false);
    p.update(16, world);
    expect(active(p)).toBe(1);
    const dust = p.pool.find((x) => x.active)!;
    expect(dust.x).toBeLessThan(world.player.x);
  });

  it('is deterministic for a seed', () => {
    const run1 = createParticles(() => false, 5);
    const run2 = createParticles(() => false, 5);
    const { world, events } = stomped();
    for (const p of [run1, run2]) {
      p.handle(events, world);
      p.update(50, world);
    }
    expect(run1.pool).toEqual(run2.pool);
    expect(run1.motes).toEqual(run2.motes);
  });
});

describe('dust motes (SPEC 4.3)', () => {
  it('drift left slower than the ground, stay on screen and wrap', () => {
    const world = fresh();
    const p = createParticles(() => false);
    expect(p.motes).toHaveLength(MOTE_COUNT);
    const before = p.motes.map((m) => m.x);
    p.update(100, world);
    p.motes.forEach((m, i) => {
      const moved = before[i]! - m.x;
      expect(moved).toBeGreaterThan(0);
      expect(moved).toBeLessThan(world.speed * 0.1);
    });
    for (let t = 0; t < 60_000; t += 100) p.update(100, world);
    for (const m of p.motes) {
      expect(m.x).toBeGreaterThanOrEqual(-m.size);
      expect(m.x).toBeLessThanOrEqual(CONFIG.logicalWidth + m.size);
      expect(m.y).toBeLessThan(CONFIG.groundY);
    }
  });
});

describe('"Ding!" milestone toast (SPEC 8)', () => {
  it('names the level N = Rage / 1000 + 1, capped at 60', () => {
    expect(milestoneText(1)).toBe('Level 2');
    expect(milestoneText(2)).toBe('Level 3');
    expect(milestoneText(59)).toBe('Level 60');
    expect(milestoneText(60)).toBe('Max level reached!');
    expect(milestoneText(75)).toBe('Max level reached!');
  });

  it('fires once per 1,000 Rage and shows for the configured time', () => {
    const t = createMilestoneToast();
    expect(t.observe(999)).toBe(false);
    expect(t.text).toBeNull();
    expect(t.observe(1000)).toBe(true);
    expect(t.text).toBe('Level 2');
    expect(t.observe(1500)).toBe(false);
    t.tick(CONFIG.toast.displayMs - 1);
    expect(t.text).toBe('Level 2');
    t.tick(1);
    expect(t.text).toBeNull();
    expect(t.observe(2000)).toBe(true);
    expect(t.text).toBe('Level 3');
  });

  it('reports only the latest milestone when several are crossed at once', () => {
    const t = createMilestoneToast();
    expect(t.observe(3200)).toBe(true);
    expect(t.text).toBe('Level 4');
    expect(t.observe(3900)).toBe(false);
  });

  it('forgets milestones on reset', () => {
    const t = createMilestoneToast();
    t.observe(2000);
    t.reset();
    expect(t.text).toBeNull();
    expect(t.observe(1000)).toBe(true);
  });

  it('mirrors the text into the DOM and hides it again', () => {
    const el = { hidden: true } as HTMLElement;
    const level = { textContent: '' } as HTMLElement;
    syncToastElement(el, level, 'Level 2');
    expect(el.hidden).toBe(false);
    expect(level.textContent).toBe('Level 2');
    syncToastElement(el, level, null);
    expect(el.hidden).toBe(true);
  });
});
