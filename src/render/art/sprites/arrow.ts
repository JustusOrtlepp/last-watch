import { upscale } from '../compose';
import type { SpriteSheet } from '../grid';

/**
 * Centaur arrow (SPEC 4.4, 6.2). 10 x 2 art pixels, upscaled 2x to 20 x 4. Flies left:
 * head on the left, split fletching (negative space) on the right.
 */
const ARROW = upscale(['.##...#.#.', '##########'], 2);

export const arrowSheet: SpriteSheet = {
  id: 'arrow',
  frameWidth: 20,
  frameHeight: 4,
  animations: {
    fly: { fps: 1, frames: [ARROW] },
  },
};
