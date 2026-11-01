import { OFF, ON, type Grid } from './grid';

export interface Layer {
  readonly rows: Grid;
  readonly x: number;
  readonly y: number;
  /** `add` sets pixels (default); `cut` clears them (negative-space detail). */
  readonly mode?: 'add' | 'cut';
}

/**
 * Composes a frame from shared part grids (ORCHESTRATION R22). Layers apply in order.
 * A layer pixel that falls outside the canvas is an error rather than being clipped, so
 * misplaced parts fail loudly.
 */
export function compose(width: number, height: number, layers: readonly Layer[]): string[] {
  const cells: boolean[][] = Array.from({ length: height }, () =>
    Array<boolean>(width).fill(false),
  );
  for (const layer of layers) {
    const set = (layer.mode ?? 'add') === 'add';
    const rowWidth = layer.rows[0]?.length ?? 0;
    if (layer.rows.some((row) => row.length !== rowWidth)) {
      throw new RangeError('compose: layer rows have inconsistent widths');
    }
    layer.rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c += 1) {
        if (row[c] !== ON) continue;
        const px = layer.x + c;
        const py = layer.y + r;
        if (px < 0 || px >= width || py < 0 || py >= height) {
          throw new RangeError(`compose: pixel (${px}, ${py}) outside ${width}x${height}`);
        }
        cells[py]![px] = set;
      }
    });
  }
  return cells.map((row) => row.map((on) => (on ? ON : OFF)).join(''));
}

/**
 * Right-pads every row with `.` to `width`, so wide part grids can be authored without
 * trailing transparent pixels. A row longer than `width` is an error.
 */
export function pad(width: number, rows: Grid): string[] {
  return rows.map((row) => {
    if (row.length > width) throw new RangeError(`pad: row wider than ${width}: '${row}'`);
    return row.padEnd(width, OFF);
  });
}

/**
 * Scales a grid up by an integer factor (each art pixel becomes a factor x factor block).
 * Sprites are authored at half resolution and upscaled 2x, which keeps one consistent,
 * chunky pixel scale across all sprites (SPEC 4.4).
 */
export function upscale(rows: Grid, factor: number): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const wide = Array.from(row, (ch) => ch.repeat(factor)).join('');
    for (let i = 0; i < factor; i += 1) out.push(wide);
  }
  return out;
}
