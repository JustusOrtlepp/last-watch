import { ON, type SpriteSheet } from './art/grid';

/**
 * Atlas baker (SPEC 4.4): grids are baked once into an offscreen atlas; rendering uses
 * drawImage from the atlas only. Layout and rasterisation are pure so they can be unit
 * tested without a DOM.
 */
const PADDING = 1; // guards against sampling bleed at non-integer canvas scales
const MAX_ATLAS_WIDTH = 1024;

export interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface AtlasLayout {
  readonly width: number;
  readonly height: number;
  readonly frames: Readonly<Record<string, FrameRect>>;
}

export function frameKey(sheetId: string, animation: string, index: number): string {
  return `${sheetId}/${animation}/${index}`;
}

/** Shelf-packs every frame of every sheet. Keys are `frameKey(sheet, animation, index)`. */
export function layoutAtlas(
  sheets: readonly SpriteSheet[],
  maxWidth: number = MAX_ATLAS_WIDTH,
): AtlasLayout {
  const frames: Record<string, FrameRect> = {};
  let x = 0;
  let y = 0;
  let shelfHeight = 0;
  let width = 0;
  for (const sheet of sheets) {
    const w = sheet.frameWidth;
    const h = sheet.frameHeight;
    if (w + PADDING > maxWidth) throw new RangeError(`${sheet.id}: frame wider than atlas`);
    for (const [name, anim] of Object.entries(sheet.animations)) {
      anim.frames.forEach((_, i) => {
        if (x + w + PADDING > maxWidth) {
          x = 0;
          y += shelfHeight;
          shelfHeight = 0;
        }
        frames[frameKey(sheet.id, name, i)] = { x, y, w, h };
        x += w + PADDING;
        shelfHeight = Math.max(shelfHeight, h + PADDING);
        width = Math.max(width, x);
      });
    }
  }
  return { width, height: y + shelfHeight, frames };
}

/** RGBA bytes for one frame: `#` -> opaque black, `.` -> fully transparent. */
export function rasterize(
  rows: readonly string[],
  width: number,
  height: number,
): Uint8ClampedArray<ArrayBuffer> {
  const data = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  for (let y = 0; y < height; y += 1) {
    const row = rows[y] ?? '';
    for (let x = 0; x < width; x += 1) {
      if (row[x] === ON) data[(y * width + x) * 4 + 3] = 255;
    }
  }
  return data;
}

export interface Atlas {
  readonly canvas: HTMLCanvasElement;
  readonly layout: AtlasLayout;
}

export function bakeAtlas(sheets: readonly SpriteSheet[]): Atlas {
  const layout = layoutAtlas(sheets);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, layout.width);
  canvas.height = Math.max(1, layout.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  for (const sheet of sheets) {
    for (const [name, anim] of Object.entries(sheet.animations)) {
      anim.frames.forEach((rows, i) => {
        const rect = layout.frames[frameKey(sheet.id, name, i)]!;
        const pixels = rasterize(rows, rect.w, rect.h);
        ctx.putImageData(new ImageData(pixels, rect.w, rect.h), rect.x, rect.y);
      });
    }
  }
  return { canvas, layout };
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  atlas: Atlas,
  key: string,
  x: number,
  y: number,
  scale = 1,
): void {
  const rect = atlas.layout.frames[key];
  if (!rect) throw new Error(`Unknown frame: ${key}`);
  ctx.drawImage(atlas.canvas, rect.x, rect.y, rect.w, rect.h, x, y, rect.w * scale, rect.h * scale);
}
