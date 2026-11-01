/** Data-driven entity definitions (SPEC 4.2, 6). Hitbox sizes are logical pixels. */
export const OBSTACLES = {
  thornbush: { w: 24, h: 28 },
  boulder: { w: 40, h: 36 },
  totem: { w: 22, h: 56 },
} as const;

export type ObstacleKind = keyof typeof OBSTACLES;

export const OBSTACLE_KINDS = Object.keys(OBSTACLES) as readonly ObstacleKind[];

export interface EnemyDef {
  w: number;
  h: number;
  /** Hitbox bottom above the ground line. */
  bottom: number;
  /** Own speed (px/s) relative to the ground, toward the player (SPEC 6.2). */
  speed: number;
  /** War Stomp affects it (a high harpy is out of reach). */
  stompable: boolean;
  /** Charge can target it (a high harpy is out of reach). */
  chargeable: boolean;
  /** Charge fails with "Immune." (Kodo). */
  chargeImmune: boolean;
  /** Rage for a Charge kill (SPEC 6.4); 0 when immune. */
  chargeKillRage: number;
  /** Rage for trampling it while stunned, or for its fall (SPEC 6.4). */
  trampleRage: number;
  /** Falls to the ground when stunned and is defeated on landing (mid harpy, SPEC 6.3). */
  fallsWhenStunned: boolean;
  /** Fires arrows while 200-700 px ahead (Centaur Archer, SPEC 6.2). */
  shoots: boolean;
  /** Dust cloud at the right edge before it enters the screen (Plainstrider, SPEC 6.2). */
  telegraphed: boolean;
}

/** Centaur arrow (SPEC 6.2): 20 x 4 at h = 20, +300 px/s relative to the ground. */
export const ARROW = { w: 20, h: 4, bottom: 20, speed: 300 } as const;

/** SPEC 6.2 / 6.4. The three harpy heights are separate kinds. */
export const ENEMIES = {
  quilboar: {
    w: 40,
    h: 36,
    bottom: 0,
    speed: 60,
    stompable: true,
    chargeable: true,
    chargeImmune: false,
    chargeKillRage: 50,
    trampleRage: 25,
    fallsWhenStunned: false,
    shoots: false,
    telegraphed: false,
  },
  plainstrider: {
    w: 36,
    h: 48,
    bottom: 0,
    speed: 220,
    stompable: true,
    chargeable: true,
    chargeImmune: false,
    chargeKillRage: 75,
    trampleRage: 40,
    fallsWhenStunned: false,
    shoots: false,
    telegraphed: true,
  },
  harpyLow: {
    w: 40,
    h: 28,
    bottom: 10,
    speed: 80,
    stompable: true,
    chargeable: true,
    chargeImmune: false,
    chargeKillRage: 100,
    trampleRage: 50,
    fallsWhenStunned: false,
    shoots: false,
    telegraphed: false,
  },
  harpyMid: {
    w: 40,
    h: 28,
    bottom: 50,
    speed: 80,
    stompable: true,
    chargeable: true,
    chargeImmune: false,
    chargeKillRage: 100,
    trampleRage: 50,
    fallsWhenStunned: true,
    shoots: false,
    telegraphed: false,
  },
  harpyHigh: {
    w: 40,
    h: 28,
    bottom: 90,
    speed: 80,
    stompable: false,
    chargeable: false,
    chargeImmune: false,
    chargeKillRage: 100,
    trampleRage: 50,
    fallsWhenStunned: false,
    shoots: false,
    telegraphed: false,
  },
  centaur: {
    w: 48,
    h: 60,
    bottom: 0,
    speed: 0,
    stompable: true,
    chargeable: true,
    chargeImmune: false,
    chargeKillRage: 150,
    trampleRage: 75,
    fallsWhenStunned: false,
    shoots: true,
    telegraphed: false,
  },
  kodo: {
    w: 128,
    h: 120,
    bottom: 0,
    speed: 40,
    stompable: true,
    chargeable: true,
    chargeImmune: true,
    chargeKillRage: 0,
    trampleRage: 200,
    fallsWhenStunned: false,
    shoots: false,
    telegraphed: false,
  },
} as const satisfies Record<string, EnemyDef>;

export type EnemyKind = keyof typeof ENEMIES;

export const ENEMY_KINDS = Object.keys(ENEMIES) as readonly EnemyKind[];
