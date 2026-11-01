import { CONFIG } from '../config';
import { PALETTE_KEYS, layerOffset, type BackgroundLayer } from './art/background';
import { PALETTE } from './art/palette';

/** Background layers baked once into offscreen canvases; drawing is drawImage only. */
export interface BakedLayer {
  readonly layer: BackgroundLayer;
  readonly canvas: HTMLCanvasElement;
}

const RGB = PALETTE_KEYS.map((k) => {
  const hex = PALETTE[k].hex;
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
});

/** RGBA bytes for a layer: palette colours opaque, index 0 fully transparent. */
export function layerRgba(layer: BackgroundLayer): Uint8ClampedArray<ArrayBuffer> {
  const data = new Uint8ClampedArray(new ArrayBuffer(layer.pixels.length * 4));
  layer.pixels.forEach((v, i) => {
    if (!v) return;
    const [r, g, b] = RGB[v - 1]!;
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  });
  return data;
}

export function bakeBackground(layers: readonly BackgroundLayer[]): BakedLayer[] {
  return layers.map((layer) => {
    const canvas = document.createElement('canvas');
    canvas.width = layer.width;
    canvas.height = layer.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    ctx.putImageData(new ImageData(layerRgba(layer), layer.width, layer.height), 0, 0);
    return { layer, canvas };
  });
}

/**
 * Draws every layer, tiled across the logical width, at a world scroll distance (px). `margin`
 * extends the tiling that many px past both edges, so a shaken camera never shows a gap.
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  baked: readonly BakedLayer[],
  scroll: number,
  margin = 0,
): void {
  for (const { layer, canvas } of baked) {
    let x = -layerOffset(layer, scroll);
    if (x > -margin) x -= layer.width;
    for (; x < CONFIG.logicalWidth + margin; x += layer.width) {
      ctx.drawImage(canvas, x, layer.y);
    }
  }
}
