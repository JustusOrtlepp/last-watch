import { compose, pad, upscale, type Layer } from '../compose';
import type { Grid, SpriteSheet } from '../grid';

/**
 * Centaur Archer (SPEC 4.4, 6.2). Authored at 28 x 32 art pixels, facing left, upscaled
 * 2x to 56 x 64. Human torso on a horse body, four legs with hooves, swishing tail. The
 * bow is a D shape (arc + string) whose inside is negative space; the string bends back
 * as it is drawn and snaps straight on release.
 */
const W = 28;
const H = 32;

const at = (rows: Grid, x: number, y: number): Layer => ({ rows, x, y });
const cut = (rows: Grid, x: number, y: number): Layer => ({ rows, x, y, mode: 'cut' });
const frame = (layers: readonly Layer[]): string[] => upscale(compose(W, H, layers), 2);

/** Head with hair, torso down to the horse withers; placed at x = 6. Eye gap at (2, 2). */
const TORSO: Grid = [
  '..###....',
  '.######..',
  '.#.#####.',
  '######.#.',
  '..###....',
  '.######..',
  '.######..',
  '.######..',
  '.######..',
  '..#####..',
  '..#####..',
  '..#####..',
  '..#####..',
  '..#####..',
];

const HORSE: Grid = pad(W, [
  '........#################',
  '.......###################',
  '.......###################',
  '.......###################',
  '.......###################',
  '.......##################',
  '.......######.....#######',
]);
const LEGS: Grid = pad(W, [
  '.......######......######',
  '.......##..##......##..##',
  '.......##..##......##..##',
  '.......##..##......##..##',
  '.......##..##......##..##',
  '.......##..##......##..##',
  '.......##..##......##..##',
  '.......##..##......##..##',
  '.......##..##......##..##',
  '.......##..##......##..##',
  '......###.###.....###.###',
]);
const TAIL_HANG: Grid = ['##.', '.##', '.##', '.##', '.##', '.##', '.##', '.##', '.##', '..#'];
const TAIL_SWISH: Grid = ['###', '..#', '..#', '.##', '.#.', '.#.', '##.', '#..'];

/** Bow arc, 11 rows; placed at x = 2. Tips at column 3 of the part, grip at column 0. */
const BOW: Grid = [
  '...#',
  '..#.',
  '.#..',
  '#...',
  '#...',
  '#...',
  '#...',
  '#...',
  '.#..',
  '..#.',
  '...#',
];
const STRING_REST: Grid = ['#', '#', '#', '#', '#', '#', '#', '#', '#'];
const STRING_HALF: Grid = [
  '#..',
  '#..',
  '.#.',
  '.#.',
  '..#',
  '..#',
  '..#',
  '.#.',
  '.#.',
  '#..',
  '#..',
];
const STRING_FULL: Grid = [
  '#....',
  '.#...',
  '..#..',
  '...#.',
  '....#',
  '....#',
  '....#',
  '...#.',
  '..#..',
  '.#...',
  '#....',
];
const ARROW_HALF: Grid = ['.#......', '########', '.#......'];
const ARROW_FULL: Grid = ['.#........', '##########', '.#........'];
const BOW_ARM: Grid = ['#####'];
const ELBOW_HALF: Grid = ['##', '#.'];
const ELBOW_FULL: Grid = ['.##', '###'];
const ARM_RELEASE: Grid = ['..#', '.##', '##.'];
const LIMP_ARM: Grid = ['#', '#', '#', '#'];

const DEFEATED: Grid = pad(W, [
  '...........##############',
  '.........#################',
  '...###..###################',
  '.##########################',
  '############################',
  '############################',
  '.#####.####################',
  '..###...##################',
  '.........#####....#######',
  '#######.#######..#########',
]);

const EYE_X: Grid = ['#.#', '.#.', '#.#'];
const SLIT: Grid = ['##'];

const horse = (tail: Grid): Layer[] => [at(HORSE, 0, 14), at(LEGS, 0, 21), at(tail, 25, 14)];
const archer = (torsoY: number): Layer => at(TORSO, 6, torsoY);
const bow = (string: Layer): Layer[] => [at(BOW, 2, 1), string, at(BOW_ARM, 3, 7)];

const restString = at(STRING_REST, 5, 2);

const idle = [
  frame([...horse(TAIL_HANG), archer(0), ...bow(restString)]),
  frame([...horse(TAIL_SWISH), archer(0), ...bow(restString)]),
];

const shoot = [
  frame([
    ...horse(TAIL_HANG),
    archer(0),
    ...bow(at(STRING_HALF, 5, 1)),
    at(ARROW_HALF, 0, 5),
    at(ELBOW_HALF, 13, 5),
  ]),
  frame([
    ...horse(TAIL_HANG),
    archer(0),
    ...bow(at(STRING_FULL, 5, 1)),
    at(ARROW_FULL, 0, 5),
    at(ELBOW_FULL, 13, 4),
  ]),
  frame([...horse(TAIL_SWISH), archer(0), ...bow(restString), at(ARM_RELEASE, 13, 3)]),
];

const stunned = [
  frame([
    ...horse(TAIL_HANG),
    archer(2),
    cut(SLIT, 8, 4),
    at(LIMP_ARM, 6, 8),
    at(BOW, 3, 12),
    at(STRING_REST, 6, 13),
  ]),
];

const defeated = [frame([at(DEFEATED, 0, 22), cut(EYE_X, 2, 25)])];

export const centaurSheet: SpriteSheet = {
  id: 'centaur',
  frameWidth: 56,
  frameHeight: 64,
  animations: {
    idle: { fps: 2, frames: idle },
    shoot: { fps: 6, frames: shoot },
    stunned: { fps: 1, frames: stunned },
    defeated: { fps: 1, frames: defeated },
  },
};
