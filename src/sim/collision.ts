/** Axis-aligned box, top-left origin, screen coordinates (y grows downwards). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Strict overlap: boxes that merely touch do not collide. */
export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** True when the circle and the box share at least one point (touching counts). */
export function circleOverlapsBox(cx: number, cy: number, radius: number, box: Box): boolean {
  const nx = Math.max(box.x, Math.min(cx, box.x + box.w));
  const ny = Math.max(box.y, Math.min(cy, box.y + box.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= radius * radius;
}
