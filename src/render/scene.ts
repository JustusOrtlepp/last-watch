import { CONFIG } from '../config';
import { ARROW, OBSTACLES } from '../content/entities';
import { checkCharge } from '../sim/abilities';
import { enemyBox, enemyVelocity, isTelegraphing, type Enemy } from '../sim/enemies';
import type { World } from '../sim/world';
import { generateBackground } from './art/background';
import { PALETTE } from './art/palette';
import { SHEETS } from './art/sprites';
import { enemyFrame, obstacleVariant, playerFrame, scrollPx } from './animation';
import { bakeBackground, drawBackground, type BakedLayer } from './background';
import { effectFrame, fctLook, type Effects } from './effects';
import { SHAKE_PX, type Particles } from './particles';
import { chargeDustSheet, stunSwirlSheet } from './art/sprites/effects';
import { bakeAtlas, drawFrame, frameKey, type Atlas } from './sprites';

const STUN_FPS = stunSwirlSheet.animations.spin!.fps;
const STUN_FRAMES = stunSwirlSheet.animations.spin!.frames.length;
/** Effects drawn under the Tauren (ground effects) and over everything (impact sparks). */
const BEHIND_PLAYER = ['shockwave', 'charge-dust'];
const IN_FRONT = ['hit-spark'];

/** Charge target marker: a red pointer above the nameplate position, outlined for contrast. */
const MARKER_RED = '#d7261e';
const MARKER_OUTLINE = '#140a06';
const FCT_FILL = { info: '#fff4e0', rage: '#ff6a55' } as const;
const FCT_FONT = 'bold 14px ui-monospace, "Courier New", monospace';

export interface SceneAssets {
  readonly atlas: Atlas;
  readonly background: readonly BakedLayer[];
}

/** Bakes the signed-off art once: sprite atlas and background layers. */
export function createAssets(): SceneAssets {
  return { atlas: bakeAtlas(SHEETS), background: bakeBackground(generateBackground()) };
}

export interface SceneView {
  world: World;
  /** Title screen: static ground, idle Tauren, no obstacles. */
  title: boolean;
  /** True only while the sim is advancing, so sub-tick extrapolation is applied. */
  running: boolean;
  /** Fixed-step accumulator remainder (ms), used to extrapolate motion between ticks. */
  alphaMs: number;
  /** Ms since the player died. */
  sinceDeathMs: number;
  /** Free-running clock (ms) for the idle animation. */
  clockMs: number;
  /** Floating text and one-shot sprite effects. */
  fx: Effects;
  /** Dust particles, ambient motes and the screen-shake offset. */
  particles: Particles;
  /** Draw the drifting dust motes (off with reduced motion). */
  motes: boolean;
}

/** On-screen shift (px) of an enemy since the last tick: its own velocity, extrapolated. */
function enemyShift(e: Enemy, speed: number, extraSec: number): number {
  const velocity = e.defeated ? speed - CONFIG.enemy.knockbackSpeed : enemyVelocity(e, speed);
  return -velocity * extraSec;
}

function drawEnemies(
  ctx: CanvasRenderingContext2D,
  assets: SceneAssets,
  view: SceneView,
  extraSec: number,
): void {
  const { world } = view;
  const target = view.running ? chargeTarget(world) : null;
  for (const e of world.enemies) {
    if (isTelegraphing(e)) {
      drawTelegraph(ctx, assets, view.clockMs);
      continue;
    }
    const sinceShot = e.fireMs > 0 ? CONFIG.enemy.arrowIntervalMs - e.fireMs : undefined;
    const key = enemyFrame(e.kind, e.stunMs > 0, e.defeated, view.clockMs, sinceShot);
    const rect = assets.atlas.layout.frames[key]!;
    const box = enemyBox(e);
    const left = box.x + enemyShift(e, world.speed, extraSec);
    const x = Math.round(left + box.w / 2 - rect.w / 2);
    const y = Math.round(box.y + box.h - rect.h);

    if (e.defeated) ctx.globalAlpha = Math.max(0, e.fadeMs / CONFIG.enemy.defeatFadeMs);
    drawFrame(ctx, assets.atlas, key, x, y);
    ctx.globalAlpha = 1;

    const centre = Math.round(left + box.w / 2);
    if (e.stunMs > 0 && !e.defeated) {
      const swirl = Math.floor((view.clockMs / 1000) * STUN_FPS) % STUN_FRAMES;
      drawFrame(
        ctx,
        assets.atlas,
        frameKey('stun-swirl', 'spin', swirl),
        centre - 16,
        Math.round(box.y) - 18,
      );
    }
    if (target === e) {
      drawTargetMarker(ctx, centre, Math.round(box.y) - (e.stunMs > 0 ? 24 : 8), view.clockMs);
    }
  }
}

/** Dust cloud on the right screen edge: a fast enemy is about to run in (SPEC 6.2). */
function drawTelegraph(ctx: CanvasRenderingContext2D, assets: SceneAssets, clockMs: number): void {
  const anim = chargeDustSheet.animations.trail!;
  const index = Math.floor((clockMs / 1000) * anim.fps) % anim.frames.length;
  const key = frameKey('charge-dust', 'trail', index);
  const rect = assets.atlas.layout.frames[key]!;
  drawFrame(ctx, assets.atlas, key, CONFIG.logicalWidth - rect.w, CONFIG.groundY - rect.h);
}

