import './style.css';
import { startGame, type DebugHooks } from './game';

const canvas = document.getElementById('game');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #game canvas');

const params = new URLSearchParams(window.location.search);

/** Test hooks (SPEC 14.2) exist only in dev builds and only with `?debug=1`. */
function debugHooks(): DebugHooks {
  if (!import.meta.env.DEV || params.get('debug') !== '1') return {};
  const seed = Number(params.get('seed'));
  const spawn = params.get('spawn');
  return {
    seed: params.has('seed') && Number.isInteger(seed) ? seed >>> 0 : undefined,
    spawn:
      spawn === 'immediate' || spawn === 'enemy' || spawn === 'kodo' || spawn === 'none'
        ? spawn
        : undefined,
  };
}

// The sprite gallery is a dev-only review tool (SPEC 4.4); it is dead-code-eliminated from
// production builds.
if (import.meta.env.DEV && params.has('debug') && params.has('gallery')) {
  const app = document.getElementById('app');
  void import('./render/gallery').then((m) => m.mountGallery(app ?? document.body));
} else {
  startGame(canvas, debugHooks());
}
