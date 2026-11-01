/**
 * Durotar background palette (SPEC 4.4). Sprites are pure black on transparent and are NOT
 * part of this palette; this is the only coloured art in the game.
 *
 * `gameplayBand: true` marks colours that appear in the gameplay band (y = 60..230) and must
 * therefore keep a contrast ratio of at least CONFIG.art.minContrastVsBlack against black.
 * The ground strip (below the ground line) is exempt.
 */
export interface PaletteEntry {
  readonly hex: string;
  readonly gameplayBand: boolean;
}

export const PALETTE = {
  skyHazeTop: { hex: '#F2C29B', gameplayBand: true },
  skyHazeUpper: { hex: '#EFB58B', gameplayBand: true },
  skyHazeLower: { hex: '#ECA77B', gameplayBand: true },
  skyHazeHorizon: { hex: '#E99A6B', gameplayBand: true },
  farSpires: { hex: '#D9825E', gameplayBand: true },
  farShade: { hex: '#D0754F', gameplayBand: true },
  midRocks: { hex: '#C8654A', gameplayBand: true },
  midShade: { hex: '#BC5C42', gameplayBand: true },
  groundStrip: { hex: '#A8432C', gameplayBand: false },
  groundDustSpecks: { hex: '#D97B55', gameplayBand: false },
  groundCracks: { hex: '#6E2416', gameplayBand: false },
} as const satisfies Record<string, PaletteEntry>;

export type PaletteKey = keyof typeof PALETTE;

function channelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a `#RRGGBB` colour. */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(hex);
  if (!match) throw new Error(`Invalid colour: ${hex}`);
  const [r, g, b] = [match[1], match[2], match[3]].map((h) => channelToLinear(parseInt(h!, 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio between a colour and pure black (#000000). */
export function contrastAgainstBlack(hex: string): number {
  return (relativeLuminance(hex) + 0.05) / 0.05;
}