function drawArrows(
  ctx: CanvasRenderingContext2D,
  assets: SceneAssets,
  world: World,
  extraSec: number,
): void {
  const velocity = world.speed + ARROW.speed;
  const key = frameKey('arrow', 'fly', 0);
  for (const a of world.arrows) {
    const x = Math.round(a.x - velocity * extraSec);
    drawFrame(ctx, assets.atlas, key, x, CONFIG.groundY - ARROW.bottom - ARROW.h);
  }
}

/** The enemy Charge would hit right now, if any (SPEC 5.2). */
function chargeTarget(world: World): Enemy | null {
  const p = world.player;
  if (p.state === 'Dead' || p.state === 'Charging') return null;
  const check = checkCharge(p, world.enemies);
  return check.ok ? check.target : null;
}

function drawTargetMarker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  y: number,
  clockMs: number,
): void {
  const bob = Math.round(Math.sin(clockMs / 160) * 2);
  const top = y - 12 + bob;
  ctx.fillStyle = MARKER_OUTLINE;
  ctx.beginPath();
  ctx.moveTo(cx - 9, top - 1);
  ctx.lineTo(cx + 9, top - 1);
  ctx.lineTo(cx, top + 13);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = MARKER_RED;
  ctx.beginPath();
  ctx.moveTo(cx - 6, top + 2);
  ctx.lineTo(cx + 6, top + 2);
  ctx.lineTo(cx, top + 10);
  ctx.closePath();
  ctx.fill();
}

function drawSprites(
  ctx: CanvasRenderingContext2D,
  assets: SceneAssets,
  fx: Effects,
  ids: readonly string[],
): void {
  for (const s of fx.sprites) {
    const frame = effectFrame(s);
    if (frame === null || !ids.includes(s.sheetId)) continue;
    const key = frameKey(s.sheetId, s.animation, frame);
    drawFrame(ctx, assets.atlas, key, Math.round(s.x), Math.round(s.y));
  }
}

function drawMotes(ctx: CanvasRenderingContext2D, particles: Particles): void {
  ctx.fillStyle = PALETTE.skyHazeTop.hex;
  for (const m of particles.motes) {
    ctx.fillRect(Math.round(m.x), Math.round(m.y), m.size, m.size);
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particles): void {
  ctx.fillStyle = PALETTE.groundDustSpecks.hex;
  for (const p of particles.pool) {
    if (!p.active) continue;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
}

function drawFloatingText(ctx: CanvasRenderingContext2D, fx: Effects): void {
  if (fx.text.length === 0) return;
  ctx.font = FCT_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = MARKER_OUTLINE;
  for (const t of fx.text) {
    const { alpha, rise } = fctLook(t.ageMs);
    ctx.globalAlpha = alpha;
    const y = Math.round(t.y - rise);
    ctx.strokeText(t.text, Math.round(t.x), y);
    ctx.fillStyle = FCT_FILL[t.kind];
    ctx.fillText(t.text, Math.round(t.x), y);
  }
  ctx.globalAlpha = 1;
}

/** Draws one frame at the logical resolution: background, obstacles, enemies, Tauren, effects. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  assets: SceneAssets,
  view: SceneView,
): void {
  const { world } = view;
  // Backing fill at the identity transform, so a shaken camera never exposes the bare canvas.
  ctx.fillStyle = PALETTE.skyHazeTop.hex;
  ctx.fillRect(0, 0, CONFIG.logicalWidth, CONFIG.logicalHeight);
  ctx.fillStyle = PALETTE.groundStrip.hex;
  ctx.fillRect(0, CONFIG.groundY, CONFIG.logicalWidth, CONFIG.logicalHeight - CONFIG.groundY);

  ctx.save();
  if (view.running) ctx.translate(view.particles.shakeX, view.particles.shakeY);

  const extra = view.running ? view.alphaMs / 1000 : 0;
  const scroll = scrollPx(world.rage.distanceRage) + world.speed * extra;
  drawBackground(ctx, assets.background, view.title ? 0 : scroll, SHAKE_PX);
  if (view.motes) drawMotes(ctx, view.particles);

  if (!view.title) {
    for (const o of world.obstacles) {
      const key = frameKey(o.kind, 'variants', obstacleVariant(o.kind, o.id));
      const x = Math.round(o.x - world.speed * extra);
      drawFrame(ctx, assets.atlas, key, x, CONFIG.groundY - OBSTACLES[o.kind].h);
    }
    drawEnemies(ctx, assets, view, extra);
    drawArrows(ctx, assets, world, extra);
    drawSprites(ctx, assets, view.fx, BEHIND_PLAYER);
    drawParticles(ctx, view.particles);
  }

  const p = world.player;
  const key = playerFrame({
    state: p.state,
    vy: p.vy,
    scroll,
    sinceDeathMs: view.sinceDeathMs,
    clockMs: view.clockMs,
    idle: view.title,
    lockMs: p.lockMs,
    dashMs: p.dashMs,
  });
  const feetY = p.state === 'Airborne' ? Math.min(CONFIG.groundY, p.feetY + p.vy * extra) : p.feetY;
  const rect = assets.atlas.layout.frames[key]!;
  drawFrame(ctx, assets.atlas, key, Math.round(p.x - rect.w / 2), Math.round(feetY - rect.h));

  if (!view.title) {
    drawSprites(ctx, assets, view.fx, IN_FRONT);
    drawFloatingText(ctx, view.fx);
  }
  ctx.restore();
}
