import { upscale } from '../compose';
import type { SpriteSheet } from '../grid';

/**
 * Ability icons (SPEC 4.4, 9.2). 16 x 16 art pixels, upscaled 2x to 32 x 32. Black glyphs;
 * the HUD supplies the light button face, keybind label and cooldown sweep.
 * - Jump: two stacked up-chevrons over the ground line.
 * - Charge: a forward (right-pointing) arrow with speed lines.
 * - War Stomp: a cloven hoof slamming the ground, impact lines, cracked ground.
 */
const JUMP = upscale(
  [
    '................',
    '.......##.......',
    '......####......',
    '.....######.....',
    '....###..###....',
    '...###....###...',
    '..###......###..',
    '.......##.......',
    '......####......',
    '.....######.....',
    '....###..###....',
    '...###....###...',
    '..###......###..',
    '................',
    '.##############.',
    '.##############.',
  ],
  2,
);

const CHARGE = upscale(
  [
    '................',
    '........#.......',
    '........##......',
    '##......###.....',
    '........####....',
    '....#########...',
    '##..##########..',
    '....###########.',
    '....###########.',
    '##..##########..',
    '....#########...',
    '........####....',
    '##......###.....',
    '........##......',
    '........#.......',
    '................',
  ],
  2,
);

const WAR_STOMP = upscale(
  [
    '......####......',
    '......####......',
    '......####......',
    '.....######.....',
    '.....######.....',
    '#...########...#',
    '.#..########..#.',
    '..#.###..###.#..',
    '....###..###....',
    '....###..###....',
    '################',
    '################',
    '#######..#######',
    '########.#######',
    '.######.#######.',
    '................',
  ],
  2,
);

export const iconsSheet: SpriteSheet = {
  id: 'icons',
  frameWidth: 32,
  frameHeight: 32,
  animations: {
    jump: { fps: 1, frames: [JUMP] },
    charge: { fps: 1, frames: [CHARGE] },
    stomp: { fps: 1, frames: [WAR_STOMP] },
  },
};
