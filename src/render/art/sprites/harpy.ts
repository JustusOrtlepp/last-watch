import { compose, pad, upscale, type Layer } from '../compose';
import type { Grid, SpriteSheet } from '../grid';

/**
 * Harpy (SPEC 4.4, 6.2). Authored at 24 x 18 art pixels, facing left, upscaled 2x to
 * 48 x 36. Winged woman: head with streaming hair, feathered wings with gapped primaries,
 * dangling talons. The body bobs against the wing beat.
 */
const W = 24;
const H = 18;

const at = (rows: Grid, x: number, y: number): Layer => ({ rows, x, y });
const cut = (rows: Grid, x: number, y: number): Layer => ({ rows, x, y, mode: 'cut' });
const frame = (layers: readonly Layer[]): string[] => upscale(compose(W, H, layers), 2);

/** Head, hair, torso, legs, talons; placed at y = 3 + bob. Eye is the gap at (4, 2). */
const BODY: Grid = pad(W, [
  '....###',
  '...######',
  '...#.#####',
  '..######.#',
  '...####',
  '.....############',
  '......############',
  '........###########',
  '...........########',
  '.............###.##',
  '..............##..##',
  '.............####.####',
  '.............#.#..#.#',
]);

const WING_UP: Grid = pad(W, [
  '............#..#..#',
  '............#.##.##',
  '...........##.##.###',
  '...........#########',
  '...........########',
  '...........#######',
  '...........#####',
  '..........#####',
]);
const WING_LEVEL: Grid = pad(W, [
  '................######',
  '............############',
  '...........########.####',
  '.................##..##',
]);
const WING_DOWN: Grid = pad(W, [
  '.......#####',
  '......######',
  '......######',
  '......#####',
  '......##.##',
  '......#..#',
]);
const WING_RAISING: Grid = pad(W, [
  '..............#..#..#',
  '.............##.##.##',
  '............#########',
  '...........########',
  '..........######',
]);

const DEFEATED: Grid = pad(W, [
  '.............#..#..#',
  '............##.##.##',
  '...........##########',
  '.#####...#############',
  '#######################',
  '.#######################',
  '..###################.#',
  '...#################.#.#',
]);

const EYE_X: Grid = ['#.#', '.#.', '#.#'];
const SLIT: Grid = ['##'];

/** Body at y = 3 + bob, wing at its rest row + bob. */
const pose = (wing: Grid, wingY: number, bob: number): string[] =>
  frame([at(BODY, 0, 3 + bob), at(wing, 0, wingY + bob)]);

const flap = [
  pose(WING_UP, 0, 1),
  pose(WING_LEVEL, 5, 0),
  pose(WING_DOWN, 11, -1),
  pose(WING_RAISING, 3, 0),
];

const stunned = [frame([at(BODY, 0, 3), at(WING_UP, 0, 0), cut(SLIT, 4, 5)])];

const defeated = [frame([at(DEFEATED, 0, 10), cut(EYE_X, 2, 13)])];

export const harpySheet: SpriteSheet = {
  id: 'harpy',
  frameWidth: 48,
  frameHeight: 36,
  animations: {
    flap: { fps: 10, frames: flap },
    stunned: { fps: 1, frames: stunned },
    defeated: { fps: 1, frames: defeated },
  },
};
