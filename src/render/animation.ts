import { CONFIG } from '../config';
import type { EnemyKind, ObstacleKind } from '../content/entities';
import type { PlayerState } from '../sim/player';
import type { SpriteSheet } from './art/grid';
import { boulderSheet } from './art/sprites/boulder';
import { centaurSheet } from './art/sprites/centaur';
import { harpySheet } from './art/sprites/harpy';
import { kodoSheet } from './art/sprites/kodo';
import { plainstriderSheet } from './art/sprites/plainstrider';
import { quilboarSheet } from './art/sprites/quilboar';
import { taurenSheet } from './art/sprites/tauren';
import { thornbushSheet } from './art/sprites/thornbush';
import { totemSheet } from './art/sprites/totem';
import { frameKey } from './sprites';

/** One run frame per this many px of ground scroll: planted hooves do not slide (DECISIONS P1a). */
export const RUN_STRIDE_PX = 6;

function count(
  sheet: { animations: Readonly<Record<string, { frames: readonly unknown[] }>> },
  name: string,
): number {
  const anim = sheet.animations[name];
  if (!anim) throw new Error(`Missing animation: ${name}`);
  return anim.frames.length;
}

const RUN_FRAMES = count(taurenSheet, 'run');
const STOMP_FRAMES = count(taurenSheet, 'stomp');
const CHARGE_FRAMES = count(taurenSheet, 'charge');
const IDLE_FRAMES = count(taurenSheet, 'idle');
const DEATH_FRAMES = count(taurenSheet, 'death');
const IDLE_FPS = taurenSheet.animations.idle!.fps;
const DEATH_FPS = taurenSheet.animations.death!.fps;

const VARIANTS: Readonly<Record<ObstacleKind, number>> = {
  thornbush: count(thornbushSheet, 'variants'),
  boulder: count(boulderSheet, 'variants'),
  totem: count(totemSheet, 'variants'),
};

/** Distance scrolled so far in px (the sim stores it as distance Rage). */
export function scrollPx(distanceRage: number): number {
  return distanceRage * CONFIG.rage.pxPerRage;
}

export function runFrameIndex(scroll: number): number {
  return Math.floor(Math.max(0, scroll) / RUN_STRIDE_PX) % RUN_FRAMES;
}

export function idleFrameIndex(clockMs: number): number {
  return Math.floor((Math.max(0, clockMs) / 1000) * IDLE_FPS) % IDLE_FRAMES;
}

/** The death animation plays once and holds its last frame. */
export function deathFrameIndex(sinceDeathMs: number): number {
  return Math.min(DEATH_FRAMES - 1, Math.floor((Math.max(0, sinceDeathMs) / 1000) * DEATH_FPS));
}

/** Jump sheet: frame 0 = rising, frame 1 = falling. */
export function jumpFrameIndex(vy: number): number {
  return vy < 0 ? 0 : 1;
}

/** Plays a one-shot animation of `frames` frames over a timer that counts down from `totalMs`. */
function progressFrame(leftMs: number, totalMs: number, frames: number): number {
  const done = 1 - Math.min(1, Math.max(0, leftMs / totalMs));
  return Math.min(frames - 1, Math.floor(done * frames));
}

/** War Stomp frames play across the 0.15 s animation lock. */
export function stompFrameIndex(lockMs: number): number {
  return progressFrame(lockMs, CONFIG.stomp.lockMs, STOMP_FRAMES);
}

/** Charge frames play across the dash. */
export function chargeFrameIndex(dashMs: number): number {
  return progressFrame(dashMs, CONFIG.charge.dashMs, CHARGE_FRAMES);
}

/** Which look of an obstacle kind to draw; deterministic from the obstacle id. */
export function obstacleVariant(kind: ObstacleKind, id: number): number {
  return id % VARIANTS[kind];
}

export interface PlayerPose {
  state: PlayerState;
  vy: number;
}

