# STATE

| Field        | Value                                                                  |
| ------------ | ---------------------------------------------------------------------- |
| Last package | P6                                                                     |
| Status       | DONE                                                                   |
| Model used   | Claude Sonnet 5.5                                                      |
| Turns used   | ~40 / 80                                                               |
| Branch       | m6-release (branched from main)                                        |
| Last commit  | see `git log -1` (docs: update state after P6)                         |
| Next package | none (build complete); human release steps below                       |

## Done in this package

- `npm run release:check` (`scripts/release-check.mjs`): bundle report (JS 24.1 KB gzip of 150 KB; first load 27.4 KB gzip) and static checks of `dist/` and `vercel.json` (SPEC 12, 13).
- CSP verified: `tests/e2e/production.spec.ts` serves `dist/` under the exact `vercel.json` headers and plays a run with no console errors or CSP violations; debug hooks absent in production.
- Hot loop made allocation-free where cheap (in-place culling, shared empty event list, reused scene view); `tests/unit/sim/performance.test.ts` (4 tests).
- README with controls, friends-only / unlisted notice, scripts, deployment checklist.
- Whole repo formatted with Prettier (separate `style:` commit); `prettier --check .` clean.
- Exit checks green: `check`, `test` (338), `build`, `release:check`, `test:e2e` (26), `test:fair` (1,000 seeds).
- Decisions recorded in `DECISIONS.md` (P6). Nothing pushed, merged or deployed.

## Next step (exact)

- Human: resolve the open items below, then approve (R27): push `main` (m6-release already merged locally, human-approved 2026-11-01), create the Vercel project (Vite preset, Node 22, NO deployment protection on production) and deploy. After deploy, run the outside checks listed in README (Deployment).
- If a remote and a Vercel project exist, the agent may then run a post-deploy verification of headers and `robots.txt` against the live URL.

## Blockers

- none

## Known deviations / proposals for SPEC or ORCHESTRATION

- **Needs human decision before deploy:** the music track (`src/audio/last_watch_synthwave.mp3`) is AI-generated and released by the owner as CC BY-NC 4.0 (owner decision, 2026-11-01; stated in README). Confirm the generating service's output terms give the owner the rights to license it, or replace the track.
- **Settled (human, 2026-11-01):** the harpy jump conflict (SPEC 6.2 says Jump "no", physics allow a perfect jump) is kept as implemented; see `DECISIONS.md` (P4a). No action needed.
- Not verified on real hardware: 60 fps on a mid-range 2022 Android phone, and first load < 2 s on 4G (budgeted by size only). SFX/music balance, particles, toast placement and the settings layout are verified by tests only, not by eye or ear. A human playtest is recommended before sharing the link.
- The bot is frame-perfect: the gate proves every run is survivable, not that it is comfortable. Playtesting may tune `CONFIG.spawn` margins.
- Remaining short-lived allocations per frame (collision boxes, `find` closures, frame-key strings, spawner `due` list) were left in place.
- Many `CONFIG` keys (`sfx`, `music`, `toast`, `hints`, `spawn`, `enemy`) are not in SPEC 11. `src/content/names.ts` (SPEC 16) does not exist.
- Settings is reachable from the title only. Plainstrider telegraph is a dust cloud only (no sound).
- `scripts/gallery-shots.mjs` overwrites `.tmp/gallery/README.md`.
- `npm audit`: 11 moderate, dev-only, not fixed. Local Node 24.5.0 vs target 22.