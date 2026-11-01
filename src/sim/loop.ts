import { CONFIG } from '../config';
import type { SimInput } from './player';
import { stepWorld, type World } from './world';

/** Fixed-timestep accumulator (SPEC 4.2): 60 Hz sim, render every animation frame. */
export interface Stepper {
  accMs: number;
}

export function createStepper(): Stepper {
  return { accMs: 0 };
}

/** Float slack so 60 frames of 1000/60 ms always yield 60 ticks. */
const STEP_EPSILON_MS = 1e-6;

/**
 * Feeds `deltaMs` of wall time into the sim. The delta is clamped to `maxFrameDeltaMs` to avoid a
 * spiral of death after a tab switch. Returns the number of ticks simulated.
 */
export function advance(world: World, stepper: Stepper, deltaMs: number, input: SimInput): number {
  const stepMs = 1000 / CONFIG.simHz;
  stepper.accMs += Math.min(Math.max(deltaMs, 0), CONFIG.maxFrameDeltaMs);
  let ticks = 0;
  while (stepper.accMs >= stepMs - STEP_EPSILON_MS) {
    stepWorld(world, input);
    stepper.accMs -= stepMs;
    ticks++;
  }
  if (stepper.accMs < 0) stepper.accMs = 0;
  return ticks;
}