export interface PlayerAnimationInput extends PlayerPose {
  /** Total ground scroll in px. */
  scroll: number;
  /** Ms since the player died (only used while Dead). */
  sinceDeathMs: number;
  /** Free-running clock in ms (idle animation). */
  clockMs: number;
  /** True on the title screen: idle instead of run. */
  idle: boolean;
  /** War Stomp lock left / Charge dash left in ms (default 0). */
  lockMs?: number;
  dashMs?: number;
}

interface EnemyArt {
  sheet: SpriteSheet;
  /** Looping animation while moving. */
  move: string;
  /** Pose held while stunned: animation and frame. */
  stunned: readonly [string, number];
  /** Pose held while defeated (the Kodo is immune to Charge, so it reuses its kneel). */
  defeated: readonly [string, number];
  /** One-shot attack animation (Centaur shoot), played from the moment it fires. */
  attack?: string;
}

const HARPY_ART: EnemyArt = {
  sheet: harpySheet,
  move: 'flap',
  stunned: ['stunned', 0],
  defeated: ['defeated', 0],
};

/** Which sheet and animations draw each enemy kind (the three harpy heights share one sheet). */
const ENEMY_ART: Readonly<Record<EnemyKind, EnemyArt>> = {
  quilboar: {
    sheet: quilboarSheet,
    move: 'walk',
    stunned: ['stunned', 0],
    defeated: ['defeated', 0],
  },
  plainstrider: {
    sheet: plainstriderSheet,
    move: 'run',
    stunned: ['stunned', 0],
    defeated: ['defeated', 0],
  },
  harpyLow: HARPY_ART,
  harpyMid: HARPY_ART,
  harpyHigh: HARPY_ART,
  centaur: {
    sheet: centaurSheet,
    move: 'idle',
    stunned: ['stunned', 0],
    defeated: ['defeated', 0],
    attack: 'shoot',
  },
  kodo: { sheet: kodoSheet, move: 'walk', stunned: ['kneel', 1], defeated: ['kneel', 1] },
};

/**
 * Atlas key of the enemy frame to draw (stunned and defeated poses are held, moves loop).
 * `sinceShotMs` is the time since the enemy fired, while its attack animation is still playing.
 */
export function enemyFrame(
  kind: EnemyKind,
  stunned: boolean,
  defeated: boolean,
  clockMs: number,
  sinceShotMs?: number,
): string {
  const art = ENEMY_ART[kind];
  if (defeated || stunned) {
    const [animation, index] = defeated ? art.defeated : art.stunned;
    return frameKey(art.sheet.id, animation, index);
  }
  if (art.attack !== undefined && sinceShotMs !== undefined && sinceShotMs >= 0) {
    const attack = art.sheet.animations[art.attack]!;
    const index = Math.floor((sinceShotMs / 1000) * attack.fps);
    if (index < attack.frames.length) return frameKey(art.sheet.id, art.attack, index);
  }
  const anim = art.sheet.animations[art.move]!;
  const index = Math.floor((Math.max(0, clockMs) / 1000) * anim.fps) % anim.frames.length;
  return frameKey(art.sheet.id, art.move, index);
}

/** Atlas key of the Tauren frame to draw. */
export function playerFrame(a: PlayerAnimationInput): string {
  if (a.idle) return frameKey('tauren', 'idle', idleFrameIndex(a.clockMs));
  if (a.state === 'Dead') return frameKey('tauren', 'death', deathFrameIndex(a.sinceDeathMs));
  if (a.state === 'Stomping') return frameKey('tauren', 'stomp', stompFrameIndex(a.lockMs ?? 0));
  if (a.state === 'Charging') return frameKey('tauren', 'charge', chargeFrameIndex(a.dashMs ?? 0));
  if (a.state === 'Airborne') return frameKey('tauren', 'jump', jumpFrameIndex(a.vy));
  return frameKey('tauren', 'run', runFrameIndex(a.scroll));
}
