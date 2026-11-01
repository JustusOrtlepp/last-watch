# Tauren Runner - Specification

| Field   | Value                                                         |
| ------- | ------------------------------------------------------------- |
| Status  | Draft v0.3 (open questions Q1-Q6 decided)                     |
| Date    | 2026-10-31                                                    |
| Purpose | Build prompt for agentic development of a browser game        |
| Target  | Static web app deployed on Vercel                             |
| Audience | Small community of friends; unlisted, reachable by link only; non-commercial |

---

## 1. Vision

An endless side-scrolling runner in the spirit of the Google Chrome "T-Rex Runner" (no-internet dinosaur game), re-themed as a fan parody of World of Warcraft. The player is a **Tauren warrior** running across the red dust of Durotar. Instead of only jumping, the Tauren has a small kit of signature abilities - **Jump**, **War Stomp**, and **Charge**. The warrior's **Rage** builds up continuously as he runs and surges with every stun and kill - **Rage is the score**. Static obstacles must be jumped; enemies can be jumped, stunned with War Stomp, or charged and stunned.

Design pillars:

1. **T-Rex simplicity first.** One-button play must still work for the first ~30 seconds. Abilities layer on top, they do not replace the core jump loop.
2. **Every hazard has a readable answer.** The player can always tell which verb (jump / stomp / charge) solves the next threat.
3. **WoW flavour, not WoW complexity.** Cooldowns, action bar, floating combat text, error messages, "You have died" - but no menus, inventory, talents, or levels beyond a cosmetic gag.
4. **Fair by construction.** The spawner must never generate an unsolvable sequence (enforced by automated tests).

## 2. Scope

### 2.1 In scope (v1)

- Single-player endless runner, desktop and mobile browsers.
- Three active abilities (Jump, War Stomp, Charge); Rage as the score (section 8).
- Static obstacles and five enemy types (section 6).
- Rage score, local best Rage, increasing speed.
- Synthesized sound effects, mute toggle.
- Static deployment to Vercel.

### 2.2 Out of scope (v1)

- Online leaderboards (now or in later versions), accounts, any backend or database.
- Extra lives / survive-a-hit mechanics (e.g. Tauren "Endurance").
- Spending Rage; any fourth ability (e.g. Heroic Strike, Execute).
- Cast bars / cast times (all abilities are instant).
- Multiplayer.
- Day/night cycle (permanent Durotar daylight; black sprites need a light background).
- Additional classes/races, gear, talents, shops, monetization.
- PWA / offline install.
- Gamepad support (keep input layer extensible so it can be added later).

## 4. Technical stack and architecture

### 4.1 Stack

| Concern        | Choice                                                        |
| -------------- | ------------------------------------------------------------- |
| Language       | TypeScript (strict mode)                                      |
| Build          | Vite (latest stable)                                          |
| Rendering      | HTML5 Canvas 2D (no game engine)                              |
| UI overlays    | Plain DOM + CSS (title, pause, game-over, settings)           |
| Audio          | Web Audio API, synthesized SFX (no audio files required)      |
| Unit tests     | Vitest                                                        |
| E2E smoke test | Playwright (Chromium)                                         |
| Lint/format    | ESLint + Prettier                                             |
| Runtime        | Node 22 LTS for tooling; npm                                  |
| Hosting        | Vercel, static output (`dist/`)                               |

**No runtime dependencies** beyond what Vite bundles from the project's own source. Dev dependencies only for build, test, lint.

### 4.2 Architecture

Strict separation between **simulation** (pure, deterministic, headless-testable) and **presentation** (canvas, DOM, audio).

