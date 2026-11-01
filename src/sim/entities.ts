import { CONFIG } from '../config';
import { OBSTACLES, type ObstacleKind } from '../content/entities';
import type { Box } from './collision';

/** Static obstacle (SPEC 6.1). `x` is the left edge; the bottom sits on the ground line. */
export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  x: number;
}

export function obstacleBox(o: Obstacle): Box {
  const { w, h } = OBSTACLES[o.kind];
  return { x: o.x, y: CONFIG.groundY - h, w, h };
}

/** Scrolls obstacles left by `dx` and removes those fully off-screen (in place, no allocation). */
export function scrollObstacles(obstacles: Obstacle[], dx: number): Obstacle[] {
  let n = 0;
  for (const o of obstacles) {
    o.x -= dx;
    if (o.x + OBSTACLES[o.kind].w > 0) obstacles[n++] = o;
  }
  obstacles.length = n;
  return obstacles;
}
