import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/config';
import {
  enemyFrame,
  chargeFrameIndex,
  playerFrame,
  stompFrameIndex,
} from '../../../src/render/animation';
import {
  FCT_LIFETIME_MS,
  FCT_RISE_PX,
  createEffects,
  effectFrame,
  fctLook,
} from '../../../src/render/effects';
import { createErrorMessage } from '../../../src/render/hud';
import { layoutAtlas } from '../../../src/render/sprites';
import { SHEETS } from '../../../src/render/art/sprites';
import { ENEMY_KINDS } from '../../../src/content/entities';
import type { SimEvent } from '../../../src/sim/events';
import { addEnemy, createWorld, drainEvents, stepWorld, type World } from '../../../src/sim/world';
import { run } from '../sim/helpers';

const FRONT = CONFIG.player.homeX + CONFIG.player.hitbox.w / 2;
const STOMP = { jump: false, down: false, stomp: true };
const CHARGE = { jump: false, down: false, charge: true };
const fresh = (): World => createWorld(1, { spawning: false });

describe('error message (SPEC 5.2)', () => {
  it('shows for 1.2 s, one at a time, and a new message restarts the timer', () => {
    const m = createErrorMessage();
    expect(m.text).toBeNull();
    m.show('Out of range.');
    m.tick(CONFIG.errors.displayMs - 1);
    expect(m.text).toBe('Out of range.');
    m.show('Immune.');
    expect(m.text).toBe('Immune.');
    m.tick(CONFIG.errors.displayMs - 1);
    expect(m.text).toBe('Immune.');
    m.tick(1);
    expect(m.text).toBeNull();
  });

  it('clears on demand', () => {
    const m = createErrorMessage();
    m.show('Target too close.');
    m.clear();
    expect(m.text).toBeNull();
  });
});

describe('floating combat text', () => {
  it('rises over 0.8 s while fading out', () => {
    expect(fctLook(0)).toEqual({ alpha: 1, rise: 0 });
    expect(fctLook(FCT_LIFETIME_MS / 2).rise).toBeCloseTo(FCT_RISE_PX / 2);
    expect(fctLook(FCT_LIFETIME_MS / 2).alpha).toBeCloseTo(0.5);
    expect(fctLook(FCT_LIFETIME_MS)).toEqual({ alpha: 0, rise: FCT_RISE_PX });
  });

  it('shows "Stunned" and "+5 Rage" per enemy caught by War Stomp', () => {
    const w = fresh();
    addEnemy(w, 'quilboar', FRONT + 80);
    addEnemy(w, 'plainstrider', FRONT + 120);
    stepWorld(w, STOMP);
    const fx = createEffects();
    fx.handle(drainEvents(w), w);
    const texts = fx.text.map((t) => t.text).sort();
    expect(texts).toEqual(['+5 Rage', '+5 Rage', 'Stunned', 'Stunned']);
    expect(fx.sprites.map((s) => s.sheetId)).toEqual(['shockwave']);
  });

  it('sums a Charge hit and the kill into one "+75 Rage" and adds a hit spark', () => {
    const w = fresh();
    addEnemy(w, 'quilboar', FRONT + 200);
    stepWorld(w, CHARGE);
    run(w, 20);
    const events = drainEvents(w);
    const fx = createEffects();
    fx.handle(events, w);
    expect(fx.text.map((t) => t.text)).toEqual(['+75 Rage']);
    expect(fx.sprites.map((s) => s.sheetId)).toEqual(['hit-spark']);
  });

  it('shows "Immune" above the Kodo when Charge is refused', () => {
    const w = fresh();
    addEnemy(w, 'kodo', FRONT + 200);
    stepWorld(w, CHARGE);
    const fx = createEffects();
    fx.handle(drainEvents(w), w);
    expect(fx.text.map((t) => t.text)).toEqual(['Immune']);
  });

  it('ignores errors that have no on-screen subject and unrelated events', () => {
    const w = fresh();
    const fx = createEffects();
    const events: SimEvent[] = [
      { type: 'AbilityError', reason: 'OutOfRange' },
      { type: 'PlayerJumped' },
    ];
    fx.handle(events, w);
    expect(fx.text).toEqual([]);
    expect(fx.sprites).toEqual([]);
  });

  it('expires after 0.8 s and drifts left with the ground', () => {
    const w = fresh();
    addEnemy(w, 'quilboar', FRONT + 80);
    stepWorld(w, STOMP);
    const fx = createEffects();
    fx.handle(drainEvents(w), w);
    const x0 = fx.text[0]!.x;
    fx.update(100, w);
    expect(fx.text[0]!.x).toBeCloseTo(x0 - (w.speed * 100) / 1000);
    fx.update(FCT_LIFETIME_MS, w);
    expect(fx.text).toEqual([]);
  });
});