```
src/
  main.ts                 bootstraps app, wires modules
  config.ts               ALL tunable numbers (section 11) - single source of truth
  content/
    names.ts              display strings
    entities.ts           data-driven entity definitions
    encounters.ts         spawn patterns and tier unlocks
  sim/                    NO DOM / canvas / audio imports allowed here
    world.ts              world state, fixed-step update(dt)
    player.ts             player state machine, physics
    abilities.ts          jump, war stomp, charge, GCD, cooldowns
    rage.ts               rage accrual (continuous + surges) = score
    entities.ts           enemy/obstacle behaviour, stun state
    collision.ts          AABB collision
    spawner.ts            encounter selection + fairness rules
    rng.ts                seeded PRNG (mulberry32)
    events.ts             typed event queue (sim -> presentation)
  render/
    renderer.ts           canvas drawing, camera, parallax
    sprites.ts            bakes art grids into the runtime atlas, animation lookup
    art/                  monochrome sprite grids + Durotar background palette (section 4.4)
    fct.ts                floating combat text
    hud.ts                RAGE/BEST counters, action bar, error text
  audio/
    sfx.ts                synthesized sound effects
  input/
    input.ts              keyboard + touch -> abstract actions, buffering
  ui/
    screens.ts            title / pause / game-over / settings overlays
  storage/
    persistence.ts        localStorage with validation
  bot/
    autopilot.ts          perfect-play bot used by fairness tests
tests/
  unit/                   Vitest
  e2e/                    Playwright
```

Rules:

- `src/sim/**` must not import from `render`, `audio`, `ui`, `input`, or touch `window`/`document`. Enforce with an ESLint `no-restricted-imports` rule.
- The sim emits typed events (`PlayerJumped`, `StompCast`, `ChargeHit`, `EnemyStunned`, `EnemyKilled`, `AbilityError`, `PlayerDied`, `Milestone`, ...). Render, audio, and HUD react to events; they never mutate sim state.
- Fixed timestep: 60 Hz simulation with an accumulator; render every animation frame. Clamp frame delta to 250 ms to avoid spiral-of-death after tab switches.

### 4.3 Rendering

- Logical resolution **960 x 270** (all numbers in this spec are logical pixels). Ground line at **y = 230**.
- Canvas scales to container width preserving aspect ratio; handles `devicePixelRatio`; `imageSmoothingEnabled = false` for crisp pixel art.
- Parallax layers: dusty sky haze gradient, distant red rock spires and canyon walls (0.2x), mid jagged red rocks and dry thornscrub (0.5x), cracked red-dust ground strip (1.0x). Optional drifting dust motes.
- **No day/night cycle:** permanent Durotar daylight; the background palette is fixed.
- **Sprites are final in the one and only build** - no placeholder shapes, no later art pass. See 4.4.

### 4.4 Art (final, ship quality)

The delivered build is one-and-done: every sprite, icon, and background is final and "good enough to ship" on first delivery.

**Visual style (MUST):**
- **Sprites are pixelated pure black (`#000000`) on transparent** - T-Rex style. Applies to every gameplay sprite: Tauren, enemies, obstacles, arrow, effects, and ability icons. No colour, no shading, no outlines, no partial alpha, no anti-aliasing in sprite data.
- **Background is the red dust of Durotar** - the only coloured art in the game. Red-orange dust, rust-red rock, hazy peach sky. Starting anchors (the agent may refine):

  | Layer                    | Colour    |
  | ------------------------ | --------- |
  | Sky haze, top            | `#F2C29B` |
  | Sky haze, horizon        | `#E99A6B` |
  | Far spires / canyon walls | `#D9825E` |
  | Mid rocks / thornscrub   | `#C8654A` |
  | Ground strip             | `#A8432C` |
  | Ground dust specks       | `#D97B55` |
  | Ground cracks            | `#6E2416` |

- **Contrast rule (test-enforced):** every background pixel in the gameplay band (from the top of the highest jump/harpy down to the ground line, y = 60..230) must have a contrast ratio of at least **4.5:1 against black** (relative luminance >= 0.175). Further layers are lighter (atmospheric haze), so black sprites always pop. The ground strip below the ground line is exempt.

