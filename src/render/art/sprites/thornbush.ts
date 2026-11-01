import { upscale } from '../compose';
import type { SpriteSheet } from '../grid';

/**
 * Thornbush (SPEC 4.4, 6.1). 12 x 14 art pixels, upscaled 2x to 24 x 28. Static and
 * eyeless: a spiky crown of thorned branches on a short woody base. Three variants share
 * the base and differ in the crown; clusters of 2-3 are placed side by side by the spawner.
 */
const BASE = ['..########..', '...######...', '....####....', '...######...'];

const ROUND = upscale(
  [
    '....#..#....',
    '.#..#..#..#.',
    '..#.##.#.#..',
    '#.###.####.#',
    '.##.####.##.',
    '..###..###..',
    '#.########.#',
    '.###.##.###.',
    '..########..',
    '.###.##.###.',
    ...BASE,
  ],
  2,
);

const SPIRE = upscale(
  [
    '.....#......',
    '..#..#..#...',
    '...#.#.#....',
    '.#..###..#..',
    '..#.###.#...',
    '#..#####..#.',
    '.#.##.##.#..',
    '..###.###...',
    '#..######..#',
    '.#.######.#.',
    ...BASE,
  ],
  2,
);

const SCRUB = upscale(
  [
    '..#......#..',
    '...#..#.#...',
    '#..#..#.#..#',
    '.#.##.###.#.',
    '..#######.#.',
    '#..##.#####.',
    '.######.###.',
    '..###.####.#',
    '#.########..',
    '.##.##.####.',
    ...BASE,
  ],
  2,
);

export const thornbushSheet: SpriteSheet = {
  id: 'thornbush',
  frameWidth: 24,
  frameHeight: 28,
  animations: {
    variants: { fps: 1, frames: [ROUND, SPIRE, SCRUB] },
  },
};
