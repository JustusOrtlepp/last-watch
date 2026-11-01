import { CONFIG } from '../config';

export interface Renderer {
  readonly ctx: CanvasRenderingContext2D;
  /** Re-fits the canvas to its container and redraws. */
  resize(): void;
  redraw(): void;
}

/**
 * Canvas at the logical resolution (SPEC 4.3): scales to container width preserving aspect
 * ratio, accounts for devicePixelRatio, and keeps pixel art crisp.
 */
export function createRenderer(
  canvas: HTMLCanvasElement,
  draw: (ctx: CanvasRenderingContext2D) => void,
): Renderer {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const { logicalWidth, logicalHeight } = CONFIG;

  const redraw = (): void => {
    ctx.imageSmoothingEnabled = false;
    draw(ctx);
  };

  const resize = (): void => {
    const cssWidth = canvas.clientWidth;
    if (cssWidth <= 0) return;
    const width = Math.max(1, Math.round(cssWidth * (window.devicePixelRatio || 1)));
    const height = Math.max(1, Math.round((width * logicalHeight) / logicalWidth));
    canvas.width = width;
    canvas.height = height;
    ctx.setTransform(width / logicalWidth, 0, 0, height / logicalHeight, 0, 0);
    redraw();
  };

  new ResizeObserver(resize).observe(canvas);
  resize();
  return { ctx, resize, redraw };
}