**Production method** (agent-authorable, no external tools or image files):
- Sprites authored as **1-bit pixel grids** in TypeScript (`src/render/art/sprites/*.ts`): one string per row, `#` = black, `.` = transparent.
- Backgrounds authored as palette-indexed grids or procedural shapes using the Durotar palette (`src/render/art/palette.ts`, max 16 colours).
- At startup the grids are baked once into offscreen-canvas atlases; rendering uses `drawImage` from the atlases only (no per-frame pixel work).

**Quality bar (MUST):**
- Every entity is identifiable by silhouette at 1x scale (the sprites ARE silhouettes).
- Interior detail only through **negative space** (transparent cut-outs), as in the T-Rex eye: eyes, gap between horns and head, axe blade edge, mane strands, feather gaps, arrow fletching.
- Tauren: unmistakable bull silhouette - large curved horns, broad hunched shoulders, hooves, mane/braids, two-handed axe.
- Consistent pixel scale across all sprites; chunky, deliberate pixels (no single-pixel noise).
- Animations loop without visible pops; foot contacts match ground scroll speed (no sliding feet).
- Threat readability through **shape and motion**, not colour: enemies have eyes and animated limbs; obstacles are static and eyeless. Stunned enemies: black swirl above the head + sprite drawn at 50% alpha (grey) while stunned.
- Ability icons: black glyphs on a light button face (HUD provides the face colour).
- Parallax backgrounds tile seamlessly (no visible seams at any scroll offset).

**Sprite list:**

| Asset            | Frame size | Frames                                                                 |
| ---------------- | ---------- | ---------------------------------------------------------------------- |
| Tauren           | 64 x 64    | idle 4 (title), run 6, jump 2 (rise/fall), stomp 3, charge 2, death 4  |
| Quilboar         | 48 x 40    | walk 4, stunned 1, defeated 1                                          |
| Plainstrider     | 48 x 56    | run 4, stunned 1, defeated 1                                           |
| Harpy            | 48 x 36    | flap 4, stunned/falling 1, defeated 1                                  |
| Centaur Archer   | 56 x 64    | idle 2, shoot 3, stunned 1, defeated 1                                 |
| Kodo             | 136 x 124  | walk 4, kneel (stunned) 2                                              |
| Arrow            | 20 x 4     | 1                                                                      |
| Thornbush        | 24 x 28    | 3 variants                                                             |
| Boulder          | 40 x 36    | 2 variants                                                             |
| Totem pole       | 22 x 56    | 2 variants                                                             |
| Ability icons    | 32 x 32    | Jump, Charge, War Stomp                                                |
| Effects          | varies     | stomp shockwave 4, charge dust trail 3, stun swirl 4, hit spark 3      |
| Backgrounds      | tileable   | red rock spires/canyon walls, jagged rocks + thornscrub mid layer, cracked red-dust ground strip (procedural gradients allowed for sky haze) |

**Review gate:** a sprite gallery (`?debug=1&gallery`, dev builds only) renders every sprite, frame, and animation at 1x and 3x, on the Durotar background. All art is produced and signed off in milestone M1, before any game-loop work (section 15). The agent attaches gallery screenshots (Playwright) for review; the user's sign-off gates M2. After sign-off, art changes only with explicit user approval, recorded in `DECISIONS.md`.

## 5. Player: Tauren warrior

### 5.1 Body and movement

- Runs automatically; home x position = **120**.
- Sprite 64 x 64; collision hitbox **40 x 52** (inset, forgiving).
- One hit from an unstunned hazard = death (T-Rex parity). No extra lives, no Endurance passive.
- States: `Running`, `Airborne`, `Stomping`, `Charging`, `Recovering` (drifting back to home x), `Dead`.

### 5.2 Abilities

| Ability       | Default keys             | Touch                   | Cooldown | GCD | Usable when        |
| ------------- | ------------------------ | ----------------------- | -------- | --- | ------------------ |
| Jump          | Space, W, Arrow Up       | tap left 60% of screen  | none     | no  | grounded (+coyote) |
| Charge        | Q, 1                     | action button           | 5.0 s    | yes | grounded, target in range |
| War Stomp     | E, 2                     | action button           | 10.0 s   | yes | grounded           |

