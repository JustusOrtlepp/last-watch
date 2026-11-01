import { describe, expect, it } from 'vitest';
import { ON } from '../../../src/render/art/grid';
import { taurenSheet } from '../../../src/render/art/sprites/tauren';

const anims = taurenSheet.animations;

describe('tauren sheet', () => {
  it('has the frame counts from SPEC 4.4 (21 frames)', () => {
    const counts = Object.fromEntries(Object.entries(anims).map(([k, a]) => [k, a.frames.length]));
    expect(counts).toEqual({ idle: 4, run: 6, jump: 2, stomp: 3, charge: 2, death: 4 });
  });

  it('uses chunky 2x2 pixels only (no single-pixel noise)', () => {
    for (const anim of Object.values(anims)) {
      for (const rows of anim.frames) {
        for (let y = 0; y < rows.length; y += 2) {
          for (let x = 0; x < rows[y]!.length; x += 2) {
            const block = [rows[y]![x], rows[y]![x + 1], rows[y + 1]![x], rows[y + 1]![x + 1]];
            expect(new Set(block).size).toBe(1);
          }
        }
      }
    }
  });

  it('every grounded frame touches the ground row; airborne jump frames do not', () => {
    const touchesGround = (rows: readonly string[]): boolean => rows[63]!.includes(ON);
    for (const name of ['idle', 'run', 'stomp', 'charge', 'death'] as const) {
      for (const rows of anims[name]!.frames) expect(touchesGround(rows)).toBe(true);
    }
    for (const rows of anims.jump!.frames) expect(touchesGround(rows)).toBe(false);
  });

  it('run frames are all distinct', () => {
    const keys = anims.run!.frames.map((f) => f.join('\n'));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
