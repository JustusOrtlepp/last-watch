import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { autopilotInput, createAutopilot } from '../../src/bot/autopilot';
import { createWorld, drainEvents, isDead, stepWorld, type World } from '../../src/sim/world';

/**
 * SPEC 7.4 rule 5 / 14.1: the perfect-play autopilot never dies over 1,000 seeded runs to
 * distanceRage 10,000. Any death is a spawner bug.
 *
 * FAIRNESS_SEEDS (default 1000) sets the number of seeds; only the default counts for a gate (R15).
 * On a death the seed and a compact trace (spawns, actions) go to .tmp/fairness-fail.txt (R16).
 */
const SEEDS = Math.max(1, Math.floor(Number(process.env['FAIRNESS_SEEDS'] ?? 1000)) || 1000);
const TARGET_RAGE = 10_000;
const MAX_TICKS = 40_000;
const TRACE_LINES = 27;

type Counts = Record<'jumps' | 'charges' | 'stomps', number>;

interface RunResult {
  died: boolean;
  trace: string[];
}

function play(seed: number, counts: Counts): RunResult {
  const world = createWorld(seed);
  const bot = createAutopilot();
  const seen = new Set<number>();
  const trace: string[] = [];
  const log = (line: string): void => {
    trace.push(`t${world.tick - 1} ${line}`);
    if (trace.length > TRACE_LINES) trace.shift();
  };

  while (world.rage.distanceRage < TARGET_RAGE && world.tick < MAX_TICKS) {
    stepWorld(world, autopilotInput(bot, world));
    for (const e of drainEvents(world)) {
      if (e.type === 'PlayerJumped') {
        counts.jumps++;
        log('jump');
      } else if (e.type === 'ChargeStarted') {
        counts.charges++;
        log(`charge -> #${e.targetId}`);
      } else if (e.type === 'StompUsed') {
        counts.stomps++;
        log(`stomp (${e.stunned} stunned)`);
      } else if (e.type === 'PlayerDied') {
        log(`DIED: ${e.cause}`);
      }
    }
    logSpawns(world, seen, log);
    if (isDead(world)) return { died: true, trace };
  }
  if (world.rage.distanceRage < TARGET_RAGE) log(`did not reach distanceRage ${TARGET_RAGE}`);
  return { died: world.rage.distanceRage < TARGET_RAGE, trace };
}

function logSpawns(world: World, seen: Set<number>, log: (line: string) => void): void {
  for (const o of world.obstacles) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    log(`spawn ${o.kind} #${o.id} x${o.x.toFixed(0)}`);
  }
  for (const e of world.enemies) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    log(`spawn ${e.kind} #${e.id} x${e.x.toFixed(0)} v${world.speed.toFixed(0)}`);
  }
}

function writeFailure(seed: number, trace: readonly string[]): void {
  const lines = [`seed ${seed}: autopilot died (last ${trace.length} trace lines)`, ...trace];
  mkdirSync('.tmp', { recursive: true });
  writeFileSync('.tmp/fairness-fail.txt', `${lines.slice(0, 30).join('\n')}\n`, 'utf8');
}

describe('autopilot fairness (SPEC 7.4 rule 5)', () => {
  it(
    `never dies on ${SEEDS} seeded runs to distanceRage ${TARGET_RAGE}`,
    { timeout: 3_600_000 },
    () => {
      const counts: Counts = { jumps: 0, charges: 0, stomps: 0 };
      for (let seed = 1; seed <= SEEDS; seed++) {
        const result = play(seed, counts);
        if (result.died) {
          writeFailure(seed, result.trace);
          expect.fail(`seed ${seed}: autopilot died (see .tmp/fairness-fail.txt)`);
        }
      }
      // The bot really plays: it jumps, charges and stomps.
      expect(counts.jumps).toBeGreaterThan(SEEDS * 20);
      expect(counts.charges).toBeGreaterThan(SEEDS);
      expect(counts.stomps).toBeGreaterThan(SEEDS);
    },
  );
});