Global cooldown (GCD): **0.5 s**, shared by Charge and War Stomp only.

**Jump**
- Initial velocity -820 px/s, gravity 2400 px/s^2 -> max height ~140 px.
- Variable height: releasing the key while `vy < -400` sets `vy = -400` (short hop).
- Jump buffer 100 ms (press slightly before landing still jumps); coyote time 80 ms.
- Fast-fall: pressing Down / S while airborne doubles gravity (T-Rex parity).

**War Stomp** (Tauren racial)
- Instant - no cast time, no cast bar; 0.15 s animation lock (cannot jump during lock).
- Stuns every enemy whose hitbox intersects a circle of radius **160** centred on the player's feet, for **2.0 s**.
- Does not affect static obstacles or projectiles.
- Visual: ground shockwave ring + dust; screen shake 4 px / 150 ms (off with reduced motion).
- +5 Rage per enemy stunned.

**Charge** (warrior)
- Auto-targets the **nearest chargeable enemy ahead** whose distance (player front edge -> target back edge) is within **[60, 420]**.
- Fails with an error message if no valid target:
  - nothing in range -> "Out of range."
  - target closer than min range -> "Target too close."
  - only immune targets (Kodo) -> "Immune."
  - on cooldown / GCD -> "Ability is not ready yet."
- Dash duration 0.18 s; player is **invulnerable** during the dash and passes through anything between.
- On arrival the target is stunned then defeated (knock-back + fade out). +25 Rage for the charge hit plus the target's kill Rage (6.4).
- After the dash the player is in `Recovering` and drifts back to home x at 160 px/s; normal collision applies. Player x is capped at 480.
- While a valid target exists, it shows a red target marker (nameplate style) and the Charge action button is lit; otherwise the button is tinted red (out of range) like WoW action-button range colouring.

Error messages appear top-centre in red text for 1.2 s and play a short "error" blip; only one at a time; repeated identical errors are throttled to 1 per 0.5 s.

### 5.3 Rage (= score)

Rage is the single score of a run. It is not a spendable resource.

- Starts at 0 each run, **only ever increases**, no cap, no decay, no multiplier.
- **Continuous build-up:** +1 Rage per 10 px travelled (~36 Rage/s at start speed, rising with world speed).
- **Combat surges** on top of the continuous build-up:
  - War Stomp: +5 per enemy stunned.
  - Charge hit: +25.
  - Kills and tramples: per-enemy values in 6.4.
- Rage is tracked as two components for internal use: `distanceRage` (continuous) and `combatRage` (surges). The displayed score is their sum. Difficulty tiers use `distanceRage` only (section 7.2).

## 6. Hazards

All horizontal speeds are **relative to the ground** (added to world scroll speed). Heights are hitbox bottom above the ground line.

### 6.1 Static obstacles (jump only)

| Name        | Hitbox (w x h) | Notes                                   |
| ----------- | -------------- | --------------------------------------- |
| Thornbush   | 24 x 28        | single, or cluster of 2-3 (T-Rex cacti) |
| Boulder     | 40 x 36        |                                         |
| Totem pole  | 22 x 56        | tall and thin                           |

Static obstacles cannot be targeted or stunned. Charge passes through them (invulnerable dash).

### 6.2 Enemies

