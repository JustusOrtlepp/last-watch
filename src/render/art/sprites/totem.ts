import { upscale } from '../compose';
import type { SpriteSheet } from '../grid';

/**
 * Totem pole (SPEC 4.4, 6.1). 11 x 28 art pixels, upscaled 2x to 22 x 56. Static and
 * eyeless: carvings are bands, slots and chevrons (negative space), never paired eye holes.
 * Variant 1 is crowned by a thunderbird, variant 2 by bull horns.
 */
const BASE = ['..#######..', '..#######..', '..#######..', '.#########.', '###########'];

const THUNDERBIRD = upscale(
  [
    '.....#.....',
    '....###....',
    '#...###...#',
    '##.#####.##',
    '###########',
    '.####.####.',
    '..#######..',
    '...#####...',
    '..#######..',
    '..###.###..',
    '..##.#.##..',
    '..#.###.#..',
    '..#######..',
    '...#####...',
    '..#######..',
    '..##...##..',
    '..#######..',
    '..#######..',
    '...#####...',
    '..#######..',
    '..###.###..',
    '..##.#.##..',
    '..#.###.#..',
    ...BASE,
  ],
  2,
);

const HORNED = upscale(
  [
    '#.........#',
    '#.........#',
    '##.......##',
    '.##.###.##.',
    '..#######..',
    '...#####...',
    '..#######..',
    '..##...##..',
    '..#######..',
    '..#######..',
    '...#####...',
    '.#########.',
    '##.#####.##',
    '#..#####..#',
    '...#####...',
    '..#######..',
    '..#.###.#..',
    '..##.#.##..',
    '..###.###..',
    '..#######..',
    '...#####...',
    '..#######..',
    '..#.#.#.#..',
    ...BASE,
  ],
  2,
);

export const totemSheet: SpriteSheet = {
  id: 'totem',
  frameWidth: 22,
  frameHeight: 56,
  animations: {
    variants: { fps: 1, frames: [THUNDERBIRD, HORNED] },
  },
};
