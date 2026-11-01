import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/config';
import { advance, createStepper } from '../../../src/sim/loop';
import { NO_INPUT, type SimInput } from '../../../src/sim/player';
import { createRng, nextFloat, nextInt } from '../../../src/sim/rng';
import { createWorld, hashWorld, isDead, stepWorld, type World } from '../../../src/sim/world';

/** Simple look-ahead bot: jumps when the next obstacle is about to arrive. */
function bot(world: World): SimInput {
  const frontX = world.player.x + CONFIG.player.hitbox.w / 2;
  let nearest = Infinity;
  for (const o of world.obstacles) {
    const d = o.x - frontX;
    if (d >= -10 && d < nearest) nearest = d;
  }
  const secs = nearest / world.speed;
  return { jump: secs < 0.32 && secs > -0.2, down: false };
}

/** Plays `ticks` ticks (or until death) and records the input log. */
function play(seed: number, ticks: number, bootInputs?: SimInput[]) {
  const world = createWorld(seed);
  const log: SimInput[] = [];
  const checkpoints: string[] = [];
  for (let i = 0; i < ticks && !isDead(world); i++) {
    const input = bootInputs ? (bootInputs[i] ?? NO_INPUT) : bot(world);
    log.push(input);
    stepWorld(world, input);
    if (i % 200 === 0) checkpoints.push(hashWorld(world));
  }
  return { world, log, checkpoints };
}

describe('determinism (SPEC 14.1)', () => {
  it('same seed + same input log -> identical state hash at every checkpoint', () => {
    const first = play(12345, 4000);
    expect(first.world.tick).toBeGreaterThan(600); // the run actually progressed
    const replay = play(12345, 4000, first.log);
    expect(replay.checkpoints).toEqual(first.checkpoints);
    expect(hashWorld(replay.world)).toBe(hashWorld(first.world));
    expect(replay.world.tick).toBe(first.world.tick);
  });

  it('different seeds diverge', () => {
    const a = play(1, 1200);
    const b = play(2, 1200);
    expect(hashWorld(a.world)).not.toBe(hashWorld(b.world));
  });

  it('different inputs diverge', () => {
    const a = createWorld(9, { spawning: false });
    const b = createWorld(9, { spawning: false });
    stepWorld(a, { jump: true, down: false });
    stepWorld(b, NO_INPUT);
    expect(hashWorld(a)).not.toBe(hashWorld(b));
  });

  it('a fresh world with the same seed hashes identically', () => {
    expect(hashWorld(createWorld(77))).toBe(hashWorld(createWorld(77)));
  });
});

describe('seeded PRNG', () => {
  it('is reproducible and within range', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) {
      const v = nextFloat(a);
      expect(v).toBe(nextFloat(b));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    const r = createRng(1);
    for (let i = 0; i < 100; i++) expect(nextInt(r, 3)).toBeLessThan(3);
  });
});

describe('fixed-step loop (SPEC 4.2)', () => {
  const frameMs = 1000 / 60;

  it('runs exactly one tick per 60 Hz frame', () => {
    const world = createWorld(1, { spawning: false });
    const stepper = createStepper();
    let ticks = 0;
    for (let i = 0; i < 60; i++) ticks += advance(world, stepper, frameMs, NO_INPUT);
    expect(ticks).toBe(60);
    expect(world.tick).toBe(60);
  });

  it('runs two ticks per frame on a 30 Hz display and carries the remainder', () => {
    const world = createWorld(1, { spawning: false });
    const stepper = createStepper();
    let ticks = 0;
    for (let i = 0; i < 30; i++) ticks += advance(world, stepper, 2 * frameMs, NO_INPUT);
    expect(ticks).toBe(60);
    ticks = 0;
    for (let i = 0; i < 10; i++) ticks += advance(world, stepper, 25, NO_INPUT); // 250 ms
    expect(ticks).toBe(15);
  });

  it('clamps a huge frame delta to maxFrameDeltaMs', () => {
    const world = createWorld(1, { spawning: false });
    const ticks = advance(world, createStepper(), 60_000, NO_INPUT);
    expect(ticks).toBe(Math.round((CONFIG.maxFrameDeltaMs * CONFIG.simHz) / 1000));
  });

  it('ignores negative deltas', () => {
    const world = createWorld(1, { spawning: false });
    expect(advance(world, createStepper(), -50, NO_INPUT)).toBe(0);
  });

  it('is deterministic regardless of how wall time is sliced into frames', () => {
    const a = createWorld(3);
    const b = createWorld(3);
    const sa = createStepper();
    const sb = createStepper();
    for (let i = 0; i < 120; i++) advance(a, sa, frameMs, NO_INPUT);
    for (let i = 0; i < 240; i++) advance(b, sb, frameMs / 2, NO_INPUT);
    expect(b.tick).toBe(a.tick);
    expect(hashWorld(b)).toBe(hashWorld(a));
  });
});