| Enemy          | Hitbox    | Own speed | Behaviour                                                                                  | Jump | Stomp | Charge |
| -------------- | --------- | --------- | ------------------------------------------------------------------------------------------ | ---- | ----- | ------ |
| Quilboar       | 40 x 36   | +60       | Walks toward player.                                                                       | yes  | yes   | yes    |
| Plainstrider   | 36 x 48   | +220      | Sprints; telegraphed by dust cloud 1 s before entering screen.                             | yes  | yes (tight timing) | yes |
| Harpy (low)    | 40 x 28 @ h=10 | +80  | Flies just above ground.                                                                   | yes  | yes   | yes    |
| Harpy (mid)    | 40 x 28 @ h=50 | +80  | Head height: hits standing AND jumping player.                                             | no   | yes (falls, harmless) | yes |
| Harpy (high)   | 40 x 28 @ h=90 | +80  | Pass underneath by staying grounded; hits a jumping player.                                | -    | no (out of reach) | no (out of reach) |
| Centaur Archer | 48 x 60   | 0         | Stands; while 200-700 px ahead fires an arrow every 1.6 s. Arrow 20 x 4 @ h=20, +300 speed. | yes (centaur and arrows) | yes (centaur only) | yes (centaur) |
| Kodo           | 128 x 120 | +40       | Too tall/long to jump (verify via physics test). **Immune** to Charge.                     | no   | **required** (kneels) | no ("Immune.") |

### 6.3 Stun rules

- A stunned enemy stops its own movement (moves only with the ground), stops attacking, shows a "stunned" swirl and a 2 s shrinking bar.
- **Stunned enemies are harmless.** The player tramples through them: enemy is knocked aside, trample Rage awarded (6.4).
- When the stun expires the enemy resumes its behaviour and is lethal again.
- Stunned mid harpies fall to the ground and are defeated on landing.

### 6.4 Kill Rage

| Enemy        | Charge kill | Trample (stunned) |
| ------------ | ----------- | ----------------- |
| Quilboar     | 50          | 25                |
| Plainstrider | 75          | 40                |
| Harpy        | 100         | 50 (fall)         |
| Centaur      | 150         | 75                |
| Kodo         | -           | 200               |

Jumping over an enemy awards no kill Rage (only the continuous build-up), so abilities are rewarded.

## 7. Spawning, difficulty, fairness

### 7.1 Speed

- World speed starts at **360 px/s**, accelerates **+6 px/s per second**, caps at **900 px/s**.

### 7.2 Tier unlocks (by `distanceRage`)

Tiers unlock on the continuous component only, so aggressive play earns more Rage without accelerating difficulty, and every run reaches each tier at the same distance.

| distanceRage from | Adds to the spawn pool                         | First-encounter tutorial hint (once per browser, dismissable in settings) |
| ----------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| 0                 | Thornbush, Boulder                             | "Press Space to jump"                                                     |
| 300               | Totem pole, Quilboar                           | "Press Q to Charge an enemy"                                             |
| 700               | Kodo                                           | "Kodo can't be jumped. Press E to War Stomp!"                            |
| 1200              | Plainstrider, Harpy (low/high)                 | -                                                                         |
| 1800              | Harpy (mid)                                    | "Harpy at head height - Stomp or Charge it"                             |
| 2500              | Centaur Archer                                 | -                                                                         |
| 3500              | Mixed packs (2-3 enemies per encounter)        | -                                                                         |

Hints are shown in-world as a parchment tooltip; the game does **not** pause.

### 7.3 Encounters

The spawner selects **encounters** (short authored patterns, e.g. "Quilboar + Thornbush", "Harpy high + Boulder", "Quilboar pack x3") from `content/encounters.ts`, weighted per tier, using the seeded RNG.

### 7.4 Fairness rules (MUST, test-enforced)

1. Minimum gap between consecutive hazards: `max(gapMin, speed * 0.35 s + previousHazardWidth)`, where `gapMin` = 200.
2. A **stomp-required** hazard (Kodo, or mid harpy when Charge is predicted unavailable) may only spawn if War Stomp is predicted to be off cooldown when the hazard reaches stomp range, assuming the player stomps no earlier than needed. Same principle for Charge-required situations.
3. Never two stomp-required hazards closer together than `stompCooldown + 1 s` of travel time.
4. No encounter may require jumping into a high harpy (a high harpy and a jump-only obstacle must not overlap in the jump window).
5. **Autopilot test:** `bot/autopilot.ts` plays the headless sim with perfect information. Across **1,000 seeded runs to distanceRage 10,000**, the bot must never die. Any death is a spawner bug.

## 8. Scoring and progression

