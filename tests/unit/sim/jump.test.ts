import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/config';
import { NO_INPUT } from '../../../src/sim/player';
import { createWorld, stepWorld } from '../../../src/sim/world';
import { eventCount, heightAboveGround, peakHeight, run } from './helpers';

const newWorld = () => createWorld(1, { spawning: false });
const HOLD = { jump: true, down: false };

/** Tick index (0-based) of the step in which a 3-tick (short hop) jump from tick 0 lands. */
function landingTick(): number {
  const w = newWorld();
  for (let i = 0; i < 120; i++) {
    stepWorld(w, i < 3 ? HOLD : NO_INPUT);
    if (eventCount(w, 'PlayerLanded') > 0) return i;
  }
  throw new Error('never landed');
}

describe('jump physics', () => {
  it('reaches ~140 px at full height (SPEC 5.2)', () => {
    const peak = peakHeight(newWorld(), 60, () => HOLD);
    expect(peak).toBeGreaterThan(136);
    expect(peak).toBeLessThan(144);
    expect(peak).toBeCloseTo(CONFIG.player.jumpVelocity ** 2 / (2 * CONFIG.player.gravity), 0);
  });

  it('releasing early gives a lower short hop', () => {
    const fullPeak = peakHeight(newWorld(), 60, () => HOLD);
    const shortPeak = peakHeight(newWorld(), 60, (i) => (i < 3 ? HOLD : NO_INPUT));
    expect(shortPeak).toBeLessThan(fullPeak * 0.6);
    expect(shortPeak).toBeGreaterThan(0);
  });

  it('a short hop caps upward speed at shortHopVelocity', () => {
    const w = newWorld();
    run(w, 3, HOLD);
    expect(w.player.vy).toBeLessThan(CONFIG.player.shortHopVelocity);
    run(w, 1, NO_INPUT);
    expect(w.player.vy).toBeGreaterThanOrEqual(CONFIG.player.shortHopVelocity);
  });

  it('does not cap when released above the short-hop threshold', () => {
    const w = newWorld();
    // Hold until vy is already above -400 (past ~0.175 s), then release at 20 ticks.
    run(w, 20, HOLD);
    const before = w.player.vy;
    expect(before).toBeGreaterThan(CONFIG.player.shortHopVelocity);
    run(w, 1, NO_INPUT);
    expect(w.player.vy).toBeGreaterThan(before);
  });

  it('lands back on the ground and emits one jump and one landing event', () => {
    const w = newWorld();
    run(w, 60, (i) => (i === 0 ? HOLD : NO_INPUT));
    expect(w.player.state).toBe('Running');
    expect(w.player.feetY).toBe(CONFIG.groundY);
    expect(eventCount(w, 'PlayerJumped')).toBe(1);
    expect(eventCount(w, 'PlayerLanded')).toBe(1);
  });

  it('cannot jump again in mid-air', () => {
    const w = newWorld();
    run(w, 10, (i) => (i < 4 ? HOLD : i < 6 ? NO_INPUT : HOLD));
    expect(w.player.state).toBe('Airborne');
    expect(eventCount(w, 'PlayerJumped')).toBe(1);
  });

  it('holding the key through a landing does not auto-jump again', () => {
    const w = newWorld();
    run(w, 90, HOLD);
    expect(eventCount(w, 'PlayerJumped')).toBe(1);
    expect(w.player.state).toBe('Running');
  });

  it('fast-fall (Down) lands sooner', () => {
    const land = (down: boolean): number => {
      const w = newWorld();
      for (let i = 0; i < 120; i++) {
        stepWorld(w, { jump: i < 3, down: down && i >= 10 });
        if (eventCount(w, 'PlayerLanded') > 0) return i;
      }
      throw new Error('never landed');
    };
    expect(land(true)).toBeLessThan(land(false));
  });

  it('fast-fall only applies while airborne', () => {
    const w = newWorld();
    run(w, 10, { jump: false, down: true });
    expect(w.player.feetY).toBe(CONFIG.groundY);
    expect(w.player.state).toBe('Running');
  });
});

describe('jump buffer', () => {
  const tickMs = 1000 / CONFIG.simHz;

  it('a press shortly before landing jumps on landing', () => {
    const landing = landingTick();
    const press = landing - Math.floor((CONFIG.player.jumpBufferMs - tickMs) / tickMs) + 1; // well inside the window
    const w = newWorld();
    run(w, landing + 10, (i) => {
      if (i < 3) return HOLD;
      return i >= press ? HOLD : NO_INPUT;
    });
    expect(eventCount(w, 'PlayerJumped')).toBe(2);
  });

  it('a press well before landing is forgotten', () => {
    const landing = landingTick();
    const press = landing - Math.ceil((CONFIG.player.jumpBufferMs * 2) / tickMs);
    const w = newWorld();
    run(w, landing + 10, (i) => {
      if (i < 3) return HOLD;
      return i >= press ? HOLD : NO_INPUT;
    });
    expect(eventCount(w, 'PlayerJumped')).toBe(1);
  });
});

describe('coyote time', () => {
  /** Player just left the ground without jumping, 20 px above it. */
  function walkedOff() {
    const w = newWorld();
    w.player.state = 'Airborne';
    w.player.feetY = CONFIG.groundY - 20;
    w.player.coyoteMs = CONFIG.player.coyoteMs;
    return w;
  }

  it('allows a jump inside the coyote window', () => {
    const w = walkedOff();
    run(w, 3, (i) => (i === 2 ? HOLD : NO_INPUT));
    expect(eventCount(w, 'PlayerJumped')).toBe(1);
  });

  it('refuses a jump after the window has closed', () => {
    const w = walkedOff();
    const lateTick = Math.ceil(CONFIG.player.coyoteMs / (1000 / CONFIG.simHz)) + 1;
    run(w, lateTick + 1, (i) => (i === lateTick ? HOLD : NO_INPUT));
    expect(w.player.state).toBe('Airborne');
    expect(eventCount(w, 'PlayerJumped')).toBe(0);
    expect(heightAboveGround(w)).toBeLessThan(20);
  });
});
