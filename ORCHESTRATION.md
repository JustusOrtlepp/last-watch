# Tauren Runner - Execution Orchestration

| Field   | Value                                                                 |
| ------- | --------------------------------------------------------------------- |
| Status  | v1.0                                                                  |
| Date    | 2026-10-31                                                            |
| Governs | HOW the build is executed (sessions, models, context, tests, gates)   |
| Product | WHAT is built is defined in `SPEC.md` only                            |
| Target  | GitHub Copilot agent mode (VS Code), usage-based billing (AI credits) |

Precedence: `SPEC.md` wins on product behaviour; this document wins on process. If they conflict, stop and record the conflict in `STATE.md` (section 5) for the human.

Each session reads: section 1 (rules), its own package row in section 3, `STATE.md`, and ONLY the `SPEC.md` sections listed for that package. Do not read the rest of this document or of `SPEC.md`.

---

## 1. Rules (every session, MUST)

### 1.1 Sessions

- R1. **One package per session.** A session executes exactly one package from section 3, then stops. Never start the next package in the same session.
- R2. **Fresh context.** Each session starts empty. Continuity comes only from the repository: `STATE.md`, `DECISIONS.md`, git history, and the code. Never rely on chat history.
- R3. **Start sequence:** read `STATE.md` -> confirm the package ID matches the next package listed there -> read the listed `SPEC.md` sections -> work.
- R4. **End sequence:** run the package exit checks (1.5) -> update `STATE.md` (overwrite, template in section 5) -> commit -> post a final message of at most 10 lines -> stop.
- R5. **The model is chosen by the human.** If the active model differs from the package's model in section 3, say so in one line and continue (do not stop).

### 1.2 Context hygiene

- R6. Read files by line range; never read a file over 300 lines in full. Use search (grep/file search) to find the range first.
- R7. Never read `node_modules/`, `dist/`, lock files, coverage, or Playwright traces.
- R8. **Never read a sprite grid file in full after it is written.** For a fix, read only the rows of the affected frame (search for the frame name, then read that range).
- R9. Never paste code, grids, logs, or diffs into chat messages. Chat messages state what was done and point to files.
- R10. Do not re-read a file you have just written or edited unless a check failed on it.
- R11. Use a subagent only for broad codebase questions that would otherwise take 4+ reads; not for single-file lookups.

### 1.3 Command output

- R12. Every command must produce bounded output. Use the npm scripts in 1.4 (they are pre-trimmed). For ad-hoc commands, pipe to a file under `.tmp/` (gitignored) and read only the failing part, or append `| Select-Object -Last 40`.
- R13. Long command lines go into an npm script or a `.ps1` file under `scripts/`; the terminal on this machine kills long one-liners.
- R14. Never start a long-running process (dev server, watch mode) in the foreground. Playwright starts and stops its own server via `webServer` config.

### 1.4 Test scripts (created in P0, used everywhere)

| Script                  | Purpose                                                    | When                                 |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------ |
| `npm run check`         | `typecheck` + `lint` (errors only, `--quiet`)               | after each logical change            |
| `npm run test:quick -- <pattern>` | Vitest, dot reporter, only matching files        | while developing a feature           |
| `npm test`              | full Vitest, dot reporter, failures only                   | package exit                         |
| `npm run test:art`      | grid format + contrast tests only                          | after any art write/edit             |
| `npm run test:fair:dev` | fairness autopilot, `FAIRNESS_SEEDS=50`                    | while developing the spawner         |
| `npm run test:fair`     | fairness autopilot, 1,000 seeds (SPEC 7.4)                 | package exit of P4b, P4c, and all later packages |
| `npm run test:e2e`      | Playwright, `line` reporter, Chromium only                 | package exit from P2b onward         |
| `npm run gallery:shots` | Playwright screenshots of the sprite gallery to `.tmp/gallery/` | M1 review only                 |

- R15. The fairness test reads `FAIRNESS_SEEDS` (default 1000). The 1,000-seed run is the only one that counts for a gate; never lower the default.
- R16. On an autopilot death, the test writes the seed and a compact encounter trace (max 30 lines) to `.tmp/fairness-fail.txt`. Read that file, not the test log.

### 1.5 Package exit checks

- R17. Every package ends with: `npm run check` clean, `npm test` green, `npm run build` succeeds, plus the extra checks in its row (section 3). A package with any red check is **not done**: record it in `STATE.md` as BLOCKED, do not mark it complete.

### 1.6 Loop limits and escalation

- R18. **Three-strike rule:** if the same failure survives 3 fix attempts, stop. Write the diagnosis (symptom, hypotheses tried, suspected cause) into `STATE.md` under Blockers, set status BLOCKED, recommend either a model escalation (Sonnet -> Opus) or a human decision, and end the session.
- R19. **Turn budget:** each package has a turn budget (one turn = one model call / tool round). At 100% of budget, finish the current step and wrap up. At 150%, stop immediately with status PARTIAL and a precise next step in `STATE.md`.
- R20. Never weaken a test, lower a threshold, or skip a gate to finish within budget (SPEC 16).