- **The score is Rage** (section 5.3): continuous build-up from running plus combat surges.
- Displayed as `RAGE 00000` (5-digit zero-padded, grows to more digits if needed), with `BEST 00000` to the left (T-Rex parity).
- Combat surges show as floating text ("+25 Rage") and a brief pulse on the RAGE counter.
- **"Ding!" milestones:** every 1,000 total Rage shows a WoW-style level-up toast "Level N" (N = Rage / 1000 + 1, cosmetic, capped at 60 with "Max level reached!") and a short chime.
- Best Rage persisted in `localStorage`.

## 9. Screens and HUD

### 9.1 Screens

| Screen    | Content                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------- |
| Title     | Game name, idle Tauren animation, "Press Space / Tap to begin your adventure", controls summary, settings button |
| Running   | HUD only                                                                                          |
| Paused    | "Paused" overlay; resume with P/Esc or tap. Auto-pause on `visibilitychange` and window blur      |
| Game over | "You have died." + final Rage (with distance/combat breakdown), best Rage, "New record!" badge; **"Release Spirit"** button (= restart, also Space/Enter after 0.5 s debounce) |
| Settings  | Mute, reduced motion (defaults from `prefers-reduced-motion`), show tutorial hints, reset best Rage (with confirm) |

### 9.2 HUD

- Top-right: `BEST` and `RAGE` counters (red RAGE digits).
- Bottom-centre: **action bar** with three square buttons (Jump, Charge, War Stomp): original icons, keybind label in corner, clockwise cooldown sweep with remaining seconds, red tint when out of range / unusable. Buttons are tappable on touch devices (min 48 x 48 CSS px).
- Floating combat text above enemies: "Stunned", "+50 Rage", "Immune", rising and fading over 0.8 s.
- Error text top-centre (section 5.2).

## 10. Input, audio, persistence, accessibility

### 10.1 Input

- Input layer maps raw events to abstract actions: `Jump`, `JumpRelease`, `FastFall`, `Charge`, `Stomp`, `Pause`, `Mute`.
- Keyboard: as in 5.2 plus Down/S fast-fall, P/Esc pause, M mute. `preventDefault` on game keys (no page scroll).
- Touch: tap/hold left 60% = Jump (hold for higher), swipe down = fast-fall, on-screen action buttons for Charge/Stomp. Use Pointer Events; `touch-action: none` on the game area.
- Key repeat must not re-trigger Jump (ignore `event.repeat`).

### 10.2 Audio (synthesized)

Jump, land, charge whoosh + impact, stomp thud, stun, kill, trample, error blip, level-up chime, death. Master volume, mute persisted. AudioContext created/resumed on first user gesture.

### 10.3 Persistence

- Keys: `tauren-runner:v1:highscore`, `tauren-runner:v1:settings`.
- Parse defensively: invalid/corrupt/out-of-range values fall back to defaults; never throw. Wrap access in try/catch (private mode / storage disabled).

### 10.4 Accessibility

- Respect `prefers-reduced-motion`: no screen shake, no palette flashing, softer transitions.
- Ability readiness conveyed by icon brightness + cooldown number, not colour alone.
- Overlays are real DOM with focusable buttons and visible focus rings; the canvas has `role="img"` and an `aria-label`; score changes are NOT announced every frame (announce only game over).
- Contrast of HUD text >= 4.5:1 against its backing panel.

## 11. Tunables (`src/config.ts`)

Every number below MUST live in `config.ts` (no magic numbers in sim code):

