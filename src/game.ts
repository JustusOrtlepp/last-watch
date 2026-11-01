import musicUrl from './audio/last_watch_synthwave.mp3';
import { createMusic } from './audio/music';
import { createSfx, sfxForEvent } from './audio/sfx';
import { createInput, type Action } from './input/input';
import { CONFIG } from './config';
import { createActionBar } from './render/actionbar';
import { createEffects } from './render/effects';
import { createParticles } from './render/particles';
import { createRenderer } from './render/renderer';
import { createHud } from './render/hud';
import { createHintTooltip, syncHintElement } from './render/hint';
import { createMilestoneToast, syncToastElement } from './render/toast';
import { createAssets, drawScene, type SceneView } from './render/scene';
import { ABILITY_ERROR_TEXT } from './sim/abilities';
import {
  addEnemy,
  addObstacle,
  createWorld,
  drainEvents,
  isDead,
  score,
  type World,
} from './sim/world';
import { advance, createStepper, type Stepper } from './sim/loop';
import {
  browserStore,
  defaultSettings,
  loadHighScore,
  loadSeenHints,
  loadSettings,
  saveHighScore,
  saveSeenHints,
  saveSettings,
  type Settings,
} from './storage/persistence';
import { createScreens, type Screen } from './ui/screens';

/**
 * Dev-only test hooks (SPEC 14.2). `spawn` overrides the spawner for the first run only:
 * `immediate` places one obstacle right ahead, `enemy` / `kodo` one Quilboar / Kodo ahead
 * (out of Charge range at first, in range after about half a second), `none` disables spawning.
 */
export interface DebugHooks {
  seed?: number;
  spawn?: 'immediate' | 'enemy' | 'kodo' | 'none';
}

/** x of the hook obstacle: close enough to hit a non-jumping player within about 0.3 s. */
const IMMEDIATE_OBSTACLE_X = 240;
/** x of the hook enemy: beyond Charge range at the start, then walking through the range band. */
const HOOK_ENEMY_X = 800;

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

/** Brief pulse on the RAGE counter for a combat surge (SPEC 8); the CSS is off with reduced motion. */
function pulseRage(el: HTMLElement): void {
  el.classList.remove('pulse');
  void el.offsetWidth; // restart the animation
  el.classList.add('pulse');
}

