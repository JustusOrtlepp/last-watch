import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../src/config';
import {
  ATTACK_SEC,
  NOISE_BUFFER_SEC,
  SFX_NAMES,
  SFX_RECIPES,
  sfxForEvent,
  type SfxName,
} from '../../../src/audio/sfx';
import type { SimEvent } from '../../../src/sim/events';

describe('sfx recipes (SPEC 10.2)', () => {
  it('has a recipe for every effect SPEC 10.2 lists', () => {
    expect([...SFX_NAMES].sort()).toEqual(
      [
        'jump',
        'land',
        'charge',
        'impact',
        'stomp',
        'stun',
        'kill',
        'trample',
        'error',
        'levelUp',
        'death',
      ].sort(),
    );
    for (const name of SFX_NAMES) expect(SFX_RECIPES[name]).toBeDefined();
  });

  it('every voice is audible, short and valid for exponential ramps', () => {
    for (const name of SFX_NAMES) {
      const { tones, noise } = SFX_RECIPES[name];
      expect(tones.length + noise.length).toBeGreaterThan(0);
      for (const voice of [...tones, ...noise]) {
        expect(voice.from).toBeGreaterThan(0);
        expect(voice.to).toBeGreaterThan(0);
        expect(voice.gain).toBeGreaterThan(0);
        expect(voice.gain).toBeLessThanOrEqual(1);
        expect(voice.at).toBeGreaterThanOrEqual(0);
        expect(voice.dur).toBeGreaterThan(ATTACK_SEC * 2);
        expect(voice.at + voice.dur).toBeLessThanOrEqual(1.5);
      }
      for (const voice of noise) expect(voice.dur).toBeLessThan(NOISE_BUFFER_SEC);
    }
  });

  it('the master gain and the repeat gap are sane', () => {
    expect(CONFIG.sfx.volume).toBeGreaterThan(0);
    expect(CONFIG.sfx.volume).toBeLessThanOrEqual(1);
    expect(CONFIG.sfx.minGapMs).toBeGreaterThan(0);
  });
});

describe('sfxForEvent', () => {
  const cases: [SimEvent, SfxName | null][] = [
    [{ type: 'PlayerJumped' }, 'jump'],
    [{ type: 'PlayerLanded' }, 'land'],
    [{ type: 'ChargeStarted', targetId: 1, fromX: 0 }, 'charge'],
    [{ type: 'ChargeHit', targetId: 1, kind: 'quilboar', x: 0 }, 'impact'],
    [{ type: 'StompUsed', x: 0, stunned: 2 }, 'stomp'],
    [{ type: 'EnemyStunned', id: 1, kind: 'quilboar' }, 'stun'],
    [{ type: 'EnemyDefeated', id: 1, kind: 'quilboar', cause: 'charge' }, 'kill'],
    [{ type: 'EnemyDefeated', id: 1, kind: 'harpyMid', cause: 'fall' }, 'kill'],
    [{ type: 'EnemyDefeated', id: 1, kind: 'quilboar', cause: 'trample' }, 'trample'],
    [{ type: 'AbilityError', reason: 'NotReady' }, 'error'],
    [{ type: 'PlayerDied', cause: 'arrow' }, 'death'],
    [{ type: 'ArrowFired', id: 1, x: 0 }, null],
    [{ type: 'HintTriggered', hint: 'jump' }, null],
    [{ type: 'RageSurge', amount: 5, source: 'stomp', x: 0, y: 0 }, null],
  ];

  it.each(cases)('%j -> %s', (event, expected) => {
    expect(sfxForEvent(event)).toBe(expected);
  });
});
