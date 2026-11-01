import { CONFIG } from '../config';
import { ENEMIES } from '../content/entities';
import { enemyBox } from '../sim/enemies';
import type { SimEvent } from '../sim/events';
import type { World } from '../sim/world';
import type { SpriteSheet } from './art/grid';
import { chargeDustSheet, hitSparkSheet, shockwaveSheet } from './art/sprites/effects';

/** SPEC 9.2: floating combat text rises and fades over 0.8 s. */
export const FCT_LIFETIME_MS = 800;
export const FCT_RISE_PX = 24;
const MAX_FCT = 24;

/** Dust puffs are dropped this often behind a dashing player. */
const DUST_INTERVAL_MS = 50;

/** Where the ring's centre sits inside the shockwave frame (art x 40, y 11, doubled). */
const SHOCKWAVE_CENTRE = { x: 80, y: 22 };

export type FctKind = 'info' | 'rage';

export interface FloatingText {
  text: string;
  kind: FctKind;
  /** Logical px; the anchor drifts left with the ground. `y` is the baseline at age 0. */
  x: number;
  y: number;
  ageMs: number;
}

/** A one-shot sprite animation placed in the world (scrolls with the ground). */
export interface SpriteEffect {
  sheetId: string;
  animation: string;
  fps: number;
  count: number;
  /** Top-left of the frame. */
  x: number;
  y: number;
  ageMs: number;
}

function template(sheet: SpriteSheet, animation: string) {
  const anim = sheet.animations[animation];
  if (!anim) throw new Error(`Missing animation: ${sheet.id}/${animation}`);
  return { sheetId: sheet.id, animation, fps: anim.fps, count: anim.frames.length };
}

const SHOCKWAVE = template(shockwaveSheet, 'burst');
const DUST = template(chargeDustSheet, 'trail');
const SPARK = template(hitSparkSheet, 'burst');

/** Frame to draw at `ageMs`, or null once the one-shot animation is over. */
export function effectFrame(e: Pick<SpriteEffect, 'fps' | 'count' | 'ageMs'>): number | null {
  const index = Math.floor((e.ageMs / 1000) * e.fps);
  return index < e.count ? index : null;
}

/** Floating text opacity and upward offset at its age. */
export function fctLook(ageMs: number): { alpha: number; rise: number } {
  const t = Math.min(1, Math.max(0, ageMs / FCT_LIFETIME_MS));
  return { alpha: 1 - t, rise: FCT_RISE_PX * t };
}

/**
 * Presentation-only effect state: floating combat text and one-shot sprite effects. Fed with the
 * sim's events, never mutates the sim (SPEC 4.2).
 */
export interface Effects {
  readonly text: readonly FloatingText[];
  readonly sprites: readonly SpriteEffect[];
  handle(events: readonly SimEvent[], world: World): void;
  /** Advances ages and scrolls everything left with the ground; spawns the Charge dust trail. */
  update(dtMs: number, world: World): void;
  clear(): void;
}

export function createEffects(): Effects {
  let text: FloatingText[] = [];
  let sprites: SpriteEffect[] = [];
  let dustMs = 0;

  const addText = (t: Omit<FloatingText, 'ageMs'>): void => {
    text.push({ ...t, ageMs: 0 });
    if (text.length > MAX_FCT) text = text.slice(-MAX_FCT);
  };

  return {
    get text() {
      return text;
    },
    get sprites() {
      return sprites;
    },

    handle(events, world) {
      // A Charge hit gives +25 and the kill Rage at the same spot: show one summed number.
      const surges = new Map<string, { amount: number; x: number; y: number }>();

      for (const ev of events) {
        switch (ev.type) {
          case 'StompUsed':
            sprites.push({
              ...SHOCKWAVE,
              x: ev.x - SHOCKWAVE_CENTRE.x,
              y: CONFIG.groundY - SHOCKWAVE_CENTRE.y,
              ageMs: 0,
            });
            break;
          case 'ChargeHit': {
            const def = ENEMIES[ev.kind];
            const centreY = CONFIG.groundY - def.bottom - def.h / 2;
            sprites.push({ ...SPARK, x: ev.x - 12, y: centreY - 12, ageMs: 0 });
            break;
          }
          case 'EnemyStunned': {
            const enemy = world.enemies.find((e) => e.id === ev.id);
            if (!enemy) break;
            const box = enemyBox(enemy);
            // Above the stun swirl (16 px tall, 2 px gap).
            addText({ text: 'Stunned', kind: 'info', x: box.x + box.w / 2, y: box.y - 22 });
            break;
          }
          case 'RageSurge': {
            const key = `${ev.x}|${ev.y}`;
            const existing = surges.get(key);
            if (existing) existing.amount += ev.amount;
            else surges.set(key, { amount: ev.amount, x: ev.x, y: ev.y });
            break;
          }
          case 'AbilityError': {
            if (ev.reason !== 'Immune') break;
            const front = world.player.x + CONFIG.player.hitbox.w / 2;
            let nearest: (typeof world.enemies)[number] | null = null;
            for (const e of world.enemies) {
              if (e.defeated || !ENEMIES[e.kind].chargeImmune || e.x < front) continue;
              if (!nearest || e.x < nearest.x) nearest = e;
            }
            if (nearest) {
              const box = enemyBox(nearest);
              addText({ text: 'Immune', kind: 'info', x: box.x + box.w / 2, y: box.y - 8 });
            }
            break;
          }
          default:
            break;
        }
      }
      for (const s of surges.values()) {
        addText({ text: `+${s.amount} Rage`, kind: 'rage', x: s.x, y: s.y });
      }
    },

    update(dtMs, world) {
      const drift = (world.speed * dtMs) / 1000;
      for (const t of text) {
        t.ageMs += dtMs;
        t.x -= drift;
      }
      text = text.filter((t) => t.ageMs < FCT_LIFETIME_MS);

      for (const s of sprites) {
        s.ageMs += dtMs;
        s.x -= drift;
      }
      sprites = sprites.filter((s) => effectFrame(s) !== null);

      if (world.player.state === 'Charging') {
        dustMs -= dtMs;
        if (dustMs <= 0) {
          dustMs = DUST_INTERVAL_MS;
          const { w } = CONFIG.player.hitbox;
          sprites.push({
            ...DUST,
            x: world.player.x - w / 2 - 40,
            y: CONFIG.groundY - 24,
            ageMs: 0,
          });
        }
      } else {
        dustMs = 0;
      }
    },

    clear() {
      text = [];
      sprites = [];
      dustMs = 0;
    },
  };
}
