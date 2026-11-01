import type { HintId } from '../content/encounters';
import type { EnemyKind, ObstacleKind } from '../content/entities';

export type AbilityName = 'charge' | 'stomp';

/** SPEC 5.2 error rules. Text lives in `ABILITY_ERROR_TEXT` (abilities.ts). */
export const ABILITY_ERROR_REASONS = ['NotReady', 'OutOfRange', 'TooClose', 'Immune'] as const;
export type AbilityErrorReason = (typeof ABILITY_ERROR_REASONS)[number];

export type RageSource = 'stomp' | 'chargeHit' | 'kill' | 'trample';

/** How an enemy was defeated: Charge hit, trampled while stunned, or landed after a stunned fall. */
export type DefeatCause = 'charge' | 'trample' | 'fall';

/** Typed sim -> presentation events (SPEC 4.2). Presentation reads, never mutates sim state. */
export type SimEvent =
  | { type: 'PlayerJumped' }
  | { type: 'PlayerLanded' }
  | { type: 'PlayerDied'; cause: ObstacleKind | EnemyKind | 'arrow' }
  | { type: 'StompUsed'; x: number; stunned: number }
  | { type: 'ChargeStarted'; targetId: number; fromX: number }
  | { type: 'ChargeHit'; targetId: number; kind: EnemyKind; x: number }
  | { type: 'EnemyStunned'; id: number; kind: EnemyKind }
  | { type: 'EnemyDefeated'; id: number; kind: EnemyKind; cause: DefeatCause }
  | { type: 'ArrowFired'; id: number; x: number }
  /** A tier's first encounter spawned (SPEC 7.2): presentation shows the tutorial hint once. */
  | { type: 'HintTriggered'; hint: HintId }
  /** Rage surge at a world position (for floating combat text). */
  | { type: 'RageSurge'; amount: number; source: RageSource; x: number; y: number }
  | { type: 'AbilityError'; reason: AbilityErrorReason };
