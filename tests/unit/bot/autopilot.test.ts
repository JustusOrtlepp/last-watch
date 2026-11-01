import { describe, expect, it } from 'vitest';
import { autopilotInput, cloneWorld, createAutopilot, inputAt } from '../../../src/bot/autopilot';
import type { SimEvent } from '../../../src/sim/events';
import { NO_INPUT } from '../../../src/sim/player';
import {
  addEnemy,
  addObstacle,
  createWorld,
  drainEvents,
  hashWorld,
  isDead,
  stepWorld,
  type World,
} from '../../../src/sim/world';

function runBot(world: World, ticks: number): SimEvent[] {
  const bot = createAutopilot();
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks && !isDead(world); i++) {
    stepWorld(world, autopilotInput(bot, world));
    events.push(...drainEvents(world));
  }
  return events;
}

describe('autopilot', () => {
  it('clones the world without shared state', () => {
    const world = createWorld(7);
    for (let i = 0; i < 900; i++) stepWorld(world, NO_INPUT);
    const before = hashWorld(world);
    const copy = cloneWorld(world);
    expect(hashWorld(copy)).toBe(before);
    for (let i = 0; i < 300; i++)
      stepWorld(copy, { jump: i % 50 < 10, down: false, stomp: i === 5 });
    expect(hashWorld(world)).toBe(before);
    for (let i = 0; i < 300; i++)
      stepWorld(world, { jump: i % 50 < 10, down: false, stomp: i === 5 });
    expect(hashWorld(world)).toBe(hashWorld(copy));
  });

  it('turns actions into held keys with press edges', () => {
    const actions = [
      { tick: 10, kind: 'jump' as const },
      { tick: 40, kind: 'hop' as const },
      { tick: 70, kind: 'stomp' as const },
      { tick: 80, kind: 'charge' as const },
    ];
    expect(inputAt(actions, 9).jump).toBe(false);
    expect(inputAt(actions, 10).jump).toBe(true);
    expect(inputAt(actions, 20).jump).toBe(true);
    expect(inputAt(actions, 39).jump).toBe(false);
    expect(inputAt(actions, 40).jump).toBe(true);
    expect(inputAt(actions, 41).jump).toBe(false);
    expect(inputAt(actions, 70).stomp).toBe(true);
    expect(inputAt(actions, 71).stomp).toBeFalsy();
    expect(inputAt(actions, 80).charge).toBe(true);
  });

  it('jumps a thornbush and stomps a Kodo', () => {
    const world = createWorld(1, { spawning: false });
    addObstacle(world, 'thornbush', 500);
    addEnemy(world, 'kodo', 1100);
    const events = runBot(world, 360);
    expect(isDead(world)).toBe(false);
    expect(events.some((e) => e.type === 'PlayerJumped')).toBe(true);
    expect(events.some((e) => e.type === 'StompUsed' && e.stunned === 1)).toBe(true);
  });

  it('charges a mid harpy instead of jumping it', () => {
    const world = createWorld(1, { spawning: false });
    addEnemy(world, 'harpyMid', 700);
    const events = runBot(world, 240);
    expect(isDead(world)).toBe(false);
    expect(events.some((e) => e.type === 'ChargeStarted')).toBe(true);
    expect(events.some((e) => e.type === 'PlayerJumped')).toBe(false);
  });
});