```ts
export const CONFIG = {
  logicalWidth: 960, logicalHeight: 270, groundY: 230,
  simHz: 60, maxFrameDeltaMs: 250,
  player: { homeX: 120, maxX: 480, hitbox: { w: 40, h: 52 },
            jumpVelocity: -820, gravity: 2400, shortHopVelocity: -400,
            fastFallMultiplier: 2, jumpBufferMs: 100, coyoteMs: 80,
            recoverSpeed: 160 },
  speed: { start: 360, accelPerSec: 6, max: 900 },
  gcdMs: 500,
  stomp: { cooldownMs: 10000, radius: 160, stunMs: 2000, lockMs: 150 },
  charge: { cooldownMs: 5000, minRange: 60, maxRange: 420, dashMs: 180 },
  rage: { pxPerRage: 10, stompPerTarget: 5, chargeHit: 25 }, // kill/trample values: content/entities.ts
  progression: { milestoneEvery: 1000, maxLevel: 60 },
  spawn: { gapMinPx: 200, reactionSec: 0.35 },
} as const;
```

Values are starting points for playtesting; tests reference `CONFIG`, not literals.

## 12. Non-functional requirements

- **Performance:** steady 60 fps on a mid-range 2022 Android phone and any modern desktop; no per-frame allocations in the hot loop (pool entities, particles, FCT).
- **Bundle:** JS < 150 KB gzipped, including all art data. First load < 2 s on 4G.
- **Browsers:** latest two versions of Chrome, Edge, Firefox, Safari (desktop + iOS).
- **Code quality:** TypeScript `strict`, ESLint clean, Prettier formatted, no `any` in `src/sim`.
- **Security (OWASP):** no `eval`/`new Function`, no `innerHTML` with dynamic data (use `textContent`), no third-party scripts or CDNs, no secrets in the repo. Security headers via `vercel.json` (section 13).

## 13. Deployment (Vercel)

- Framework preset: Vite. Build: `npm run build`. Output: `dist`. Node 22.
- **Unlisted, link-only access (MUST):** the production URL is shared directly with friends; no login, password, or Vercel Deployment Protection on production. The game must not be discoverable: no links from public sites, no search indexing. Anyone holding the link can play - the app therefore collects no personal data and has nothing to protect beyond the local best Rage.
- `X-Robots-Tag: noindex, nofollow` header on all routes, a `robots.txt` disallowing all, and `<meta name="robots" content="noindex, nofollow">` in `index.html`.
- `vercel.json` sets headers on all routes:
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - Long-lived `Cache-Control: public, max-age=31536000, immutable` for hashed `/assets/*`.
- No inline scripts or inline styles in the built `index.html` (CSP compliance; verify in the e2e test by checking for CSP violations in the console).
- Preview deployments per PR; production from the default branch.
- `npm scripts`: `dev`, `build`, `preview`, `test`, `test:e2e`, `lint`, `format`, `typecheck`.

## 14. Testing

### 14.1 Unit (Vitest, against headless sim)

- Jump physics: max height ~140 px; short hop lower; buffer and coyote windows.
- Kodo is physically unjumpable at every speed in [start, max] (simulate best-case jump timing).
- Mid harpy collides with standing and jumping player; high harpy collides only with a jumping player.
- War Stomp: stuns only enemies inside the radius; ignores obstacles and arrows; respects cooldown and GCD.
- Charge: target selection (nearest valid), each error case, invulnerability during dash, Kodo immunity, x cap, recovery drift.
- Stunned enemies harmless; lethal again after stun expiry.
- Rage: continuous rate per px, each surge value, never decreases, `distanceRage` vs `combatRage` split, tiers driven by `distanceRage` only.
- Persistence: corrupt / missing / out-of-range storage values fall back to defaults.
- Art: every sprite grid contains only `#` and `.`, rows of equal width matching the declared frame size; background contrast rule (4.4) holds for every gameplay-band pixel.
- Determinism: same seed + same input log -> identical final state hash.
- **Fairness:** autopilot never dies over 1,000 seeded runs to distanceRage 10,000 (section 7.4).

### 14.2 E2E (Playwright)

- Page loads with no console errors and no CSP violations.
- Title -> Space starts a run -> RAGE counter increases.
- Forced collision (test hook seeded with an immediate obstacle and no input) -> game-over screen -> "Release Spirit" restarts.
- Pause on `visibilitychange`.
- Mobile viewport: action buttons visible and tappable.

