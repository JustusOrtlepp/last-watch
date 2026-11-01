import { CONFIG } from '../../../src/config';
import type { SimEvent } from '../../../src/sim/events';
import { NO_INPUT, type SimInput } from '../../../src/sim/player';
import { stepWorld, type World } from '../../../src/sim/world';

export type InputFn = (tick: number) => SimInput;

/** Steps `ticks` ticks; `input` is a constant or a function of the local tick index (0-based). */
export function run(world: World, ticks: number, input: SimInput | InputFn = NO_INPUT): void {
  for (let i = 0; i < ticks; i++) {
    stepWorld(world, typeof input === 'function' ? input(i) : input);
  }
}

export function eventCount(world: World, type: SimEvent['type']): number {
  return world.events.filter((e) => e.type === type).length;
}

/** Height of the player's feet above the ground line (0 when grounded). */
export function heightAboveGround(world: World): number {
  return CONFIG.groundY - world.player.feetY;
}

/** Steps while `input(i)` is applied and returns the highest point reached (px above ground). */
export function peakHeight(world: World, ticks: number, input: InputFn): number {
  let peak = 0;
  for (let i = 0; i < ticks; i++) {
    stepWorld(world, input(i));
    peak = Math.max(peak, heightAboveGround(world));
  }
  return peak;
}
