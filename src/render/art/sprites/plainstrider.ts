import { compose, pad, upscale, type Layer } from '../compose';
import type { Grid, SpriteSheet } from '../grid';

/**
 * Plainstrider (SPEC 4.4, 6.2). Authored at 24 x 28 art pixels, facing left, upscaled 2x
 * to 48 x 56. Long-legged flightless bird: beak, crest, long neck, round body with
 * negative-space wing feathers, gapped tail plume, two-pixel legs with toes.
 */
const W = 24;
const H = 28;

const at = (rows: Grid, x: number, y: number): Layer => ({ rows, x, y });
const cut = (rows: Grid, x: number, y: number): Layer => ({ rows, x, y, mode: 'cut' });
const frame = (layers: readonly Layer[]): string[] => upscale(compose(W, H, layers), 2);

/** Head, neck, body, plume, thigh (rows 0-17). Eye is the gap at (6, 1). */
const UPPER: Grid = pad(W, [
  '.....####.#',
  '...###.####',
  '#########',
  '.########',
  '.....####',
  '......####',
  '......####.........##..#',
  '......####........##..##',
  '......####.......##..##',
  '......############..##',
  '......###############',
  '.....###############',
  '.....###############',
  '.....###############',
  '......#############',
  '.......###########',
  '.........#######',
  '..........#####',
]);
const WING: Grid = ['#######.', '........', '..######'];

const LEGS_STRIDE: Grid = pad(W, [
  '.........##...##',
  '........##.....##',
  '.......##.......##',
  '......##.........##',
  '......##..........##',
  '.....##...........##',
  '.....##............##',
  '....##..............##',
  '....##..............##',
  '.#####............####',
]);
const LEGS_PASS_BACK: Grid = pad(W, [
  '..........##.###',
  '..........##..###',
  '..........##...###',
  '..........##....###',
  '..........##..####',
  '..........##',
  '..........##',
  '..........##',
  '..........##',
  '.......#####',
]);
const LEGS_STRIDE_SHORT: Grid = pad(W, [
  '..........##.##',
  '.........##...##',
  '........##.....##',
  '.......##.......##',
  '.......##........##',
  '......##.........##',
  '......##..........##',
  '.....##...........##',
  '.....##............##',
  '..#####..........####',
]);
const LEGS_PASS_FRONT: Grid = pad(W, [
  '..........##.##',
  '.........##..##',
  '........##...##',
  '.......##....##',
  '.....####....##',
  '.............##',
  '.............##',
  '.............##',
  '.............##',
  '..........#####',
]);
const LEGS_WOBBLE: Grid = pad(W, [
  '.........##...##',
  '..........##.##',
  '...........###',
  '..........##.##',
  '.........##...##',
  '........##.....##',
  '........##.....##',
  '......####...####',
]);

const DEFEATED: Grid = pad(W, [
  '...........####.####',
  '.............##..##',
  '.............##..##',
  '.............##..##',
  '.............##..##',
  '............########',
  '.#####...############..#',
  '#######.###############',
  '#######################',
  '..#####################',
  '.....#################',
  '......################',
  '.......##############',
  '.........##########',
]);

const EYE_X: Grid = ['#.#', '.#.', '#.#'];
const SLIT: Grid = ['##'];

const upper = (y: number): Layer[] => [at(UPPER, 0, y), cut(WING, 10, 11 + y)];

const run = [
  frame([...upper(0), at(LEGS_STRIDE, 0, 18)]),
  frame([...upper(1), at(LEGS_PASS_BACK, 0, 18)]),
  frame([...upper(0), at(LEGS_STRIDE_SHORT, 0, 18)]),
  frame([...upper(1), at(LEGS_PASS_FRONT, 0, 18)]),
];

const stunned = [frame([...upper(2), cut(SLIT, 6, 3), at(LEGS_WOBBLE, 0, 20)])];

const defeated = [frame([at(DEFEATED, 0, 14), cut(EYE_X, 2, 20), cut(['########'], 10, 24)])];

export const plainstriderSheet: SpriteSheet = {
  id: 'plainstrider',
  frameWidth: 48,
  frameHeight: 56,
  animations: {
    run: { fps: 12, frames: run },
    stunned: { fps: 1, frames: stunned },
    defeated: { fps: 1, frames: defeated },
  },
};
