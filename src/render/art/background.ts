import { CONFIG } from '../../config';
import { PALETTE, type PaletteKey } from './palette';

/**
 * Durotar parallax backgrounds (SPEC 4.3, 4.4), generated procedurally from the palette at
 * cell resolution and upscaled by BG_CELL so the pixels match the sprites' chunky scale.
 * Every feature is drawn with x wrapping around the tile width, so each layer tiles
 * seamlessly. Pure and deterministic (seeded), so it can be unit tested without a DOM.
 */
export const BG_CELL = 2;

export const PALETTE_KEYS = Object.keys(PALETTE) as readonly PaletteKey[];
const INDEX = new Map<PaletteKey, number>(PALETTE_KEYS.map((k, i) => [k, i + 1]));

export interface BackgroundLayer {
  readonly id: string;
  /** Scroll factor relative to the world speed (SPEC 4.3). */
  readonly parallax: number;
  /** Screen row of the layer's top edge (logical px). */
  readonly y: number;
  /** Tile width in logical px; the layer repeats horizontally. */
  readonly width: number;
  readonly height: number;
  /** Row-major indices into PALETTE_KEYS, offset by one; 0 = transparent. */
  readonly pixels: Uint8Array;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;

function randInt(rand: Rand, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

/** Cell canvas. `up` counts rows from the bottom; x wraps around the width. */
class Cells {
  readonly data: Uint8Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8Array(w * h);
  }

  set(x: number, up: number, key: PaletteKey): void {
    if (up < 0 || up >= this.h) return;
    const wx = ((x % this.w) + this.w) % this.w;
    this.data[(this.h - 1 - up) * this.w + wx] = INDEX.get(key)!;
  }

  toLayer(id: string, parallax: number, y: number): BackgroundLayer {
    const width = this.w * BG_CELL;
    const height = this.h * BG_CELL;
    const pixels = new Uint8Array(width * height);
    for (let py = 0; py < height; py += 1) {
      const row = Math.floor(py / BG_CELL) * this.w;
      for (let px = 0; px < width; px += 1) {
        pixels[py * width + px] = this.data[row + Math.floor(px / BG_CELL)]!;
      }
    }
    return { id, parallax, y, width, height, pixels };
  }
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/** Static sky haze: four bands, top to horizon, with short ordered-dither hand-overs. */
function skyLayer(): BackgroundLayer {
  const keys: readonly PaletteKey[] = [
    'skyHazeTop',
    'skyHazeUpper',
    'skyHazeLower',
    'skyHazeHorizon',
  ];
  const bounds = [30, 52, 70]; // cell rows (from the top) where one band hands over
  const ramp = 8;
  const c = new Cells(8, CONFIG.groundY / BG_CELL);
  for (let row = 0; row < c.h; row += 1) {
    let band = 0;
    let mix = 0;
    for (let i = 0; i < bounds.length; i += 1) {
      const t = (row - bounds[i]! + ramp / 2 + 0.5) / ramp;
      if (t >= 1) {
        band = i + 1;
      } else {
        if (t > 0) mix = t;
        break;
      }
    }
    for (let x = 0; x < c.w; x += 1) {
      const threshold = (BAYER4[(row % 4) * 4 + (x % 4)]! + 0.5) / 16;
      c.set(x, c.h - 1 - row, keys[mix > threshold ? band + 1 : band]!);
    }
  }
  return c.toLayer('sky', 0, 0);
}

/** Far layer (0.2x): terraced canyon walls with strata, and tall weathered rock spires. */
function farLayer(): BackgroundLayer {
  const rand = mulberry32(0x0d0a0201);
  const c = new Cells(480, 70);

  // Canyon wall: a cyclic run of mesas joined by stepped cliffs.
  const starts: number[] = [];
  const heights: number[] = [];
  for (let x = 0; x < c.w - 20; x += randInt(rand, 26, 58)) {
    starts.push(x);
    heights.push(randInt(rand, 6, 13) * 2);
  }
  const wall = new Array<number>(c.w).fill(0);
  const shadow = new Array<boolean>(c.w).fill(false);
  starts.forEach((start, i) => {
    const end = starts[i + 1] ?? c.w + starts[0]!;
    const h = heights[i]!;
    const next = heights[(i + 1) % heights.length]!;
    const cliff = Math.ceil(Math.abs(next - h) / 4);
    for (let x = start; x < end; x += 1) {
      const toEnd = end - x;
      let height = h;
      if (toEnd <= cliff) height = next + Math.round(((h - next) * (toEnd - 1)) / cliff / 2) * 2;
      wall[x % c.w] = height;
      shadow[x % c.w] = toEnd <= cliff && next < h;
    }
    // A few low bumps on the mesa top, never single cells.
    for (let b = randInt(rand, 0, 2); b > 0; b -= 1) {
      const bx = start + randInt(rand, 2, Math.max(2, end - start - cliff - 8));
      const bw = randInt(rand, 3, 6);
      for (let x = bx; x < bx + bw; x += 1) wall[x % c.w]! += 1;
    }
  });
  for (let x = 0; x < c.w; x += 1) {
    for (let up = 0; up < wall[x]!; up += 1) c.set(x, up, shadow[x] ? 'farShade' : 'farSpires');
  }
  // Strata: dashed shade lines across the wall face.
  for (let up = 5; up < 30; up += 7) {
    for (let x = randInt(rand, 0, 12); x < c.w;) {
      const len = randInt(rand, 6, 22);
      for (let i = 0; i < len; i += 1) {
        if (wall[(x + i) % c.w]! > up + 2) c.set(x + i, up, 'farShade');
      }
      x += len + randInt(rand, 8, 30);
    }
  }

  // Spires: tapered stacks with ledges and a rough outline; shadow on the right flank.
  for (let i = 0; i < 4; i += 1) {
    const cx = Math.floor((i * c.w) / 4) + randInt(rand, 20, 100);
    const height = randInt(rand, 34, 62);
    const base = randInt(rand, 6, 9);
    const top = randInt(rand, 2, 3);
    const ledgeA = randInt(rand, 8, Math.floor(height / 2));
    const ledgeB = randInt(rand, Math.floor(height / 2) + 2, height - 6);
    let jl = 0;
    let jr = 0;
    for (let up = 0; up < height; up += 1) {
      if (up > 0 && up % 3 === 0) {
        jl = Math.max(-1, Math.min(1, jl + randInt(rand, -1, 1)));
        jr = Math.max(-1, Math.min(1, jr + randInt(rand, -1, 1)));
      }
      let half = Math.round(base + (top - base) * (up / height) ** 0.8);
      if (up - ledgeA === 0 || up - ledgeA === 1 || up - ledgeB === 0 || up - ledgeB === 1) {
        half += 1;
      }
      const left = cx - half + jl;
      const right = cx + half + jr;
      const split = left + Math.ceil((right - left + 1) * 0.6);
      for (let x = left; x <= right; x += 1) c.set(x, up, x >= split ? 'farShade' : 'farSpires');
    }
    // Crooked cap.
    for (let x = cx - top + 1; x <= cx + top; x += 1) c.set(x, height, 'farSpires');
    c.set(cx + top, height, 'farShade');
  }
  return c.toLayer('far', 0.2, CONFIG.groundY - c.h * BG_CELL);
}

function bush(c: Cells, rand: Rand, cx: number): void {
  for (let dx = -2; dx <= 2; dx += 1) {
    for (let up = 0; up < (Math.abs(dx) === 2 ? 1 : 2); up += 1) c.set(cx + dx, up, 'midShade');
  }
  const branches = randInt(rand, 5, 7);
  for (let i = 0; i < branches; i += 1) {
    const angle = Math.PI * (0.12 + (0.76 * (i + 0.2 + rand() * 0.6)) / branches);
    const len = randInt(rand, 5, 10);
    let side = rand() < 0.5 ? 1 : -1;
    for (let s = 1; s <= len; s += 1) {
      const x = cx + Math.round(Math.cos(angle) * s);
      const up = 1 + Math.round(Math.sin(angle) * s * 0.8);
      c.set(x, up, 'midShade');
      if (s % 3 === 0 && s < len) {
        c.set(
          x + Math.round(-Math.sin(angle) * side),
          up + Math.round(Math.cos(angle) * side),
          'midShade',
        );
        side = -side;
      }
    }
  }
}

/** Mid layer (0.5x): clusters of jagged rock shards and dry thornscrub. */
function midLayer(): BackgroundLayer {
  const rand = mulberry32(0x0d0a0502);
  const c = new Cells(360, 30);
  const top = new Array<number>(c.w).fill(0);
  const shade = new Array<boolean>(c.w).fill(false);

  // Low rubble so the clusters sit on something.
  for (let x = 0; x < c.w;) {
    const len = randInt(rand, 3, 9);
    const h = randInt(rand, 0, 2);
    for (let i = 0; i < len; i += 1) top[(x + i) % c.w] = h;
    x += len;
  }
  const clusters = 9;
  for (let i = 0; i < clusters; i += 1) {
    const center = Math.floor((i * c.w) / clusters) + randInt(rand, -8, 8);
    for (let s = randInt(rand, 2, 4); s > 0; s -= 1) {
      const px = center + randInt(rand, -11, 11);
      const ph = randInt(rand, 5, 21);
      const left = randInt(rand, 3, 9);
      const right = randInt(rand, 3, 9);
      for (let x = px - left; x <= px + right; x += 1) {
        const h =
          x <= px
            ? Math.round((ph * (x - (px - left) + 1)) / (left + 1))
            : Math.round((ph * (px + right - x + 1)) / (right + 1)) - ((x - px) % 3 === 2 ? 1 : 0);
        const wx = ((x % c.w) + c.w) % c.w;
        if (h > top[wx]!) {
          top[wx] = h;
          shade[wx] = x > px;
        }
      }
    }
  }
  for (let x = 0; x < c.w; x += 1) {
    for (let up = 0; up < top[x]!; up += 1) c.set(x, up, shade[x] ? 'midShade' : 'midRocks');
  }
  // Thornscrub in the gaps between rock clusters.
  for (let i = 0; i < 8; i += 1) {
    let x = randInt(rand, 0, c.w - 1);
    for (let tries = 0; tries < 30 && top[x]! > 4; tries += 1) x = randInt(rand, 0, c.w - 1);
    bush(c, rand, x);
  }
  return c.toLayer('mid', 0.5, CONFIG.groundY - c.h * BG_CELL);
}

/** Ground strip (1.0x): red dust with lighter dust specks and dark cracks. */
function groundLayer(): BackgroundLayer {
  const rand = mulberry32(0x0d0a1003);
  const c = new Cells(240, (CONFIG.logicalHeight - CONFIG.groundY) / BG_CELL);
  for (let x = 0; x < c.w; x += 1) for (let up = 0; up < c.h; up += 1) c.set(x, up, 'groundStrip');
  for (let i = 0; i < 70; i += 1) {
    const x = randInt(rand, 0, c.w - 1);
    const up = randInt(rand, 0, c.h - 2);
    for (let k = randInt(rand, 1, 3); k > 0; k -= 1) c.set(x + k, up, 'groundDustSpecks');
  }
  const crack = (x0: number, up0: number, steps: number, branch: boolean): void => {
    let up = up0;
    for (let s = 0; s < steps; s += 1) {
      const x = x0 + s;
      up = Math.max(1, Math.min(c.h - 3, up + [-1, 0, 0, 1][randInt(rand, 0, 3)]!));
      c.set(x, up, 'groundCracks');
      if (branch && rand() < 0.15)
        crack(x, up + (rand() < 0.5 ? -1 : 1), randInt(rand, 2, 4), false);
    }
  };
  for (let i = 0; i < 10; i += 1) {
    crack(randInt(rand, 0, c.w - 1), randInt(rand, 2, c.h - 4), randInt(rand, 6, 14), true);
  }
  return c.toLayer('ground', 1, CONFIG.groundY);
}

/** All layers in draw order: sky, far (0.2x), mid (0.5x), ground (1.0x). */
export function generateBackground(): BackgroundLayer[] {
  return [skyLayer(), farLayer(), midLayer(), groundLayer()];
}

/** Horizontal tile offset of a layer at a given world scroll distance. */
export function layerOffset(layer: BackgroundLayer, scroll: number): number {
  const o = Math.round(scroll * layer.parallax) % layer.width;
  return o < 0 ? o + layer.width : o;
}

/** Palette key visible at screen pixel (x, y) for a world scroll distance; null = nothing. */
export function sampleBackground(
  layers: readonly BackgroundLayer[],
  scroll: number,
  x: number,
  y: number,
): PaletteKey | null {
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    const l = layers[i]!;
    if (y < l.y || y >= l.y + l.height) continue;
    const tx = (x + layerOffset(l, scroll)) % l.width;
    const v = l.pixels[(y - l.y) * l.width + tx]!;
    if (v) return PALETTE_KEYS[v - 1]!;
  }
  return null;
}

/** Number of rows in which two columns of a layer differ. */
export function columnDiff(layer: BackgroundLayer, a: number, b: number): number {
  let n = 0;
  for (let y = 0; y < layer.height; y += 1) {
    if (layer.pixels[y * layer.width + a] !== layer.pixels[y * layer.width + b]) n += 1;
  }
  return n;
}

/**
 * Seamless-tile check: the wrap seam (last column next to the first) must change no more
 * than the sharpest edge already inside the tile, i.e. the seam is not visible as an edge.
 */
export function seamCheck(layer: BackgroundLayer): {
  seam: number;
  maxInterior: number;
  ok: boolean;
} {
  const seam = columnDiff(layer, layer.width - 1, 0);
  let maxInterior = 0;
  for (let x = 0; x < layer.width - 1; x += 1) {
    maxInterior = Math.max(maxInterior, columnDiff(layer, x, x + 1));
  }
  return { seam, maxInterior, ok: seam <= maxInterior };
}
