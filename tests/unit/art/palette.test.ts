import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/config';
import { PALETTE, contrastAgainstBlack, relativeLuminance } from '../../../src/render/art/palette';

describe('palette', () => {
  const entries = Object.entries(PALETTE);

  it('stays within the colour budget', () => {
    expect(entries.length).toBeLessThanOrEqual(CONFIG.art.maxPaletteColours);
  });

  it('uses uppercase #RRGGBB values', () => {
    for (const [, entry] of entries) expect(entry.hex).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('computes WCAG luminance and contrast', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrastAgainstBlack('#FFFFFF')).toBeCloseTo(21, 5);
    expect(() => relativeLuminance('red')).toThrow();
  });

  it('keeps every gameplay-band colour at >= 4.5:1 against black (SPEC 4.4)', () => {
    for (const [name, entry] of entries) {
      if (!entry.gameplayBand) continue;
      expect(contrastAgainstBlack(entry.hex), name).toBeGreaterThanOrEqual(
        CONFIG.art.minContrastVsBlack,
      );
    }
  });
});