### 1.7 Art production (M1)

- R21. Write each sprite file with a single file write; do not build it up through many small edits.
- R22. Frames MAY be composed from shared part grids (e.g. a Tauren torso grid plus per-frame leg grids, placed at offsets) by a compose helper in `src/render/art/`. Composed output must still be a 1-bit grid that passes `test:art`. Prefer composition wherever frames share more than half their pixels.
- R23. Order per asset: write grid -> `npm run test:art` -> fix -> next asset. Screenshots only in P1e.
- R24. Human feedback on art is applied in batches (one review round = one session), never frame-by-frame chat iteration.

### 1.8 Git

- R25. Initialise git in P0. One branch per milestone: `m0-scaffold`, `m1-art`, `m2-trex`, `m3-abilities`, `m4-enemies`, `m5-presentation`, `m6-release`, each branched from `main`.
- R26. Commit at least once per package, Conventional Commits from SPEC 16 (no `chore:`), always `git commit -s`. Stage files by name; never `git add .` / `git add -A`. Review `git status` before committing.
- R27. Merging to `main`, pushing, creating PRs, and any Vercel deployment need explicit human approval. Ask, then stop.
- R28. Every file is UTF-8 without BOM. `.tmp/` is gitignored.

### 1.9 Never

- Add runtime dependencies; add dev dependencies not listed in SPEC 4.1 without asking.
- Generate placeholder art (SPEC 15/16).
- Edit `SPEC.md` or this document. Propose changes in `STATE.md` instead.

---

## 2. Model routing

| Model             | Price per 1M tokens (in / cached / cache write / out) | Use for                                                        |
| ----------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| Claude Sonnet 5.5 | $2.00 / $0.10 / $2.50 / $10.00                         | Default: scaffolding, gameplay code, UI, audio, release         |
| Claude Opus 5.5   | $4.00 / $0.20 / $5.00 / $20.00                         | Pixel art (M1) and the spawner/fairness work (P4b, P4c)         |

Escalation: a Sonnet package that hits R18 may be re-run on Opus by the human. Record the escalation in `STATE.md`. Never de-escalate an Opus package to save cost.

