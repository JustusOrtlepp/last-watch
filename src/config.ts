/**
 * Single source of truth for all tunable numbers (SPEC 11).
 * Values are starting points for playtesting; tests reference CONFIG, not literals.
 */
export const CONFIG = {
  logicalWidth: 960,
  logicalHeight: 270,
  groundY: 230,
  simHz: 60,
  maxFrameDeltaMs: 250,
  player: {
    homeX: 120,
    maxX: 480,
    hitbox: { w: 40, h: 52 },
    jumpVelocity: -820,
    gravity: 2400,
    shortHopVelocity: -400,
    fastFallMultiplier: 2,
    jumpBufferMs: 100,
    coyoteMs: 80,
    recoverSpeed: 160,
  },
  speed: { start: 360, accelPerSec: 6, max: 900 },
  gcdMs: 500,
  stomp: { cooldownMs: 10000, radius: 160, stunMs: 2000, lockMs: 150 },
  charge: { cooldownMs: 5000, minRange: 60, maxRange: 420, dashMs: 180 },
  // SPEC 5.2: error text shows 1.2 s (P3b); identical errors are throttled to 1 per 0.5 s.
  errors: { displayMs: 1200, throttleMs: 500 },
  // Charge-defeated enemies are knocked forward and fade out (SPEC 5.2); values are not in SPEC 11.
  // P4a: telegraphSec = Plainstrider dust cloud lead (SPEC 6.2); fallGravity = stunned mid harpy
  // fall (SPEC 6.3); shootMinRange / shootMaxRange / arrowIntervalMs = Centaur Archer (SPEC 6.2).
  enemy: {
    defeatFadeMs: 500,
    knockbackSpeed: 300,
    telegraphSec: 1,
    fallGravity: 2400,
    arrowIntervalMs: 1600,
    shootMinRange: 200,
    shootMaxRange: 700,
  },
  rage: { pxPerRage: 10, stompPerTarget: 5, chargeHit: 25 }, // kill/trample values: content/entities.ts
  progression: { milestoneEvery: 1000, maxLevel: 60 },
  // SPEC 9.1: Space/Enter restarts only after this debounce on the game-over screen.
  ui: { releaseDebounceMs: 500 },
  // SPEC 7.4: gapMinPx / reactionSec are rule 1. P4b (not in SPEC 11): firstGapPx = ground scroll
  // before the first hazard spawns; gapJitter = random extra gap between encounters; clusterGapPx =
  // space between thornbushes of a cluster; gapMult scales the "comfort" gap (a full jump plus
  // reactionSec of ground scroll) for the spacing named by an encounter item; stompExtraSec = the
  // "+ 1 s" of rule 3; attempts = encounter draws before falling back to a lone thornbush.
  spawn: {
    gapMinPx: 200,
    reactionSec: 0.35,
    firstGapPx: 600,
    gapJitter: 0.5,
    clusterGapPx: 8,
    gapMult: { tight: 1, normal: 1.25, wide: 1.6 },
    stompExtraSec: 1,
    attempts: 6,
  },
  // SPEC 8: how long the "Ding!" level-up toast stays up (P5a; not in SPEC 11).
  toast: { displayMs: 2500 },
  // SPEC 7.2: how long a first-encounter tutorial hint stays up (P4b; the game does not pause).
  hints: { displayMs: 4500 },
  // Background music (requested after P5a; not in SPEC 11): loop gain, fade on mute/unmute, and
  // the loop-seam crossfade (one bar: the track is 100 bpm, 60 s; its own fades are ~1-1.5 s).
  music: { volume: 0.35, fadeMs: 150, overlapSec: 2.4 },
  // SPEC 10.2 synthesized sound effects (P5b; not in SPEC 11): master gain, and the minimum gap
  // between two plays of the same effect (a War Stomp stuns several enemies at once).
  sfx: { volume: 0.5, minGapMs: 45 },
  // SPEC 4.4: contrast rule for the background in the gameplay band.
  art: { gameplayBandTopY: 60, minContrastVsBlack: 4.5, maxPaletteColours: 16 },
} as const;
