import { CONFIG } from '../config';
import { generateBackground, seamCheck } from './art/background';
import { PALETTE, contrastAgainstBlack, relativeLuminance } from './art/palette';
import { SHEETS } from './art/sprites';
import { bakeBackground, drawBackground, type BakedLayer } from './background';
import { bakeAtlas, drawFrame, frameKey, type Atlas } from './sprites';
import './gallery.css';

const SCALES = [1, 3] as const;
/** Run cycles advance one frame per this many px of ground scroll (no sliding feet). */
const STRIDE_PX = 6;

/**
 * Fills a canvas with the Durotar background (scroll 0) at `scale`, with the ground line at
 * canvas row `groundAt` so grounded sprites stand on it.
 */
function fillBackdrop(
  ctx: CanvasRenderingContext2D,
  backdrop: HTMLCanvasElement,
  groundAt: number,
  scale: number,
): void {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = PALETTE.skyHazeTop.hex;
  ctx.fillRect(0, 0, width, height);
  const dy = groundAt - CONFIG.groundY * scale;
  for (let x = 0; x < width; x += backdrop.width * scale) {
    ctx.drawImage(backdrop, x, dy, backdrop.width * scale, backdrop.height * scale);
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function paletteSection(): HTMLElement {
  const section = el('section', 'gallery-section');
  section.dataset.testid = 'palette';
  section.append(el('h2', undefined, 'Palette'));
  for (const [name, entry] of Object.entries(PALETTE)) {
    const row = el('div', 'swatch-row');
    const chip = el('span', 'swatch');
    chip.style.background = entry.hex;
    const ratio = contrastAgainstBlack(entry.hex).toFixed(2);
    const band = entry.gameplayBand ? 'gameplay band' : 'ground strip (exempt)';
    const lum = relativeLuminance(entry.hex).toFixed(3);
    row.append(
      chip,
      el('span', undefined, `${name} ${entry.hex} - L ${lum}, ${ratio}:1 - ${band}`),
    );
    section.append(row);
  }
  return section;
}

function layersSection(baked: readonly BakedLayer[]): HTMLElement {
  const section = el('section', 'gallery-section');
  section.dataset.sheet = 'background-layers';
  section.append(el('h2', undefined, 'Background layers - seamless tile check'));
  section.append(
    el(
      'p',
      undefined,
      'Each view: end of the tile | start of the tile at 2x; the tick marks the seam.',
    ),
  );
  for (const { layer, canvas } of baked) {
    const seam = seamCheck(layer);
    const title = el(
      'h3',
      undefined,
      `${layer.id} - tile ${layer.width} x ${layer.height} at y ${layer.y}, parallax ${layer.parallax}x - ` +
        `seam diff ${seam.seam} <= max interior ${seam.maxInterior}: ${seam.ok ? 'PASS' : 'FAIL'}`,
    );
    title.dataset.seam = seam.ok ? 'pass' : 'fail';
    const win = Math.min(layer.width, 240);
    const scale = 2;
    const view = el('canvas', 'strip');
    view.width = win * 2 * scale;
    view.height = layer.height * scale + 8;
    const ctx = view.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = PALETTE.skyHazeHorizon.hex;
    ctx.fillRect(0, 0, view.width, view.height);
    for (const [sx, dx] of [
      [layer.width - win, 0],
      [0, win * scale],
    ] as const) {
      ctx.drawImage(canvas, sx, 0, win, layer.height, dx, 8, win * scale, layer.height * scale);
    }
    ctx.fillStyle = '#000000';
    ctx.fillRect(win * scale - 1, 0, 2, 6);
    section.append(title, view);
  }
  return section;
}

const SCROLL_PROPS = [
  { sheet: 'thornbush', at: 640 },
  { sheet: 'boulder', at: 1080 },
  { sheet: 'totem', at: 1500 },
] as const;

function scrollSection(baked: readonly BakedLayer[], atlas: Atlas): HTMLElement {
  const section = el('section', 'gallery-section');
  section.dataset.sheet = 'scroll-views';
  section.append(el('h2', undefined, 'Scroll views - parallax at start and max speed'));
  const speeds = [
    ['start', CONFIG.speed.start],
    ['max', CONFIG.speed.max],
  ] as const;
  for (const [label, speed] of speeds) {
    section.append(
      el(
        'h3',
        undefined,
        `${label} speed ${speed} px/s - run cycle ${speed / STRIDE_PX} fps (1 frame per ${STRIDE_PX} px)`,
      ),
    );
    const view = el('canvas', 'scroll-view');
    view.width = CONFIG.logicalWidth;
    view.height = CONFIG.logicalHeight;
    view.dataset.speed = String(speed);
    const ctx = view.getContext('2d')!;
    let scroll = 0;
    let last: number | null = null;
    const span = CONFIG.logicalWidth + 1200;
    const tick = (now: number): void => {
      const dt = last === null ? 0 : Math.min(0.1, Math.max(0, now - last) / 1000);
      last = now;
      scroll += speed * dt;
      ctx.imageSmoothingEnabled = false;
      drawBackground(ctx, baked, scroll);
      for (const prop of SCROLL_PROPS) {
        const key = frameKey(prop.sheet, 'variants', 0);
        const rect = atlas.layout.frames[key]!;
        const x = ((((prop.at - scroll) % span) + span) % span) - 100;
        drawFrame(ctx, atlas, key, Math.round(x), CONFIG.groundY - rect.h);
      }
      const run = frameKey('tauren', 'run', Math.floor(scroll / STRIDE_PX) % 6);
      const rect = atlas.layout.frames[run]!;
      drawFrame(ctx, atlas, run, CONFIG.player.homeX, CONFIG.groundY - rect.h);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    section.append(view);
  }
  return section;
}

function sheetSection(
  sheet: (typeof SHEETS)[number],
  atlas: Atlas,
  backdrop: HTMLCanvasElement,
): HTMLElement {
  const section = el('section', 'gallery-section');
  section.dataset.sheet = sheet.id;
  section.append(el('h2', undefined, `${sheet.id} (${sheet.frameWidth} x ${sheet.frameHeight})`));

  for (const [name, anim] of Object.entries(sheet.animations)) {
    section.append(el('h3', undefined, `${name} - ${anim.frames.length} frames @ ${anim.fps} fps`));

    // Every frame at each scale, side by side on the background.
    for (const scale of SCALES) {
      const strip = el('canvas', 'strip');
      const gap = 4;
      strip.width = anim.frames.length * (sheet.frameWidth * scale + gap) + gap;
      strip.height = sheet.frameHeight * scale + gap * 2;
      const ctx = strip.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      fillBackdrop(ctx, backdrop, gap + sheet.frameHeight * scale, scale);
      anim.frames.forEach((_, i) => {
        drawFrame(
          ctx,
          atlas,
          frameKey(sheet.id, name, i),
          gap + i * (sheet.frameWidth * scale + gap),
          gap,
          scale,
        );
      });
      section.append(strip);
    }

    // Playback at the animation's frame rate.
    const play = el('canvas', 'strip');
    play.width = sheet.frameWidth * 3 + 8;
    play.height = sheet.frameHeight * 3 + 8;
    const pctx = play.getContext('2d')!;
    pctx.imageSmoothingEnabled = false;
    const start = performance.now();
    const tick = (now: number): void => {
      // rAF timestamps can precede `start` (frame begun before this call); clamp to 0.
      const elapsed = Math.max(0, now - start);
      const index = Math.floor((elapsed / 1000) * anim.fps) % anim.frames.length;
      fillBackdrop(pctx, backdrop, 4 + sheet.frameHeight * 3, 3);
      drawFrame(pctx, atlas, frameKey(sheet.id, name, index), 4, 4, 3);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    section.append(play);
  }
  return section;
}

/**
 * Dev-only review page: palette, background layers with seam check, parallax scroll views at
 * start and max speed, then every sprite sheet at 1x and 3x plus live playback.
 */
export function mountGallery(root: HTMLElement): void {
  const atlas = bakeAtlas(SHEETS);
  const baked = bakeBackground(generateBackground());
  const backdrop = el('canvas');
  backdrop.width = CONFIG.logicalWidth;
  backdrop.height = CONFIG.logicalHeight;
  drawBackground(backdrop.getContext('2d')!, baked, 0);
  const page = el('main', 'gallery');
  page.dataset.testid = 'gallery';
  page.append(
    el('h1', undefined, 'Tauren Runner - sprite gallery'),
    el('p', undefined, `Logical resolution ${CONFIG.logicalWidth} x ${CONFIG.logicalHeight}`),
    paletteSection(),
    layersSection(baked),
    scrollSection(baked, atlas),
  );
  for (const sheet of SHEETS) page.append(sheetSection(sheet, atlas, backdrop));
  root.replaceChildren(page);
}
