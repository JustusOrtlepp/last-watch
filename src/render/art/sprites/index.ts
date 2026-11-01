import type { SpriteSheet } from '../grid';
import { arrowSheet } from './arrow';
import { boulderSheet } from './boulder';
import { centaurSheet } from './centaur';
import { chargeDustSheet, hitSparkSheet, shockwaveSheet, stunSwirlSheet } from './effects';
import { harpySheet } from './harpy';
import { iconsSheet } from './icons';
import { kodoSheet } from './kodo';
import { plainstriderSheet } from './plainstrider';
import { quilboarSheet } from './quilboar';
import { taurenSheet } from './tauren';
import { thornbushSheet } from './thornbush';
import { totemSheet } from './totem';

/** Every sprite sheet in the game. Art tests and the gallery iterate over this list. */
export const SHEETS: readonly SpriteSheet[] = [
  taurenSheet,
  quilboarSheet,
  plainstriderSheet,
  harpySheet,
  centaurSheet,
  kodoSheet,
  arrowSheet,
  thornbushSheet,
  boulderSheet,
  totemSheet,
  iconsSheet,
  shockwaveSheet,
  chargeDustSheet,
  stunSwirlSheet,
  hitSparkSheet,
];
