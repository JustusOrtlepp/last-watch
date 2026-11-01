import type { EnemyKind, ObstacleKind } from './entities';

/** Anything the spawner can place: a static obstacle or an enemy. */
export type HazardKind = ObstacleKind | EnemyKind;

/** SPEC 7.2 tutorial hints: shown once per browser, in-world, without pausing. */
export const HINT_TEXT = {
  jump: 'Press Space to jump',
  charge: 'Press Q to Charge an enemy',
  stomp: "Kodo can't be jumped. Press E to War Stomp!",
  harpyMid: 'Harpy at head height - Stomp or Charge it',
} as const;

export type HintId = keyof typeof HINT_TEXT;

export const HINT_IDS = Object.keys(HINT_TEXT) as readonly HintId[];

/**
 * SPEC 7.2 tier table. A tier unlocks when `distanceRage` reaches `fromRage` (the continuous
 * component only, so every run meets each tier at the same distance). `intro` names the forced
 * first encounter after the unlock; its first hazard carries the tutorial `hint`.
 */
export const TIERS = [
  { fromRage: 0, intro: 'intro-jump' },
  { fromRage: 300, intro: 'intro-charge' },
  { fromRage: 700, intro: 'intro-stomp' },
  { fromRage: 1200, intro: undefined },
  { fromRage: 1800, intro: 'intro-harpy-mid' },
  { fromRage: 2500, intro: undefined },
  { fromRage: 3500, intro: undefined },
] as const satisfies readonly { fromRage: number; intro: string | undefined }[];

/** Index of the highest tier unlocked at `distanceRage`. */
export function tierAt(distanceRage: number): number {
  let tier = 0;
  for (let i = 0; i < TIERS.length; i++) {
    if (distanceRage >= TIERS[i]!.fromRage) tier = i;
  }
  return tier;
}

/** Spacing from the previous item, as a multiple of the comfort gap (`CONFIG.spawn.gapMult`). */
export type Spacing = 'tight' | 'normal' | 'wide';

export interface EncounterItem {
  kind: HazardKind;
  /** Thornbush cluster size (SPEC 6.1: single, or a cluster of 2-3). Default 1. */
  count?: 1 | 2 | 3;
  /** Spacing from the previous item of the encounter. Default `normal`. */
  gap?: Spacing;
}

/**
 * A short authored pattern (SPEC 7.3). `tier` is the index into `TIERS` at which it joins the pool;
 * `weight` is its relative chance among the unlocked encounters. An `intro` encounter is never drawn
 * at random: it is forced once, right after its tier unlocks, and tags the hint to show.
 */
export interface Encounter {
  id: string;
  tier: number;
  weight: number;
  items: readonly EncounterItem[];
  intro?: HintId;
}

const one = (kind: HazardKind, gap?: Spacing): EncounterItem => (gap ? { kind, gap } : { kind });

