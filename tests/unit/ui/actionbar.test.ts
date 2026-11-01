import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/config';
import { actionBarState, formatCooldown } from '../../../src/render/actionbar';
import { addEnemy, createWorld, stepWorld, type World } from '../../../src/sim/world';
import { run } from '../sim/helpers';

const FRONT = CONFIG.player.homeX + CONFIG.player.hitbox.w / 2;
const STOMP = { jump: false, down: false, stomp: true };
const CHARGE = { jump: false, down: false, charge: true };

const fresh = (): World => createWorld(1, { spawning: false });

describe('cooldown text', () => {
  it('shows whole seconds from 2 s and one rounded-up decimal below', () => {
    expect(formatCooldown(0)).toBe('');
    expect(formatCooldown(-5)).toBe('');
    expect(formatCooldown(10_000)).toBe('10');
    expect(formatCooldown(4_100)).toBe('5');
    expect(formatCooldown(2_000)).toBe('2');
    expect(formatCooldown(1_999)).toBe('2.0');
    expect(formatCooldown(1_250)).toBe('1.3');
    expect(formatCooldown(1)).toBe('0.1');
  });
});

describe('action bar state (SPEC 9.2, 5.2)', () => {
  it('has nothing cooling and Charge tinted when no target exists', () => {
    const s = actionBarState(fresh());
    expect(s.jump).toMatchObject({ remaining: 0, text: '', tint: false, cooling: false });
    expect(s.charge).toMatchObject({
      remaining: 0,
      text: '',
      tint: true,
      lit: false,
      cooling: false,
    });
    expect(s.stomp).toMatchObject({ remaining: 0, tint: false, cooling: false });
  });

  it('lights Charge when a target is in range and tints it once too close or out of range', () => {
    const w = fresh();
    const e = addEnemy(w, 'quilboar', FRONT + 200);
    expect(actionBarState(w).charge).toMatchObject({ lit: true, tint: false });
    e.x = FRONT + CONFIG.charge.maxRange + 10;
    expect(actionBarState(w).charge).toMatchObject({ lit: false, tint: true });
    e.x = FRONT + CONFIG.charge.minRange - 10;
    expect(actionBarState(w).charge).toMatchObject({ lit: false, tint: true });
  });

  it('tints Charge and War Stomp while airborne', () => {
    const w = fresh();
    addEnemy(w, 'quilboar', FRONT + 200);
    run(w, 3, { jump: true, down: false });
    expect(w.player.state).toBe('Airborne');
    const s = actionBarState(w);
    expect(s.charge.tint).toBe(true);
    expect(s.stomp.tint).toBe(true);
    expect(s.jump.tint).toBe(false);
  });

  it('starts the stomp sweep full, shows seconds, and shares the GCD with Charge', () => {
    const w = fresh();
    stepWorld(w, STOMP);
    const s = actionBarState(w);
    expect(s.stomp.remaining).toBeCloseTo(1, 5);
    expect(s.stomp.text).toBe('10');
    expect(s.stomp.cooling).toBe(true);
    // Charge is only on the GCD: a short sweep but no seconds text.
    expect(s.charge.cooling).toBe(true);
    expect(s.charge.text).toBe('');
    expect(s.charge.remaining).toBeCloseTo(1, 5);
  });

  it('empties the sweep as the cooldown elapses and clears after the cooldown ends', () => {
    const w = fresh();
    stepWorld(w, STOMP);
    run(w, Math.round((CONFIG.stomp.cooldownMs / 1000) * CONFIG.simHz) / 2);
    const half = actionBarState(w).stomp.remaining;
    expect(half).toBeGreaterThan(0.45);
    expect(half).toBeLessThan(0.55);
    run(w, (CONFIG.stomp.cooldownMs / 1000) * CONFIG.simHz);
    expect(actionBarState(w).stomp).toMatchObject({ remaining: 0, text: '', cooling: false });
  });

  it('shows the Charge cooldown after a dash', () => {
    const w = fresh();
    addEnemy(w, 'quilboar', FRONT + 200);
    stepWorld(w, CHARGE);
    const s = actionBarState(w);
    expect(s.charge.text).toBe('5');
    expect(s.charge.remaining).toBeGreaterThan(0.95);
  });
});