describe('sprite effects', () => {
  it('plays a one-shot animation and reports null once it is over', () => {
    const e = { fps: 10, count: 4, ageMs: 0 };
    expect(effectFrame(e)).toBe(0);
    expect(effectFrame({ ...e, ageMs: 250 })).toBe(2);
    expect(effectFrame({ ...e, ageMs: 400 })).toBeNull();
  });

  it('drops dust behind a dashing player and removes finished effects', () => {
    const w = fresh();
    addEnemy(w, 'quilboar', FRONT + 300);
    stepWorld(w, CHARGE);
    expect(w.player.state).toBe('Charging');
    const fx = createEffects();
    fx.update(16, w);
    expect(fx.sprites.map((s) => s.sheetId)).toEqual(['charge-dust']);
    expect(fx.sprites[0]!.x + 48).toBeLessThanOrEqual(w.player.x);
    fx.update(5000, w);
    expect(fx.sprites.filter((s) => s.ageMs >= 5000)).toEqual([]);
  });

  it('clear() removes everything', () => {
    const w = fresh();
    addEnemy(w, 'quilboar', FRONT + 80);
    stepWorld(w, STOMP);
    const fx = createEffects();
    fx.handle(drainEvents(w), w);
    fx.clear();
    expect(fx.text).toEqual([]);
    expect(fx.sprites).toEqual([]);
  });
});

describe('ability and enemy frames', () => {
  const atlas = layoutAtlas(SHEETS);
  const base = {
    state: 'Running',
    vy: 0,
    scroll: 0,
    sinceDeathMs: 0,
    clockMs: 0,
    idle: false,
  } as const;

  it('plays the stomp frames across the animation lock and the charge frames across the dash', () => {
    expect(stompFrameIndex(CONFIG.stomp.lockMs)).toBe(0);
    expect(stompFrameIndex(1)).toBe(2);
    expect(chargeFrameIndex(CONFIG.charge.dashMs)).toBe(0);
    expect(chargeFrameIndex(1)).toBe(1);
    expect(playerFrame({ ...base, state: 'Stomping', lockMs: CONFIG.stomp.lockMs })).toBe(
      'tauren/stomp/0',
    );
    expect(playerFrame({ ...base, state: 'Charging', dashMs: 1 })).toBe('tauren/charge/1');
  });

  it('picks an existing atlas frame for every enemy kind and pose', () => {
    for (const kind of ENEMY_KINDS) {
      for (const [stunned, defeated] of [
        [false, false],
        [true, false],
        [false, true],
      ] as const) {
        for (const clock of [0, 123, 5000]) {
          expect(atlas.frames[enemyFrame(kind, stunned, defeated, clock)]).toBeDefined();
        }
      }
    }
  });

  it('loops the move animation and holds stunned and defeated poses', () => {
    expect(enemyFrame('quilboar', false, false, 0)).toBe('quilboar/walk/0');
    expect(enemyFrame('quilboar', true, false, 9999)).toBe('quilboar/stunned/0');
    expect(enemyFrame('quilboar', false, true, 9999)).toBe('quilboar/defeated/0');
    expect(enemyFrame('kodo', true, false, 0)).toBe('kodo/kneel/1');
  });
});
