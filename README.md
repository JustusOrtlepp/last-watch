# Tauren Runner

An endless side-scrolling runner in the spirit of the Chrome "T-Rex Runner", re-themed as a fan parody: a Tauren warrior runs across the red dust of Durotar. Jump, stun with War Stomp, or Charge into enemies. Your **Rage** builds as you run and surges with every stun and kill. **Rage is the score.**

> **Friends only, unlisted.** This game is shared by direct link with a small community of friends. It is non-commercial, not listed anywhere, and asks search engines not to index it (`noindex`, `robots.txt`). It collects no personal data: the only thing stored is your best Rage and your settings, in your own browser (`localStorage`). Please do not post the link publicly.
>
> This is an unofficial fan work. It is not affiliated with or endorsed by Blizzard Entertainment. All art is original pixel art generated in this repository.
>
> **Music:** "Last Watch" (`src/audio/last_watch_synthwave.mp3`) is an AI-generated track by Justus Ortlepp, released by him under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). That licence applies to the track only. The code is under the MIT licence (see `LICENSE`).

## Controls

| Action          | Keyboard                         | Touch                                  |
| --------------- | -------------------------------- | -------------------------------------- |
| Begin / restart | Space                            | Tap                                    |
| Jump            | Space, W or Up (hold = higher)   | Tap the left of the screen             |
| Charge          | Q or 1                           | Charge button                          |
| War Stomp       | E or 2                           | War Stomp button                       |
| Fast fall       | Down or S                        | Swipe down                             |
| Pause / resume  | P or Esc                         | Tap while paused                       |
| Sound on / off  | M                                | Sound button (top left)                |

Static obstacles (thornbush, boulder, totem pole) must be jumped. Enemies can be jumped, stunned with War Stomp, or Charged. The Kodo cannot be jumped and is immune to Charge: stomp it. One hit is death. Settings (sound, reduced motion, tutorial hints, reset best Rage) are on the title screen.

## Development

Requires Node 22 or newer.

```text
npm install
npm run dev            # dev server on http://127.0.0.1:5273 (?debug=1&gallery opens the sprite gallery)
npm run build          # typecheck + production build into dist/
npm run preview        # serve dist/ on http://127.0.0.1:4273
```

| Script                | Purpose                                                                 |
| --------------------- | ----------------------------------------------------------------------- |
| `npm run check`       | typecheck + lint                                                         |
| `npm test`            | unit tests (Vitest, headless sim)                                        |
| `npm run test:art`    | sprite grid format and background contrast tests                         |
| `npm run test:fair`   | fairness gate: the autopilot survives 1,000 seeded runs to Rage 10,000   |
| `npm run test:fair:dev` | the same with 50 seeds (development only)                              |
| `npm run test:e2e`    | Playwright (Chromium); the production spec needs `npm run build` first   |
| `npm run release:check` | bundle size report + static checks of `dist/` and `vercel.json`        |
| `npm run format`      | Prettier                                                                 |

Product behaviour is specified in [SPEC.md](SPEC.md); how the build is run is in [ORCHESTRATION.md](ORCHESTRATION.md); design decisions are logged in [DECISIONS.md](DECISIONS.md).

## Architecture in brief

- `src/sim/` is a deterministic, DOM-free, fixed-step (60 Hz) simulation. Same seed and input log give the same state.
- `src/render/` draws the 960 x 270 canvas from a 1-bit sprite atlas baked at start-up; `src/render/art/` holds all art as code.
- `src/audio/` synthesizes sound effects with Web Audio and loops one bundled music track (fetched lazily after the first gesture).
- No runtime dependencies, no third-party scripts or CDNs.

## Deployment (Vercel)

- Framework preset Vite, build `npm run build`, output `dist`, Node 22. See `vercel.json`.
- **Production must stay link-only**: no login, password or Vercel Deployment Protection on the production domain.
- `vercel.json` sets the Content-Security-Policy and other security headers on every route, `X-Robots-Tag: noindex, nofollow`, and long-lived caching for hashed `/assets/*`. `index.html` carries the `noindex` meta tag and `public/robots.txt` disallows all.
- Before a release run: `npm run check`, `npm test`, `npm run build`, `npm run release:check`, `npm run test:fair`, `npm run test:e2e`.
- After deploying, confirm from outside: the URL opens without login, `curl -I <url>` shows `x-robots-tag: noindex, nofollow` and the CSP, and `<url>/robots.txt` disallows all.
