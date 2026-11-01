import { describe, expect, it } from 'vitest';
import { ON, type Grid, type SpriteSheet } from '../../../src/render/art/grid';
import { arrowSheet } from '../../../src/render/art/sprites/arrow';
import { centaurSheet } from '../../../src/render/art/sprites/centaur';
import { harpySheet } from '../../../src/render/art/sprites/harpy';
import { kodoSheet } from '../../../src/render/art/sprites/kodo';
import { plainstriderSheet } from '../../../src/render/art/sprites/plainstrider';
import { quilboarSheet } from '../../../src/render/art/sprites/quilboar';

const counts = (sheet: SpriteSheet): Record<string, number> =>
  Object.fromEntries(Object.entries(sheet.animations).map(([k, a]) => [k, a.frames.length]));

const frames = (sheet: SpriteSheet): Grid[] =>
  Object.values(sheet.animations).flatMap((a) => [...a.frames]);

const touchesGround = (rows: Grid): boolean => rows[rows.length - 1]!.includes(ON);

const isChunky = (rows: Grid): boolean => {
  for (let y = 0; y < rows.length; y += 2) {
    for (let x = 0; x < rows[y]!.length; x += 2) {
      const block = [rows[y]![x], rows[y]![x + 1], rows[y + 1]![x], rows[y + 1]![x + 1]];
      if (new Set(block).size !== 1) return false;
    }
  }
  return true;
};

const distinct = (list: readonly Grid[]): number => new Set(list.map((f) => f.join('\n'))).size;

describe('enemy and arrow sheets (SPEC 4.4)', () => {
  const specs: [SpriteSheet, number, number, Record<string, number>][] = [
    [quilboarSheet, 48, 40, { walk: 4, stunned: 1, defeated: 1 }],
    [plainstriderSheet, 48, 56, { run: 4, stunned: 1, defeated: 1 }],
    [harpySheet, 48, 36, { flap: 4, stunned: 1, defeated: 1 }],
    [centaurSheet, 56, 64, { idle: 2, shoot: 3, stunned: 1, defeated: 1 }],
    [kodoSheet, 136, 124, { walk: 4, kneel: 2 }],
    [arrowSheet, 20, 4, { fly: 1 }],
  ];
  it.each(specs.map(([s, w, h, expected]) => [s.id, s, w, h, expected] as const))(
    '%s has the SPEC frame size and counts',
    (_id, sheet, w, h, expected) => {
      expect([sheet.frameWidth, sheet.frameHeight]).toEqual([w, h]);
      expect(counts(sheet)).toEqual(expected);
    },
  );

  it.each([quilboarSheet, plainstriderSheet, harpySheet, centaurSheet, kodoSheet, arrowSheet])(
    '$id uses chunky 2x2 pixels only',
    (sheet) => {
      for (const rows of frames(sheet)) expect(isChunky(rows)).toBe(true);
    },
  );

  it.each([quilboarSheet, plainstriderSheet, centaurSheet, kodoSheet])(
    '$id: every frame stands on the ground row',
    (sheet) => {
      for (const rows of frames(sheet)) expect(touchesGround(rows)).toBe(true);
    },
  );

  it('harpy flies (flap frames clear the ground row) and lands when defeated', () => {
    for (const rows of harpySheet.animations.flap!.frames) expect(touchesGround(rows)).toBe(false);
    expect(touchesGround(harpySheet.animations.defeated!.frames[0]!)).toBe(true);
  });

  it('looping locomotion frames are all distinct', () => {
    for (const anim of [
      quilboarSheet.animations.walk!,
      plainstriderSheet.animations.run!,
      harpySheet.animations.flap!,
      kodoSheet.animations.walk!,
      centaurSheet.animations.idle!,
      centaurSheet.animations.shoot!,
    ]) {
      expect(distinct(anim.frames)).toBe(anim.frames.length);
    }
  });

  it('stunned poses differ from every locomotion frame', () => {
    const pairs: [Grid, readonly Grid[]][] = [
      [quilboarSheet.animations.stunned!.frames[0]!, quilboarSheet.animations.walk!.frames],
      [plainstriderSheet.animations.stunned!.frames[0]!, plainstriderSheet.animations.run!.frames],
      [harpySheet.animations.stunned!.frames[0]!, harpySheet.animations.flap!.frames],
      [centaurSheet.animations.stunned!.frames[0]!, centaurSheet.animations.idle!.frames],
      [kodoSheet.animations.kneel!.frames[1]!, kodoSheet.animations.walk!.frames],
    ];
    for (const [stun, loop] of pairs) expect(distinct([stun, ...loop])).toBe(loop.length + 1);
  });
});
