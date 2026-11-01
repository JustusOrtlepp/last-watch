import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/config';
import {
  BG_CELL,
  PALETTE_KEYS,
  generateBackground,
  layerOffset,
  sampleBackground,
  seamCheck,
} from '../../../src/render/art/background';
import { PALETTE, contrastAgainstBlack, relativeLuminance } from '../../../src/render/art/palette';
import { layerRgba } from '../../../src/render/background';

const layers = generateBackground();
const byId = Object.fromEntries(layers.map((l) => [l.id, l]));

function usedKeys(id: string): Set<string> {
  const layer = byId[id]!;
  const keys = new Set<string>();
  for (const v of layer.pixels) if (v) keys.add(PALETTE_KEYS[v - 1]!);
  return keys;
}

describe('background layers', () => {
  it('has sky, far, mid and ground layers with the SPEC 4.3 parallax factors', () => {
    expect(layers.map((l) => [l.id, l.parallax])).toEqual([
      ['sky', 0],
      ['far', 0.2],
      ['mid', 0.5],
      ['ground', 1],
    ]);
  });

  it('is deterministic', () => {
    const again = generateBackground();
    layers.forEach((l, i) => expect(again[i]!.pixels).toEqual(l.pixels));
  });

  it('keeps layer geometry consistent and chunky (BG_CELL x BG_CELL pixels)', () => {
    for (const l of layers) {
      expect(l.pixels.length, l.id).toBe(l.width * l.height);
      expect(l.width % BG_CELL, l.id).toBe(0);
      for (let y = 0; y < l.height; y += BG_CELL) {
        for (let x = 0; x < l.width; x += BG_CELL) {
          const v = l.pixels[y * l.width + x];
          expect(l.pixels[y * l.width + x + 1], l.id).toBe(v);
          expect(l.pixels[(y + 1) * l.width + x], l.id).toBe(v);
          expect(l.pixels[(y + 1) * l.width + x + 1], l.id).toBe(v);
        }
      }
    }
  });

  it('places scenery above the ground line and the ground strip below it', () => {
    for (const id of ['sky', 'far', 'mid']) {
      expect(byId[id]!.y + byId[id]!.height, id).toBe(CONFIG.groundY);
    }
    expect(byId.ground!.y).toBe(CONFIG.groundY);
    expect(byId.ground!.y + byId.ground!.height).toBe(CONFIG.logicalHeight);
    for (const key of usedKeys('ground')) {
      expect(PALETTE[key as keyof typeof PALETTE].gameplayBand, key).toBe(false);
    }
  });

  it('uses only gameplay-band colours with >= 4.5:1 against black above the ground', () => {
    for (const id of ['sky', 'far', 'mid']) {
      for (const key of usedKeys(id)) {
        const entry = PALETTE[key as keyof typeof PALETTE];
        expect(entry.gameplayBand, `${id}:${key}`).toBe(true);
        expect(contrastAgainstBlack(entry.hex), `${id}:${key}`).toBeGreaterThanOrEqual(
          CONFIG.art.minContrastVsBlack,
        );
      }
    }
  });

  it('composites to an opaque, high-contrast gameplay band (y = 60..229) at any scroll', () => {
    for (const scroll of [0, 137, 1000, 4321.7, 98765]) {
      let worst = Infinity;
      for (let y = CONFIG.art.gameplayBandTopY; y < CONFIG.groundY; y += 1) {
        for (let x = 0; x < CONFIG.logicalWidth; x += 1) {
          const key = sampleBackground(layers, scroll, x, y);
          if (key === null) throw new Error(`hole at ${x},${y} scroll ${scroll}`);
          worst = Math.min(worst, contrastAgainstBlack(PALETTE[key].hex));
        }
      }
      expect(worst, `scroll ${scroll}`).toBeGreaterThanOrEqual(CONFIG.art.minContrastVsBlack);
    }
  });

  it('gets lighter with distance (atmospheric haze)', () => {
    const lum = (id: string): number[] =>
      [...usedKeys(id)].map((k) => relativeLuminance(PALETTE[k as keyof typeof PALETTE].hex));
    expect(Math.min(...lum('sky'))).toBeGreaterThan(Math.max(...lum('far')));
    expect(Math.min(...lum('far'))).toBeGreaterThan(Math.max(...lum('mid')));
  });

  it('tiles seamlessly (wrap seam no sharper than any edge inside the tile)', () => {
    for (const l of layers) expect(seamCheck(l).ok, l.id).toBe(true);
  });

  it('has visible detail on the scrolling layers', () => {
    expect(usedKeys('far')).toEqual(new Set(['farSpires', 'farShade']));
    expect(usedKeys('mid')).toEqual(new Set(['midRocks', 'midShade']));
    expect(usedKeys('ground')).toEqual(
      new Set(['groundStrip', 'groundDustSpecks', 'groundCracks']),
    );
    expect(usedKeys('sky').size).toBe(4);
  });

  it('wraps the scroll offset into the tile', () => {
    const far = byId.far!;
    expect(layerOffset(far, 0)).toBe(0);
    expect(layerOffset(far, far.width * 5 + 10)).toBe(
      Math.round((far.width * 5 + 10) * 0.2) % far.width,
    );
    expect(layerOffset(byId.sky!, 12345)).toBe(0);
  });

  it('bakes palette colours opaque and empty cells transparent', () => {
    const mid = byId.mid!;
    const rgba = layerRgba(mid);
    const empty = mid.pixels.indexOf(0);
    const filled = mid.pixels.findIndex((v) => v !== 0);
    expect(rgba[empty * 4 + 3]).toBe(0);
    expect(rgba[filled * 4 + 3]).toBe(255);
  });
});
