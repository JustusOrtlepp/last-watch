import { describe, expect, it } from 'vitest';
import { compose, pad, upscale } from '../../../src/render/art/compose';
import { validateFrame, validateSheet } from '../../../src/render/art/grid';
import { SHEETS } from '../../../src/render/art/sprites';
import { frameKey, layoutAtlas, rasterize } from '../../../src/render/sprites';

describe('grid format', () => {
  it('accepts a well-formed frame', () => {
    expect(validateFrame(['#.', '.#'], 2, 2)).toEqual([]);
  });

  it('rejects illegal characters, wrong widths, wrong heights, and empty frames', () => {
    expect(validateFrame(['#x'], 2, 1)).toHaveLength(1);
    expect(validateFrame(['#'], 2, 1)).toHaveLength(1);
    expect(validateFrame(['#.'], 2, 2)).toHaveLength(1);
    expect(validateFrame(['..', '..'], 2, 2)).toContain('frame has no pixels');
  });

  it.each(SHEETS.map((s) => [s.id, s] as const))(
    'sheet %s: every frame matches the declared size and uses only # and .',
    (_id, sheet) => {
      expect(validateSheet(sheet)).toEqual([]);
    },
  );

  it('sheet ids are unique', () => {
    const ids = SHEETS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('compose', () => {
  it('adds layers at offsets', () => {
    expect(compose(3, 2, [{ rows: ['#'], x: 1, y: 1 }])).toEqual(['...', '.#.']);
  });

  it('cuts pixels with a cut layer', () => {
    const base = { rows: ['###'], x: 0, y: 0 };
    expect(compose(3, 1, [base, { rows: ['#'], x: 1, y: 0, mode: 'cut' }])).toEqual(['#.#']);
  });

  it('throws when a layer pixel is outside the canvas', () => {
    expect(() => compose(2, 2, [{ rows: ['##'], x: 1, y: 0 }])).toThrow(RangeError);
  });

  it('throws when a layer has rows of different widths', () => {
    expect(() => compose(3, 2, [{ rows: ['##', '#'], x: 0, y: 0 }])).toThrow(RangeError);
  });
});

describe('pad', () => {
  it('right-pads rows with transparent pixels and rejects rows that are too wide', () => {
    expect(pad(3, ['#', '', '.##'])).toEqual(['#..', '...', '.##']);
    expect(() => pad(2, ['###'])).toThrow(RangeError);
  });
});

describe('upscale', () => {
  it('turns every pixel into a factor x factor block', () => {
    expect(upscale(['#.'], 2)).toEqual(['##..', '##..']);
  });
});

describe('atlas', () => {
  it('rasterizes # as opaque black and . as transparent', () => {
    expect(Array.from(rasterize(['#.'], 2, 1))).toEqual([0, 0, 0, 255, 0, 0, 0, 0]);
  });

  it('gives every frame a unique, non-overlapping rectangle inside the atlas', () => {
    const layout = layoutAtlas(SHEETS, 200);
    const expected = SHEETS.flatMap((s) =>
      Object.entries(s.animations).flatMap(([name, anim]) =>
        anim.frames.map((_, i) => frameKey(s.id, name, i)),
      ),
    );
    expect(Object.keys(layout.frames).sort()).toEqual([...expected].sort());

    const rects = Object.values(layout.frames);
    for (const r of rects) {
      expect(r.x + r.w).toBeLessThanOrEqual(layout.width);
      expect(r.y + r.h).toBeLessThanOrEqual(layout.height);
    }
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i]!;
        const b = rects[j]!;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
  });
});
