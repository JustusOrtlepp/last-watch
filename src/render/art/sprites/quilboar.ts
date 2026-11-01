import { compose, pad, upscale, type Layer } from '../compose';
import type { Grid, SpriteSheet } from '../grid';

/**
 * Quilboar (SPEC 4.4, 6.2). Authored at 24 x 20 art pixels, facing left (toward the
 * player), upscaled 2x to 48 x 40. Hunched boar-man: tusk with a negative-space gap to
 * the snout, ear, quills raked back over the hump, stubby hooved legs.
 */
const W = 24;
const H = 20;

const at = (rows: Grid, x: number, y: number): Layer => ({ rows, x, y });
const cut = (rows: Grid, x: number, y: number): Layer => ({ rows, x, y, mode: 'cut' });
const frame = (layers: readonly Layer[]): string[] => upscale(compose(W, H, layers), 2);

/** Head, hump, quills, arm, hips (rows 0-13). Eye is the gap at (5, 7). */
const UPPER: Grid = pad(W, [
  '............#...#...#...',
  '...........##..##..##...',
  '..........##..##..##....',
  '.........###.###.####...',
  '........#############...',
  '....##.###############..',
  '#..###################.#',
  '#.###.#################.',
  '#.####################..',
  '########.#############..',
  '..#####..############...',
  '......###.###########...',
  '.....####.##########....',
  '.....####..#########....',
]);

const LEGS_WIDE: Grid = pad(W, [
  '...........####.####',
  '..........####...####',
  '.........####.....####',
  '........####.......####',
  '........###.........###',
  '.......####.........####',
]);
const LEGS_PASS_BACK: Grid = pad(W, [
  '...........#########',
  '............###.###',
  '............###..###',
  '............###...###',
  '............###',
  '...........####',
]);
const LEGS_MID: Grid = pad(W, [
  '...........####.####',
  '..........####..####',
  '..........###....###',
  '.........###.....####',
  '.........###......###',
  '........####......####',
]);
const LEGS_PASS_FRONT: Grid = pad(W, [
  '...........#########',
  '..........####..###',
  '........####....###',
  '.......###......###',
  '................###',
  '...............####',
]);
const LEGS_DAZED: Grid = pad(W, [
  '...........###...###',
  '............###.###',
  '............###.###',
  '...........###...###',
  '..........####...####',
]);

const DEFEATED: Grid = pad(W, [
  '...........###..###',
  '............##..##',
  '............##..##',
  '...........###..###',
  '......##############',
  '.#.##################',
  '.#.###################',
  '.#####################',
  '..#####################',
  '...###################',
  '....###..###..###..###',
]);

const EYE_X: Grid = ['#.#', '.#.', '#.#'];
const SLIT: Grid = ['##'];

const upper = (y: number): Layer[] => [at(UPPER, 0, y)];

const walk = [
  frame([...upper(1), at(LEGS_WIDE, 0, 14)]),
  frame([...upper(0), at(LEGS_PASS_BACK, 0, 14)]),
  frame([...upper(1), at(LEGS_MID, 0, 14)]),
  frame([...upper(0), at(LEGS_PASS_FRONT, 0, 14)]),
];

const stunned = [frame([...upper(1), cut(SLIT, 5, 8), at(LEGS_DAZED, 0, 15)])];

const defeated = [frame([at(DEFEATED, 0, 9), cut(EYE_X, 5, 14)])];

export const quilboarSheet: SpriteSheet = {
  id: 'quilboar',
  frameWidth: 48,
  frameHeight: 40,
  animations: {
    walk: { fps: 8, frames: walk },
    stunned: { fps: 1, frames: stunned },
    defeated: { fps: 1, frames: defeated },
  },
};