Test hooks (seed, spawn override) are only enabled when the URL contains `?debug=1` **and** the build is not production, or via `import.meta.env.DEV`.

## 15. Milestones and acceptance criteria

Implement in order. Each milestone ends with green `lint`, `typecheck`, `test`, and a working `npm run build`. **All art is final and signed off in M1** (section 4.4); every later milestone references the signed-off atlas from its first line of code - no temporary assets at any point.

| # | Milestone              | Acceptance criteria                                                                                                     |
| - | ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| M0 | Scaffold              | Vite + TS strict, ESLint (incl. sim import restriction), Prettier, Vitest, Playwright, `vercel.json`, CI-ready scripts. Blank canvas at logical resolution renders and scales. Palette, pixel-grid format, atlas baker, and sprite gallery in place. |
| M1 | Art + sign-off        | Every asset in the 4.4 sprite list (all frames, effects, ability icons) and all background layers, final. Gallery plays each animation at runtime frame rate and scrolls the parallax layers and the run cycle at start and max speed (foot-sliding and seam check). Art tests green (grid format, contrast rule). Full gallery review against the 4.4 visual style and quality bar; fixes applied; user sign-off recorded in `DECISIONS.md`. **Hard gate: the agent stops here until the user signs off.** |
| M2 | T-Rex parity          | Fixed-step loop, player run/jump/fast-fall, static obstacles, speed ramp, collision, continuous Rage counter, best Rage, title/pause/game-over screens, ground strip scrolling. Playable one-button game using the signed-off art. |
| M3 | Abilities + Rage surges | Charge, War Stomp, GCD, cooldowns, combat Rage surges, action bar with cooldown sweeps and range tint, error messages, FCT, ability effects. |
| M4 | Enemies + spawner     | All five enemies, stun rules, encounter tiers, tutorial hints, fairness rules, autopilot fairness test passing. |
| M5 | Presentation          | Parallax backgrounds in game, particles, screen shake, synthesized audio, "Ding!" toasts, settings screen, accessibility items. |
| M6 | Release               | E2E suite green, performance and bundle budgets met, deployed to Vercel production (reachable by link without login; `noindex` header, meta tag and `robots.txt` verified), README with controls and friends-only/unlisted notice. |

## 16. Instructions for the implementing agent

- Execution process (sessions, models, budgets, tests, gates) is governed by `ORCHESTRATION.md`; follow it.
- Treat this document as the source of truth. If something is ambiguous, choose the option that best preserves the design pillars (section 1), record the decision in `DECISIONS.md`, and continue.
- Do not add runtime dependencies or a game engine. Ask before adding any dev dependency not listed in 4.1.
- Keep all tunables in `config.ts` and all display strings in `content/names.ts`.
- Produce all art in M1 and wait for the user's sign-off before starting M2. Game code references only the signed-off atlas - no placeholder or temporary art at any point.
- Write tests alongside features; never weaken or skip a fairness test to make it pass - fix the spawner.
- Commits: Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `build:`, `ci:`), signed off (`git commit -s`), one logical change per commit.

## 17. Decisions log

| ID | Question                                                                                       | Decision (2026-10-31)            |
| -- | ---------------------------------------------------------------------------------------------- | -------------------------------- |
| Q1 | Add Tauren "Endurance" passive: survive one hit per run?                                        | No - one hit = death (T-Rex parity) |
| Q2 | Should Rage be spendable (e.g. a 4th ability such as Heroic Strike / Execute)?                  | No - the continuous build-up of Rage IS the score (section 5.3, 8) |
| Q3 | Give War Stomp a short cast bar (WoW-accurate 0.5 s cast) instead of instant?                   | No - instant                     |
| Q4 | Keep the name "Tauren Runner"?                                                                 | Yes - small community of friends, unlisted, link-only, non-commercial (section 13) |
| Q5 | Online leaderboard in a later version?                                                          | No                               |
| Q6 | Night phase with black sprites: how dark may "night" get?                                      | No day/night cycle - permanent Durotar daylight (section 2.2, 4.3) |
