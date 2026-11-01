import { CONFIG } from '../config';

/** SPEC 7.1: starts at 360 px/s, +6 px/s per second, capped at 900 px/s. */
export function speedAtTick(tick: number): number {
  const { start, accelPerSec, max } = CONFIG.speed;
  return Math.min(max, start + (accelPerSec * tick) / CONFIG.simHz);
}

/** First tick at which the speed ramp has reached the cap. */
const CAP_TICK = Math.ceil(
  ((CONFIG.speed.max - CONFIG.speed.start) * CONFIG.simHz) / CONFIG.speed.accelPerSec,
);

/**
 * Ground scroll (px) over the ticks `from` .. `to - 1`: exactly the sum of `speedAtTick(t) / simHz`
 * the world applies, in closed form. Used by the spawner to predict when a hazard reaches the player.
 */
export function groundDistance(from: number, to: number): number {
  if (to <= from) return 0;
  const { start, accelPerSec, max } = CONFIG.speed;
  const perTick = accelPerSec / CONFIG.simHz;
  const linearEnd = Math.min(to, CAP_TICK);
  let sum = 0;
  if (from < linearEnd) {
    const n = linearEnd - from;
    sum += n * start + (perTick * (from + linearEnd - 1) * n) / 2;
  }
  const cappedFrom = Math.max(from, CAP_TICK);
  if (to > cappedFrom) sum += (to - cappedFrom) * max;
  return sum / CONFIG.simHz;
}

/**
 * The tick at the end of which a thing spawned at the end of tick `startTick` has covered
 * `distancePx` towards the player, when it also walks at `ownSpeed` (px/s, relative to the ground).
 * Matches the world's per-tick movement (`x -= dx + ownSpeed / simHz`).
 */
export function travelEndTick(startTick: number, distancePx: number, ownSpeed = 0): number {
  if (distancePx <= 0) return startTick;
  const moved = (t: number): number =>
    groundDistance(startTick + 1, t + 1) + (ownSpeed * (t - startTick)) / CONFIG.simHz;
  let lo = startTick + 1;
  // The ground alone covers at least `start` px/s, so this bound always suffices.
  let hi = startTick + 2 + Math.ceil((distancePx * CONFIG.simHz) / CONFIG.speed.start);
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (moved(mid) >= distancePx) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
