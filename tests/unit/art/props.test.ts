import { describe, expect, it } from 'vitest';
import { ON, type Grid, type SpriteSheet } from '../../../src/render/art/grid';
import { boulderSheet } from '../../../src/render/art/sprites/boulder';
import {
  chargeDustSheet,
  hitSparkSheet,
  shockwaveSheet,
  stunSwirlSheet,
} from '../../../src/render/art/sprites/effects';
import { iconsSheet } from '../../../src/render/art/sprites/icons';
import { thornbushSheet } from '../../../src/render/art/sprites/thornbush';
import { totemSheet } from '../../../src/render/art/sprites/totem';

const counts = (sheet: SpriteSheet): Record<string, number> =>
  Object.fromEntries(Object.entries(sheet.animations).map(([k, a]) => [k, a.frames.length]));

const frames = (sheet: SpriteSheet): Grid[] =>
  Object.values(sheet.animations).flatMap((a) => [...a.frames]);

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

/** Number of 8-connected groups of black pixels. */
const components = (rows: Grid): number => {
  const seen = rows.map((r) => Array.from(r, () => false));
  let groups = 0;
  rows.forEach((row, y0) => {
    for (let x0 = 0; x0 < row.length; x0 += 1) {
      if (row[x0] !== ON || seen[y0]![x0]) continue;
      groups += 1;
      const stack: [number, number][] = [[x0, y0]];
      seen[y0]![x0] = true;
      while (stack.length > 0) {
        const [x, y] = stack.pop()!;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (rows[ny]?.[nx] === ON && !seen[ny]![nx]) {
              seen[ny]![nx] = true;
              stack.push([nx, ny]);
            }
          }
        }
      }
    }
  });
  return groups;
};

const ALL = [
  thornbushSheet,
  boulderSheet,
  totemSheet,
  iconsSheet,
  shockwaveSheet,
  chargeDustSheet,
  stunSwirlSheet,
  hitSparkSheet,
];
const OBSTACLES = [thornbushSheet, boulderSheet, totemSheet];

describe('obstacles, icons and effects (SPEC 4.4)', () => {
  const specs: [SpriteSheet, number, number, Record<string, number>][] = [
    [thornbushSheet, 24, 28, { variants: 3 }],
    [boulderSheet, 40, 36, { variants: 2 }],
    [totemSheet, 22, 56, { variants: 2 }],
    [iconsSheet, 32, 32, { jump: 1, charge: 1, stomp: 1 }],
    [shockwaveSheet, 160, 32, { burst: 4 }],
    [chargeDustSheet, 48, 24, { trail: 3 }],
    [stunSwirlSheet, 32, 16, { spin: 4 }],
    [hitSparkSheet, 24, 24, { burst: 3 }],
  ];
  it.each(specs.map(([s, w, h, expected]) => [s.id, s, w, h, expected] as const))(
    '%s has the SPEC frame size and counts',
    (_id, sheet, w, h, expected) => {
      expect([sheet.frameWidth, sheet.frameHeight]).toEqual([w, h]);
      expect(counts(sheet)).toEqual(expected);
    },
  );

  it.each(ALL)('$id uses chunky 2x2 pixels only', (sheet) => {
    for (const rows of frames(sheet)) expect(isChunky(rows)).toBe(true);
  });

  it.each(OBSTACLES)(
    '$id: every variant is one solid piece standing on the ground row',
    (sheet) => {
      for (const rows of frames(sheet)) {
        expect(rows[rows.length - 1]!.includes(ON)).toBe(true);
        expect(components(rows)).toBe(1);
      }
    },
  );

  it.each(OBSTACLES)('$id: variants are all distinct', (sheet) => {
    expect(distinct(frames(sheet))).toBe(frames(sheet).length);
  });

  it('ability icons are three distinct glyphs', () => {
    expect(distinct(frames(iconsSheet))).toBe(3);
  });

  it.each([shockwaveSheet, chargeDustSheet, stunSwirlSheet, hitSparkSheet])(
    '$id: animation frames are all distinct',
    (sheet) => {
      expect(distinct(frames(sheet))).toBe(frames(sheet).length);
    },
  );

  it('shockwave is mirror-symmetric around the feet and grows every frame', () => {
    const widths = shockwaveSheet.animations.burst!.frames.map((rows) => {
      for (const row of rows) expect(row).toBe([...row].reverse().join(''));
      const xs = rows.flatMap((row) => [...row].flatMap((ch, x) => (ch === ON ? [x] : [])));
      return Math.max(...xs) - Math.min(...xs);
    });
    for (let i = 1; i < widths.length; i += 1) expect(widths[i]!).toBeGreaterThan(widths[i - 1]!);
  });
});
