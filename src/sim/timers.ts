/** Float slack so a timer of N whole ticks reaches exactly zero after N ticks. */
const TIMER_EPSILON_MS = 1e-6;

/** Counts a millisecond timer down by `dtMs`, clamping to 0 (with float slack). */
export function countdown(remainingMs: number, dtMs: number): number {
  const next = remainingMs - dtMs;
  return next <= TIMER_EPSILON_MS ? 0 : next;
}
