import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/config';
import { OBSTACLE_KINDS } from '../../../src/content/entities';
import {
  deathFrameIndex,
  idleFrameIndex,
  jumpFrameIndex,
  obstacleVariant,
  playerFrame,
  runFrameIndex,
  RUN_STRIDE_PX,
  scrollPx,
} from '../../../src/render/animation';
import { relativeLuminance } from '../../../src/render/art/palette';
import { formatRage } from '../../../src/render/hud';
import { layoutAtlas } from '../../../src/render/sprites';
import { SHEETS } from '../../../src/render/art/sprites';
import {
  KEY_ACTIONS,
  SWIPE_DOWN_PX,
  TOUCH_JUMP_FRACTION,
  isJumpZone,
} from '../../../src/input/input';

describe('HUD formatting', () => {
  it('zero-pads to 5 digits and grows beyond', () => {
    expect(formatRage(0)).toBe('00000');
    expect(formatRage(42.9)).toBe('00042');
    expect(formatRage(123456)).toBe('123456');
    expect(formatRage(-3)).toBe('00000');
  });
});

describe('player animation selection', () => {
  const base = {
    state: 'Running',
    vy: 0,
    scroll: 0,
    sinceDeathMs: 0,
    clockMs: 0,
    idle: false,
  } as const;

  it('advances run frames once per stride of ground scroll, looping over 6 frames', () => {
    expect(runFrameIndex(0)).toBe(0);
    expect(runFrameIndex(RUN_STRIDE_PX - 0.1)).toBe(0);
    expect(runFrameIndex(RUN_STRIDE_PX)).toBe(1);
    expect(runFrameIndex(RUN_STRIDE_PX * 6)).toBe(0);
    expect(playerFrame({ ...base, scroll: RUN_STRIDE_PX * 2 })).toBe('tauren/run/2');
  });

  it('converts distance Rage to scroll px', () => {
    expect(scrollPx(10)).toBe(10 * CONFIG.rage.pxPerRage);
  });

  it('uses the rise frame going up and the fall frame otherwise', () => {
    expect(jumpFrameIndex(-300)).toBe(0);
    expect(jumpFrameIndex(0)).toBe(1);
    expect(jumpFrameIndex(500)).toBe(1);
    expect(playerFrame({ ...base, state: 'Airborne', vy: -1 })).toBe('tauren/jump/0');
    expect(playerFrame({ ...base, state: 'Airborne', vy: 1 })).toBe('tauren/jump/1');
  });

  it('plays the death animation once and holds the last frame', () => {
    expect(deathFrameIndex(0)).toBe(0);
    expect(deathFrameIndex(10_000)).toBe(3);
    expect(playerFrame({ ...base, state: 'Dead', sinceDeathMs: 10_000 })).toBe('tauren/death/3');
  });

  it('shows idle frames on the title and loops them', () => {
    expect(playerFrame({ ...base, idle: true })).toBe('tauren/idle/0');
    expect(idleFrameIndex(0)).toBe(0);
    expect(idleFrameIndex(60_000) >= 0 && idleFrameIndex(60_000) < 4).toBe(true);
  });

  it('picks an existing obstacle variant for every kind and id', () => {
    const atlas = layoutAtlas(SHEETS);
    for (const kind of OBSTACLE_KINDS) {
      for (let id = 1; id <= 20; id++) {
        expect(atlas.frames[`${kind}/variants/${obstacleVariant(kind, id)}`]).toBeDefined();
      }
    }
  });

  it('every frame key used for the player exists in the atlas', () => {
    const atlas = layoutAtlas(SHEETS);
    const states = ['Running', 'Airborne', 'Dead'] as const;
    for (let s = 0; s < 120; s += 3) {
      for (const state of states) {
        const key = playerFrame({
          ...base,
          state,
          scroll: s,
          vy: s % 2 ? -1 : 1,
          sinceDeathMs: s * 20,
        });
        expect(atlas.frames[key]).toBeDefined();
      }
    }
  });
});

describe('input mapping', () => {
  it('maps the SPEC 5.2 / 10.1 keys', () => {
    for (const code of ['Space', 'KeyW', 'ArrowUp']) expect(KEY_ACTIONS[code]).toBe('Jump');
    for (const code of ['ArrowDown', 'KeyS']) expect(KEY_ACTIONS[code]).toBe('FastFall');
    for (const code of ['KeyQ', 'Digit1']) expect(KEY_ACTIONS[code]).toBe('Charge');
    for (const code of ['KeyE', 'Digit2']) expect(KEY_ACTIONS[code]).toBe('Stomp');
    for (const code of ['KeyP', 'Escape']) expect(KEY_ACTIONS[code]).toBe('Pause');
    expect(KEY_ACTIONS.KeyM).toBe('Mute');
  });

  it('treats the left 60% of the game area as the touch jump zone', () => {
    expect(TOUCH_JUMP_FRACTION).toBe(0.6);
    expect(isJumpZone(0, 1000)).toBe(true);
    expect(isJumpZone(599, 1000)).toBe(true);
    expect(isJumpZone(600, 1000)).toBe(false);
    expect(isJumpZone(10, 0)).toBe(false);
    expect(SWIPE_DOWN_PX).toBeGreaterThan(0);
  });
});

describe('HUD and overlay colours (SPEC 10.4: text >= 4.5:1 against its backing panel)', () => {
  const css = readFileSync('src/style.css', 'utf8');
  const colour = (name: string): string => {
    const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
    if (!match) throw new Error(`Missing CSS variable --${name}`);
    return match[1]!;
  };
  const ratio = (fg: string, bg: string): number => {
    const [hi, lo] = [relativeLuminance(fg), relativeLuminance(bg)].sort((a, b) => b - a);
    return (hi! + 0.05) / (lo! + 0.05);
  };

  it.each([
    ['text', 'panel-bg'],
    ['rage', 'panel-bg'],
    ['button-text', 'button-bg'],
    ['panel-bg', 'rage'],
    ['focus', 'panel-bg'],
  ])('%s on %s', (fg, bg) => {
    expect(ratio(colour(fg), colour(bg))).toBeGreaterThanOrEqual(4.5);
  });
});
