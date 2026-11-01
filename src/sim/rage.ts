import { CONFIG } from '../config';
import type { Box } from './collision';
import type { RageSource, SimEvent } from './events';

/**
 * Rage is the score (SPEC 5.3). Two components: `distanceRage` (continuous, drives difficulty
 * tiers) and `combatRage` (surges, added from P3a). Only ever increases.
 */
export interface Rage {
  distanceRage: number;
  combatRage: number;
}

export function createRage(): Rage {
  return { distanceRage: 0, combatRage: 0 };
}

export function addDistance(rage: Rage, px: number): void {
  rage.distanceRage += px / CONFIG.rage.pxPerRage;
}

/** Combat surge (SPEC 5.3). Amounts must be positive: Rage only ever increases. */
export function addCombat(rage: Rage, amount: number): void {
  if (amount > 0) rage.combatRage += amount;
}

/** Displayed score: whole Rage points. */
export function totalRage(rage: Rage): number {
  return Math.floor(rage.distanceRage + rage.combatRage);
}

/** Adds a combat surge and announces it at the box centre (for floating combat text). */
export function surgeRage(
  rage: Rage,
  events: SimEvent[],
  amount: number,
  source: RageSource,
  box: Box,
): void {
  if (amount <= 0) return;
  addCombat(rage, amount);
  events.push({ type: 'RageSurge', amount, source, x: box.x + box.w / 2, y: box.y + box.h / 2 });
}
