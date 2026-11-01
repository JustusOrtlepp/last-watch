import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/config';
import { passStart } from '../../../src/audio/music';

describe('music loop scheduling', () => {
  it('starts each pass one overlap before the previous pass ends', () => {
    const duration = 60;
    const { overlapSec } = CONFIG.music;
    expect(passStart(1, duration, overlapSec, 0)).toBe(1);
    expect(passStart(1, duration, overlapSec, 1)).toBeCloseTo(1 + duration - overlapSec, 9);
    expect(passStart(1, duration, overlapSec, 2)).toBeCloseTo(1 + 2 * (duration - overlapSec), 9);
  });

  it('keeps the loop seam a whole number of bars at 100 bpm (beat and bar stay aligned)', () => {
    const barSec = (60 / 100) * 4;
    expect(CONFIG.music.overlapSec / barSec).toBeCloseTo(
      Math.round(CONFIG.music.overlapSec / barSec),
      9,
    );
  });

  it('has a gap-free schedule: every pass overlaps its predecessor', () => {
    const duration = 60;
    const { overlapSec } = CONFIG.music;
    for (let i = 1; i < 5; i++) {
      const endPrev = passStart(0, duration, overlapSec, i - 1) + duration;
      expect(passStart(0, duration, overlapSec, i)).toBeLessThan(endPrev);
    }
  });
});