export const ENCOUNTERS: readonly Encounter[] = [
  // Tier 0: thornbush, boulder.
  { id: 'intro-jump', tier: 0, weight: 0, intro: 'jump', items: [one('thornbush')] },
  { id: 'thorn', tier: 0, weight: 4, items: [one('thornbush')] },
  { id: 'thorn-cluster-2', tier: 0, weight: 3, items: [{ kind: 'thornbush', count: 2 }] },
  { id: 'thorn-cluster-3', tier: 0, weight: 2, items: [{ kind: 'thornbush', count: 3 }] },
  { id: 'boulder', tier: 0, weight: 4, items: [one('boulder')] },
  { id: 'thorn-boulder', tier: 0, weight: 2, items: [one('thornbush'), one('boulder', 'tight')] },
  {
    id: 'boulder-thorn-cluster',
    tier: 0,
    weight: 2,
    items: [one('boulder'), { kind: 'thornbush', count: 2, gap: 'tight' }],
  },

  // Tier 1 (300): totem pole, Quilboar.
  { id: 'intro-charge', tier: 1, weight: 0, intro: 'charge', items: [one('quilboar')] },
  { id: 'totem', tier: 1, weight: 3, items: [one('totem')] },
  { id: 'quilboar', tier: 1, weight: 4, items: [one('quilboar')] },
  { id: 'quilboar-thorn', tier: 1, weight: 3, items: [one('quilboar'), one('thornbush', 'tight')] },
  { id: 'totem-quilboar', tier: 1, weight: 2, items: [one('totem'), one('quilboar')] },
  { id: 'quilboar-pair', tier: 1, weight: 2, items: [one('quilboar'), one('quilboar')] },

  // Tier 2 (700): Kodo (stomp required).
  { id: 'intro-stomp', tier: 2, weight: 0, intro: 'stomp', items: [one('kodo')] },
  { id: 'kodo', tier: 2, weight: 3, items: [one('kodo')] },
  { id: 'boulder-kodo', tier: 2, weight: 2, items: [one('boulder'), one('kodo')] },
  { id: 'kodo-thorn', tier: 2, weight: 2, items: [one('kodo'), one('thornbush', 'wide')] },
  { id: 'quilboar-kodo', tier: 2, weight: 2, items: [one('quilboar'), one('kodo')] },

  // Tier 3 (1200): Plainstrider, Harpy (low / high).
  { id: 'plainstrider', tier: 3, weight: 3, items: [one('plainstrider')] },
  { id: 'harpy-low', tier: 3, weight: 3, items: [one('harpyLow')] },
  { id: 'harpy-high', tier: 3, weight: 3, items: [one('harpyHigh')] },
  {
    id: 'boulder-harpy-high',
    tier: 3,
    weight: 2,
    items: [one('boulder'), one('harpyHigh', 'wide')],
  },
  { id: 'harpy-high-totem', tier: 3, weight: 2, items: [one('harpyHigh'), one('totem', 'wide')] },
  { id: 'thorn-plainstrider', tier: 3, weight: 2, items: [one('thornbush'), one('plainstrider')] },
  { id: 'harpy-low-quilboar', tier: 3, weight: 2, items: [one('harpyLow'), one('quilboar')] },

  // Tier 4 (1800): Harpy (mid) - stomp or Charge.
  { id: 'intro-harpy-mid', tier: 4, weight: 0, intro: 'harpyMid', items: [one('harpyMid')] },
  { id: 'harpy-mid', tier: 4, weight: 3, items: [one('harpyMid')] },
  { id: 'quilboar-harpy-mid', tier: 4, weight: 2, items: [one('quilboar'), one('harpyMid')] },
  { id: 'harpy-mid-thorn', tier: 4, weight: 2, items: [one('harpyMid'), one('thornbush', 'wide')] },

  // Tier 5 (2500): Centaur Archer.
  { id: 'centaur', tier: 5, weight: 3, items: [one('centaur')] },
  { id: 'boulder-centaur', tier: 5, weight: 2, items: [one('boulder'), one('centaur')] },
  { id: 'centaur-thorn', tier: 5, weight: 2, items: [one('centaur'), one('thornbush', 'wide')] },

  // Tier 6 (3500): mixed packs of 2-3 enemies.
  {
    id: 'pack-quilboar-3',
    tier: 6,
    weight: 3,
    items: [one('quilboar'), one('quilboar', 'tight'), one('quilboar', 'tight')],
  },
  {
    id: 'pack-quilboar-harpy-thorn',
    tier: 6,
    weight: 3,
    items: [one('quilboar'), one('harpyLow'), one('thornbush')],
  },
  {
    id: 'pack-plainstrider-quilboar',
    tier: 6,
    weight: 3,
    items: [one('plainstrider'), one('quilboar')],
  },
  {
    id: 'pack-harpy-mid-quilboar-boulder',
    tier: 6,
    weight: 3,
    items: [one('harpyMid'), one('quilboar'), one('boulder')],
  },
  {
    id: 'pack-harpy-high-quilboar',
    tier: 6,
    weight: 2,
    items: [one('harpyHigh'), one('quilboar', 'wide'), one('thornbush')],
  },
  {
    id: 'pack-kodo-plainstrider',
    tier: 6,
    weight: 2,
    items: [one('kodo'), one('plainstrider', 'wide')],
  },
  {
    id: 'pack-centaur-quilboar',
    tier: 6,
    weight: 2,
    items: [one('centaur'), one('quilboar', 'wide')],
  },
];

/** The lone-thornbush encounter: always placeable, used when every draw is rejected. */
export const FALLBACK_ENCOUNTER_ID = 'thorn';
