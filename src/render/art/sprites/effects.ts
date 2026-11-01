import { upscale } from '../compose';
import { OFF, ON, type Grid, type SpriteSheet } from '../grid';

/**
 * Effects (SPEC 4.4). Authored at half resolution like every sprite and upscaled 2x.
 * The shapes are geometric (rings, ellipses, rays), so they are rasterized from small
 * shape descriptions instead of typed out; the output is the same 1-bit grid format.
 */
type Shape = (x: number, y: number) => boolean;

/** Rasterizes shapes at pixel centres into a half-resolution grid, then upscales 2x. */
function draw(width: number, height: number, shapes: readonly Shape[]): string[] {
  const rows: string[] = [];
  for (let y = 0; y < height; y += 1) {
    let row = '';
    for (let x = 0; x < width; x += 1) {
      row += shapes.some((s) => s(x + 0.5, y + 0.5)) ? ON : OFF;
    }
    rows.push(row);
  }
  return upscale(rows, 2);
}

const disc =
  (cx: number, cy: number, r: number): Shape =>
  (x, y) =>
    Math.hypot(x - cx, y - cy) <= r;

/** One-pixel circle outline: a dust puff with a transparent middle. */
const puff =
  (cx: number, cy: number, r: number): Shape =>
  (x, y) => {
    const d = Math.hypot(x - cx, y - cy);
    return d <= r && d > r - 1;
  };

/**
 * Flat ellipse outline (a ring on the ground seen from the side). With `dashes` > 0 each
 * half (left/right, mirrored) is cut into that many angular segments and only every
 * `keep`-th one is drawn.
 */
const ellipse =
  (cx: number, cy: number, rx: number, ry: number, dashes = 0, keep = 1): Shape =>
  (x, y) => {
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    if (dx * dx + dy * dy > 1) return false;
    const ix = (x - cx) / (rx - 1.5);
    const iy = (y - cy) / (ry - 1);
    if (ix * ix + iy * iy < 1) return false;
    if (dashes === 0) return true;
    const seg = Math.floor(((Math.atan2(dy, Math.abs(dx)) + Math.PI / 2) / Math.PI) * dashes);
    return seg % keep === 0;
  };

// War Stomp shockwave: 80 x 16 art px -> 160 x 32. Ring centred on the player's feet
// (art x 40, y 11) expands, breaks up and fades; rock chips fly off its ends.
const SW_X = 40;
const SW_Y = 11;
const SHOCKWAVE: Grid[] = [
  draw(80, 16, [ellipse(SW_X, SW_Y, 10, 2.5), disc(31, 7, 1), disc(49, 7, 1)]),
  draw(80, 16, [
    ellipse(SW_X, SW_Y, 20, 3.5),
    disc(19, 5, 1),
    disc(61, 5, 1),
    disc(25, 3, 1),
    disc(55, 3, 1),
  ]),
  draw(80, 16, [ellipse(SW_X, SW_Y, 30, 4.5, 14, 2), disc(9, 3, 1), disc(71, 3, 1)]),
  draw(80, 16, [ellipse(SW_X, SW_Y, 39.5, 5, 20, 3)]),
];

// Charge dust trail: 24 x 12 art px -> 48 x 24. Spawned behind the dashing player (who
// moves right): puffs grow and drift back, then break into specks.
const CHARGE_DUST: Grid[] = [
  draw(24, 12, [disc(20, 9.5, 2.2), puff(15.5, 10, 2.8), disc(10, 10.5, 1.4)]),
  draw(24, 12, [
    puff(17, 8.5, 3.2),
    puff(10.5, 8, 3.6),
    disc(4.5, 9.5, 1.6),
    disc(21.5, 10.5, 1.2),
  ]),
  draw(24, 12, [
    disc(5, 6, 1),
    disc(9, 4, 1),
    disc(13, 7, 1),
    disc(17, 5, 1),
    disc(11, 10, 1),
    disc(20, 9, 1),
  ]),
];

// Stun swirl: 16 x 8 art px -> 32 x 16, drawn above a stunned enemy's head. Three stars
// circle a flat orbit, each trailing a short arc (the swirl); stars in front are crosses,
// stars behind are dots. Stars step 30 degrees per frame, so 4 frames loop seamlessly.
function swirl(frame: number): Grid {
  const on = new Set<string>();
  const at = (a: number): [number, number] => [
    Math.round(7.5 + 6 * Math.cos(a)),
    Math.round(3.5 + 2 * Math.sin(a)),
  ];
  for (let k = 0; k < 3; k += 1) {
    const a = ((frame * 30 + k * 120) * Math.PI) / 180;
    const [sx, sy] = at(a);
    on.add(`${sx},${sy}`);
    if (Math.sin(a) > -0.1) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        on.add(`${sx + dx},${sy + dy}`);
      }
    }
    for (let j = 2; j <= 4; j += 1) {
      const [tx, ty] = at(a - j * 0.25);
      on.add(`${tx},${ty}`);
    }
  }
  return draw(16, 8, [(x, y) => on.has(`${x - 0.5},${y - 0.5}`)]);
}
const STUN_SWIRL: Grid[] = [0, 1, 2, 3].map(swirl);

// Hit spark: 12 x 12 art px -> 24 x 24. Eight-point star: long straight rays, shorter
// diagonal rays. Solid burst -> hollow star -> ray tips only.
function spark(orth: readonly [number, number], diag: readonly [number, number]): Grid {
  return draw(12, 12, [
    (x, y) => {
      const dx = x - 6;
      const dy = y - 6;
      const r = Math.hypot(dx, dy);
      const straight = Math.abs(dx) <= 0.6 || Math.abs(dy) <= 0.6;
      const diagonal = Math.abs(Math.abs(dx) - Math.abs(dy)) <= 0.1;
      return (
        (straight && r >= orth[0] && r <= orth[1]) || (diagonal && r >= diag[0] && r <= diag[1])
      );
    },
  ]);
}
const HIT_SPARK: Grid[] = [
  spark([0, 3.6], [0, 2.9]),
  spark([2.4, 5.6], [2, 4.3]),
  spark([4.4, 5.6], [4.5, 5]),
];

export const shockwaveSheet: SpriteSheet = {
  id: 'shockwave',
  frameWidth: 160,
  frameHeight: 32,
  animations: { burst: { fps: 14, frames: SHOCKWAVE } },
};

export const chargeDustSheet: SpriteSheet = {
  id: 'charge-dust',
  frameWidth: 48,
  frameHeight: 24,
  animations: { trail: { fps: 12, frames: CHARGE_DUST } },
};

export const stunSwirlSheet: SpriteSheet = {
  id: 'stun-swirl',
  frameWidth: 32,
  frameHeight: 16,
  animations: { spin: { fps: 8, frames: STUN_SWIRL } },
};

export const hitSparkSheet: SpriteSheet = {
  id: 'hit-spark',
  frameWidth: 24,
  frameHeight: 24,
  animations: { burst: { fps: 18, frames: HIT_SPARK } },
};
