/**
 * 1-bit pixel grid format (SPEC 4.4): one string per row, `#` = black, `.` = transparent.
 */
export const ON = '#';
export const OFF = '.';

export type Grid = readonly string[];

export interface Animation {
  readonly fps: number;
  readonly frames: readonly Grid[];
}

export interface SpriteSheet {
  readonly id: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly animations: Readonly<Record<string, Animation>>;
}

/** Returns a list of problems with one frame; empty means the frame is valid. */
export function validateFrame(rows: Grid, width: number, height: number): string[] {
  const errors: string[] = [];
  if (rows.length !== height) {
    errors.push(`expected ${height} rows, found ${rows.length}`);
  }
  let pixels = 0;
  rows.forEach((row, y) => {
    if (row.length !== width) {
      errors.push(`row ${y}: expected width ${width}, found ${row.length}`);
    }
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x];
      if (ch === ON) pixels += 1;
      else if (ch !== OFF) errors.push(`row ${y}, col ${x}: illegal character '${ch}'`);
    }
  });
  if (pixels === 0) errors.push('frame has no pixels');
  return errors;
}

/** Returns a list of problems with a whole sheet; empty means every frame is valid. */
export function validateSheet(sheet: SpriteSheet): string[] {
  const errors: string[] = [];
  for (const [name, anim] of Object.entries(sheet.animations)) {
    if (anim.frames.length === 0) errors.push(`${sheet.id}/${name}: no frames`);
    if (!(anim.fps > 0)) errors.push(`${sheet.id}/${name}: fps must be > 0`);
    anim.frames.forEach((frame, i) => {
      for (const e of validateFrame(frame, sheet.frameWidth, sheet.frameHeight)) {
        errors.push(`${sheet.id}/${name}[${i}]: ${e}`);
      }
    });
  }
  return errors;
}