Planning rates (for the human's budget, with prompt caching): Sonnet ~3 credits/turn, Opus ~6 credits/turn, Opus art ~9 credits/turn (1 credit = $0.01).

---

## 3. Package plan

Run strictly in order. "Reads" = `SPEC.md` sections to read in that session (always also section 1 of this document and `STATE.md`).

| ID  | Milestone | Model  | Turns | ~Credits | Scope                                                                                                  | Reads (SPEC)                         | Extra exit checks |
| --- | --------- | ------ | ----- | -------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------ | ----------------- |
| P0  | M0        | Sonnet | 50    | 150      | Full M0: scaffold, configs, ESLint sim restriction, `vercel.json`, npm scripts from 1.4, `.tmp/` ignore, `STATE.md`, `DECISIONS.md`, `.github/copilot-instructions.md` (section 6), palette file, grid format, atlas baker, compose helper (R22), gallery, art test harness | 4.1, 4.2, 4.3, 4.4 (production method only), 11, 12, 13, 14.1 (art bullet), 15 (M0), 16 | Gallery page loads; `test:art` runs on one sample grid |
| P1a | M1        | Opus   | 40    | 360      | Tauren: all 21 frames                                                                                  | 1 (vision only), 4.4, 5.1             | `test:art` |
| P1b | M1        | Opus   | 50    | 450      | Quilboar, Plainstrider, Harpy, Centaur Archer, Kodo, Arrow                                              | 4.4, 6.2                              | `test:art` |
| P1c | M1        | Opus   | 25    | 225      | Thornbush, Boulder, Totem pole, ability icons, effects                                                  | 4.4, 6.1, 9.2 (action bar only)       | `test:art` |
| P1d | M1        | Opus   | 20    | 180      | Background layers; gallery animation playback and scroll views at start and max speed                   | 4.3, 4.4, 7.1                         | `test:art` incl. contrast; seamless-tile check in gallery |
| P1e | M1        | Opus   | 15    | 135      | `gallery:shots`; write review index `.tmp/gallery/README.md` (one line per sheet); **STOP for human review.** Next session(s) of P1e apply one batch of feedback each; on approval record sign-off in `DECISIONS.md` | 4.4, 15 (M1)              | Human sign-off recorded (hard gate) |
| P2a | M2        | Sonnet | 50    | 150      | Sim: fixed-step loop, player physics, static obstacles, speed ramp, collision, continuous Rage, determinism hash | 4.2, 5.1, 5.2 (Jump only), 5.3, 6.1, 7.1, 11, 14.1 | Physics and determinism tests green |
| P2b | M2        | Sonnet | 40    | 120      | Renderer with signed-off atlas, ground scroll, RAGE/BEST HUD, title/pause/game-over, persistence, keyboard + touch jump | 4.3, 8, 9, 10.1, 10.3, 14.2         | `test:e2e` |
| P3a | M3        | Sonnet | 50    | 150      | Sim: Charge, War Stomp, GCD, cooldowns, error rules, Rage surges                                         | 5.2, 5.3, 6.3, 11                     | Ability tests green |
| P3b | M3        | Sonnet | 50    | 150      | Action bar, cooldown sweeps, range tint, error text, FCT, ability effects wiring                         | 5.2 (presentation bullets), 9.2       | `test:e2e` |
| P4a | M4        | Sonnet | 60    | 180      | All five enemies, behaviours, stun rules, kill/trample Rage                                              | 6, 11                                 | Enemy and stun tests green |
| P4b | M4        | Opus   | 70    | 420      | Encounters, tier unlocks, tutorial hints, fairness rules 1-4                                             | 7, 11                                 | `test:fair:dev` green |
| P4c | M4        | Opus   | 70    | 420      | Autopilot bot; full fairness gate                                                                        | 7.4, 14.1                             | `test:fair` (1,000 seeds) green |
| P5a | M5        | Sonnet | 45    | 135      | Parallax in game, particles, screen shake, "Ding!" toasts                                                | 4.3, 8, 10.4                          | `test:e2e` |
| P5b | M5        | Sonnet | 45    | 135      | Synthesized audio, settings screen, accessibility items                                                  | 9.1, 10.2, 10.4                       | `test:e2e` |
| P6  | M6        | Sonnet | 80    | 240      | Performance and bundle budgets, CSP check, README, deployment prep; **STOP before deploying** (R27)        | 12, 13, 14.2, 15 (M6)                 | `test:fair`, `test:e2e`, bundle size report |
|     | **Total** |        | **760** | **~3,600 (~$36)** |                                                                                    |                                      |                   |

Milestone completion: the last package of a milestone also confirms the milestone's acceptance criteria in SPEC 15 and asks the human for approval to merge the milestone branch (R27).

---

## 4. Human checkpoints

| When                    | Human action                                                                 |
| ----------------------- | ---------------------------------------------------------------------------- |
| Before P0               | Set a Copilot AI-credits budget with "stop usage when budget is reached" (suggested 6,000 credits). Select Sonnet 5.5. |
| Before each package     | Select the model from section 3; start a new chat; paste the bootstrap prompt (section 7). |
| After any BLOCKED / PARTIAL | Read `STATE.md` Blockers; decide: retry, escalate model, or change SPEC.  |
| P1e                     | Review gallery (in browser: `npm run dev`, `?debug=1&gallery`) and `.tmp/gallery/`. Give feedback in one batch per round, or sign off. |
| End of each milestone   | Approve merge to `main` (and push, if a remote exists).                      |
| P6                      | Approve the Vercel production deployment.                                     |

---

## 5. `STATE.md` template

Overwrite in full at the end of every session. Max 60 lines. History lives in git, not here.

```markdown
# STATE

| Field         | Value                         |
| ------------- | ----------------------------- |
| Last package  | P2a                           |
| Status        | DONE / PARTIAL / BLOCKED      |
| Model used    | Claude Sonnet 5.5             |
| Turns used    | 47 / 50                       |
| Branch        | m2-trex                       |
| Last commit   | <short sha> <subject>         |
| Next package  | P2b                           |

## Done in this package
- <max 8 bullets>

## Next step (exact)
- <the first concrete action for the next session>

## Blockers
- <none | symptom, attempts, suspected cause, recommendation>

## Known deviations / proposals for SPEC or ORCHESTRATION
- <none | item -> needs human decision>
```

---

## 6. `.github/copilot-instructions.md` (created in P0)

Keep it under 15 lines; it is sent with every request. Content:

```markdown
- Process: follow ORCHESTRATION.md section 1. Product: SPEC.md.
- Start: read STATE.md, then only the SPEC sections listed for the current package in ORCHESTRATION.md section 3.
- One package per session; stop after updating STATE.md and committing.
- Bounded output only: use the npm scripts (check, test:quick, test, test:art, test:fair:dev, test:fair, test:e2e).
- Never read sprite grid files in full, node_modules, dist, or lock files.
- Three-strike rule: same failure 3 times -> write diagnosis to STATE.md and stop.
- Commits: Conventional Commits without chore:, always git commit -s, stage files by name.
- No push, merge, PR, or deploy without explicit human approval.
```

---

## 7. Bootstrap prompt (human pastes at session start)

```text
Execute package <ID> per ORCHESTRATION.md. Read ORCHESTRATION.md section 1 and the <ID> row in section 3, then STATE.md, then only the listed SPEC.md sections. Follow the end sequence (R4) and stop.
```

For P1e feedback rounds, append: `Feedback batch: <list of sprite/frame + requested change>` or `Art signed off.`