/** Wires sim, renderer, input, HUD, screens and persistence, and starts the animation loop. */
export function startGame(canvas: HTMLCanvasElement, hooks: DebugHooks = {}): void {
  const app = byId('app');
  const store = browserStore();
  const assets = createAssets();
  const hud = createHud(byId('hud-rage'), byId('hud-best'), byId('hud-error'));
  const fx = createEffects();
  const settings = loadSettings(
    store,
    defaultSettings(window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  );
  app.dataset.reducedMotion = String(settings.reducedMotion);
  const soundBtn = byId<HTMLButtonElement>('btn-sound');
  const soundLabel = byId('sound-label');
  const music = createMusic({
    url: musicUrl,
    ...CONFIG.music,
    muted: settings.muted,
    onChange: (state) => {
      app.dataset.music = state;
    },
  });
  const sfx = createSfx({ ...CONFIG.sfx, muted: settings.muted });
  const showSound = (): void => {
    soundBtn.setAttribute('aria-pressed', String(!settings.muted));
    soundLabel.textContent = settings.muted ? 'Sound: Off' : 'Sound: On';
    app.dataset.music = music.state;
    screens.syncSettings(settings);
  };
  const setMuted = (muted: boolean): void => {
    settings.muted = muted;
    saveSettings(store, settings);
    music.setMuted(muted);
    sfx.setMuted(muted);
    showSound();
  };
  const toggleMute = (): void => setMuted(!settings.muted);
  // Browsers only allow audio after a user gesture: the first key or press unlocks it.
  const unlockAudio = (ev: Event): void => {
    if (ev instanceof KeyboardEvent && ev.code === 'Escape') return;
    music.unlock();
    sfx.unlock();
    if (ev.type !== 'pointerdown') {
      for (const type of ['keydown', 'pointerdown', 'pointerup'])
        document.removeEventListener(type, unlockAudio, true);
    }
  };
  for (const type of ['keydown', 'pointerdown', 'pointerup'])
    document.addEventListener(type, unlockAudio, true);
  soundBtn.addEventListener('click', () => {
    toggleMute();
    soundBtn.blur(); // keep Space / Enter for the game
  });
  soundBtn.addEventListener('keydown', (ev) => ev.stopPropagation()); // a focused toggle keeps Space / Enter
  const particles = createParticles(() => settings.reducedMotion);
  const toast = createMilestoneToast();
  const toastEl = byId('hud-toast');
  const toastLevelEl = byId('hud-toast-level');
  const rageEl = byId('hud-rage-counter');
  const hintEl = byId('hud-hint');
  const hints = createHintTooltip(loadSeenHints(store), settings.showHints, (seen) =>
    saveSeenHints(store, seen),
  );
  let best = loadHighScore(store);
  let screen: Screen = 'title';
  let runs = 0;
  let spawnOverride = hooks.spawn;
  let deathAt = 0;
  let stepper: Stepper = createStepper();
  // The title shows an empty, never-stepped world; a run replaces it.
  let world: World = createWorld(hooks.seed ?? randomSeed(), { spawning: false });

  const setScreen = (next: Screen): void => {
    screen = next;
  };

  const startRun = (): void => {
    const override = spawnOverride;
    spawnOverride = undefined;
    const seed = runs === 0 && hooks.seed !== undefined ? hooks.seed : randomSeed();
    world = createWorld(seed, { spawning: override === undefined });
    if (override === 'immediate') addObstacle(world, 'thornbush', IMMEDIATE_OBSTACLE_X);
    if (override === 'enemy') addEnemy(world, 'quilboar', HOOK_ENEMY_X);
    if (override === 'kodo') addEnemy(world, 'kodo', HOOK_ENEMY_X);
    stepper = createStepper();
    input.reset();
    fx.clear();
    particles.clear();
    toast.reset();
    syncToastElement(toastEl, toastLevelEl, null);
    hud.clearError();
    hints.clear();
    syncHintElement(hintEl, hints.text);
    runs += 1;
    app.dataset.run = String(runs);
    setScreen('running');
    screens.show('running');
  };

  const endRun = (now: number): void => {
    deathAt = now;
    hud.clearError();
    toast.reset();
    syncToastElement(toastEl, toastLevelEl, null);
    hints.clear();
    syncHintElement(hintEl, hints.text);
    const total = score(world);
    const record = total > best;
    if (record) {
      best = total;
      saveHighScore(store, best);
    }
    setScreen('gameover');
    screens.show('gameover', {
      rage: total,
      distance: Math.floor(world.rage.distanceRage),
      combat: Math.floor(world.rage.combatRage),
      best,
      record,
    });
  };

  const pause = (): void => {
    if (screen !== 'running') return;
    setScreen('paused');
    screens.show('paused');
  };

  const openSettings = (): void => {
    if (screen !== 'title') return;
    setScreen('settings');
    screens.syncSettings(settings);
    screens.show('settings');
  };

  const closeSettings = (): void => {
    if (screen !== 'settings') return;
    setScreen('title');
    screens.show('title');
  };

  const changeSetting = (key: keyof Settings, value: boolean): void => {
    if (key === 'muted') {
      setMuted(value);
      return;
    }
    settings[key] = value;
    saveSettings(store, settings);
    if (key === 'reducedMotion') app.dataset.reducedMotion = String(value);
    else hints.setEnabled(value);
  };

  const resume = (): void => {
    if (screen !== 'paused') return;
    lastFrame = null;
    setScreen('running');
    screens.show('running');
  };

  const release = (): void => {
    if (screen === 'gameover' && screens.releaseReady()) startRun();
  };

  const onAction = (action: Action): void => {
    switch (action) {
      case 'Jump':
      case 'Confirm':
        if (screen === 'title') startRun();
        else if (screen === 'gameover') release();
        else if (screen === 'paused' && action === 'Confirm') resume();
        break;
      case 'Pause':
        if (screen === 'running') pause();
        else if (screen === 'paused') resume();
        else if (screen === 'settings') closeSettings();
        break;
      case 'Mute':
        toggleMute();
        break;
      default:
        break; // Jump release, fast-fall, Charge and Stomp are read via sample()
    }
  };

  const screens = createScreens({
    onStart: () => {
      if (screen === 'title') startRun();
    },
    onResume: resume,
    onRelease: release,
    onOpenSettings: openSettings,
    onCloseSettings: closeSettings,
    onSetting: changeSetting,
    onResetBest: () => {
      best = 0;
      saveHighScore(store, 0);
    },
  });
  showSound();
  const input = createInput(canvas, onAction);
  const bar = createActionBar(byId('action-bar'), assets.atlas, {
    press: (action) => input.pressButton(action),
    release: (action) => input.releaseButton(action),
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
  window.addEventListener('blur', pause);

  // One reused view object: the per-frame redraw allocates nothing (SPEC 12).
  const view: SceneView = {
    world,
    title: true,
    running: false,
    alphaMs: 0,
    sinceDeathMs: 0,
    clockMs: 0,
    fx,
    particles,
    motes: true,
  };
  const renderer = createRenderer(canvas, (ctx) => {
    const now = performance.now();
    view.world = world;
    view.title = screen === 'title' || screen === 'settings';
    view.running = screen === 'running';
    view.alphaMs = stepper.accMs;
    view.sinceDeathMs = now - deathAt;
    view.clockMs = now;
    view.motes = !settings.reducedMotion;
    drawScene(ctx, assets, view);
  });

  let lastFrame: number | null = null;
  const frame = (now: number): void => {
    const delta = lastFrame === null ? 0 : now - lastFrame;
    lastFrame = now;

    if (screen === 'running') {
      const ticks = advance(world, stepper, delta, input.sample());
      input.afterAdvance(ticks);
      const events = drainEvents(world);
      for (const ev of events) {
        const effect = sfxForEvent(ev);
        if (effect) sfx.play(effect);
        if (ev.type === 'AbilityError') hud.showError(ABILITY_ERROR_TEXT[ev.reason]);
        else if (ev.type === 'HintTriggered') hints.trigger(ev.hint);
        else if (ev.type === 'RageSurge') pulseRage(rageEl);
      }
      fx.handle(events, world);
      particles.handle(events, world);
      const dtMs = Math.min(delta, CONFIG.maxFrameDeltaMs);
      fx.update(dtMs, world);
      particles.update(dtMs, world);
      hud.tick(dtMs);
      hints.tick(dtMs);
      syncHintElement(hintEl, hints.text);
      if (toast.observe(score(world))) sfx.play('levelUp');
      toast.tick(dtMs);
      syncToastElement(toastEl, toastLevelEl, toast.text);
      if (isDead(world)) endRun(now);
    }

    hud.update(score(world), best);
    bar.update(world);
    renderer.redraw();
    requestAnimationFrame(frame);
  };

  screens.show('title');
  requestAnimationFrame(frame);
}
