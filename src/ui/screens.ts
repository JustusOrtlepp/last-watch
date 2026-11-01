import { CONFIG } from '../config';
import { formatRage } from '../render/hud';
import type { Settings } from '../storage/persistence';

export type Screen = 'title' | 'running' | 'paused' | 'gameover' | 'settings';

export interface GameOverInfo {
  rage: number;
  distance: number;
  combat: number;
  best: number;
  record: boolean;
}

export interface ScreenHandlers {
  onStart(): void;
  onResume(): void;
  onRelease(): void;
  onOpenSettings(): void;
  onCloseSettings(): void;
  onSetting(key: keyof Settings, value: boolean): void;
  onResetBest(): void;
}

export interface Screens {
  show(screen: Screen, info?: GameOverInfo): void;
  /** Mirrors the settings into the settings screen's checkboxes. */
  syncSettings(settings: Settings): void;
  /** True once the game-over debounce has elapsed (SPEC 9.1: 0.5 s). */
  releaseReady(): boolean;
}

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

/** Title / paused / game-over overlays: real DOM with focusable buttons (SPEC 9.1, 10.4). */
export function createScreens(handlers: ScreenHandlers): Screens {
  const app = byId('app');
  const title = byId('screen-title');
  const paused = byId('screen-paused');
  const gameOver = byId('screen-gameover');
  const settingsScreen = byId('screen-settings');
  const announce = byId('announce');
  const startButton = byId<HTMLButtonElement>('btn-start');
  const resumeButton = byId<HTMLButtonElement>('btn-resume');
  const releaseButton = byId<HTMLButtonElement>('btn-release');
  const settingsButton = byId<HTMLButtonElement>('btn-settings');
  const backButton = byId<HTMLButtonElement>('btn-settings-back');
  const mutedBox = byId<HTMLInputElement>('set-muted');
  const motionBox = byId<HTMLInputElement>('set-motion');
  const hintsBox = byId<HTMLInputElement>('set-hints');
  const resetButton = byId<HTMLButtonElement>('btn-reset-best');
  const resetConfirm = byId('reset-confirm');
  const resetYes = byId<HTMLButtonElement>('btn-reset-yes');
  const resetNo = byId<HTMLButtonElement>('btn-reset-no');
  let ready = false;
  let timer: number | undefined;

  title.addEventListener('click', () => handlers.onStart());
  paused.addEventListener('click', () => handlers.onResume());
  releaseButton.addEventListener('click', () => {
    if (ready) handlers.onRelease();
  });

  // The settings button sits inside the title overlay, whose click begins the run.
  settingsButton.addEventListener('click', (ev) => {
    ev.stopPropagation();
    handlers.onOpenSettings();
  });
  // A focused button keeps Space / Enter for itself instead of starting the run.
  settingsButton.addEventListener('keydown', (ev) => ev.stopPropagation());
  backButton.addEventListener('click', () => handlers.onCloseSettings());
  // The settings screen owns the keyboard: Esc goes back, nothing reaches the game input.
  settingsScreen.addEventListener('keydown', (ev) => {
    if (ev.code === 'Escape') {
      ev.preventDefault();
      handlers.onCloseSettings();
    }
    ev.stopPropagation();
  });
  mutedBox.addEventListener('change', () => handlers.onSetting('muted', mutedBox.checked));
  motionBox.addEventListener('change', () =>
    handlers.onSetting('reducedMotion', motionBox.checked),
  );
  hintsBox.addEventListener('change', () => handlers.onSetting('showHints', hintsBox.checked));

  // Reset best Rage asks for confirmation first (SPEC 9.1).
  const askReset = (asking: boolean): void => {
    resetConfirm.hidden = !asking;
    resetButton.hidden = asking;
    if (asking) resetNo.focus();
    else resetButton.focus();
  };
  resetButton.addEventListener('click', () => askReset(true));
  resetNo.addEventListener('click', () => askReset(false));
  resetYes.addEventListener('click', () => {
    handlers.onResetBest();
    askReset(false);
    announce.textContent = 'Best Rage reset.';
  });

  return {
    releaseReady: () => ready,
    syncSettings(settings) {
      mutedBox.checked = settings.muted;
      motionBox.checked = settings.reducedMotion;
      hintsBox.checked = settings.showHints;
    },
    show(screen, info) {
      window.clearTimeout(timer);
      ready = false;
      app.dataset.screen = screen;
      title.hidden = screen !== 'title';
      paused.hidden = screen !== 'paused';
      gameOver.hidden = screen !== 'gameover';
      settingsScreen.hidden = screen !== 'settings';
      announce.textContent = '';

      if (screen === 'paused') resumeButton.focus();
      if (screen === 'title') startButton.blur();
      if (screen === 'settings') {
        resetConfirm.hidden = true;
        resetButton.hidden = false;
        mutedBox.focus();
      }

      if (screen === 'gameover' && info) {
        byId('go-rage').textContent = formatRage(info.rage);
        byId('go-distance').textContent = String(info.distance);
        byId('go-combat').textContent = String(info.combat);
        byId('go-best').textContent = formatRage(info.best);
        byId('go-record').hidden = !info.record;
        releaseButton.disabled = true;
        // Only game over is announced, never score changes (SPEC 10.4).
        announce.textContent =
          `You have died. Rage ${info.rage}. Best ${info.best}.` +
          (info.record ? ' New record!' : '');
        timer = window.setTimeout(() => {
          ready = true;
          releaseButton.disabled = false;
          releaseButton.focus();
        }, CONFIG.ui.releaseDebounceMs);
      }
    },
  };
}
