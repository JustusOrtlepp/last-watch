// Runs the fairness autopilot suite (tests/fairness) - ORCHESTRATION R15.
// No argument: FAIRNESS_SEEDS is cleared so the test's default (1,000 seeds) applies.
// With a seed count (e.g. 50): development run only, never counts for a gate.
import { spawnSync } from 'node:child_process';

const seeds = process.argv[2];
const env = { ...process.env };
if (seeds) {
  env.FAIRNESS_SEEDS = seeds;
} else {
  delete env.FAIRNESS_SEEDS;
}

const result = spawnSync('npx', ['vitest', 'run', '--reporter=dot', '--dir', 'tests/fairness'], {
  stdio: 'inherit',
  shell: true,
  env,
});
process.exit(result.status ?? 1);
