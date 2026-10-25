# Candy Boss — design spec

- **Date:** 2026-10-25
- **Status:** draft for owner review
- **Owner decisions:** friendly challenge (no fail), every 500 candies from 1 000, rotating cast of three, tap anywhere, enabled by default with a Settings toggle.

## 1. Summary

Every 500 candies the street hosts a short, friendly boss beat. A giant
monster walks in, the duo throws the candies in the bag at it, and after
30 hits the monster burps confetti and a 60-candy shower. Nothing can hurt
the player, the fight has no timer, and the reward always exceeds the
30 candies spent. The bosses rotate — Grande Zucca, Mostro Goloso, Re
Caramella — and the next threshold plus the win count are persisted.

The feature is a **page-level event**, not a new sim phase: a pure
`boss-model.ts` decides *when* and *who*, a DOM `Boss.svelte` overlay stages
the fight above the paused world, and the existing canvas/scrolling path is
untouched. This keeps the iOS memory work (T4/T39) intact.

## 2. Player experience

1. The bag reaches a threshold (first at 1 000, then every 500).
2. At the next quiet moment the street stops, a veil dims the world, and the
   boss stomps in at centre-right with its name.
3. A hint says **“Tocca per lanciare caramelle” / “Tap to throw candy”**.
4. Every tap anywhere on the stage spends 1 candy, arcs a candy at the boss and
   makes it squash/laugh. A candy-meter counts down from 30.
5. At 0: the boss turns happy, burps confetti and a 60-candy shower, and the
   duo keeps the net +30. The next threshold is saved, the boss leaves, and
   walking/knocking come back.
6. Nothing is timed; the boss waits if the player stops. There is no fail
   state and no lost run.

## 3. Cadence and persistence

- First threshold: **1 000**.
- Then every **500**: 1 500, 2 000, 2 500…
- `nextBossAt` is the threshold of the boss about to appear.
- After a win, the next threshold is the smallest multiple of 500 **strictly
  above the post-reward bag**, with a floor of 1 500. Examples:
  - win at 1 000 → reward 60 → bag 1 060 → next 1 500;
  - win at 1 500 → bag 1 560 → next 2 000;
  - the 5 416 welcome save → bag 5 476 → next 5 500.
- `bossWins` is the number of bosses beaten; it drives the rotation
  `BOSS_ORDER[bossWins % 3]`.
- The current 5 416 save has no boss fields. Migration sets
  `nextBossAt = 1 000`, `bossWins = 0`, so it gets **one welcome Grande Zucca
  immediately** after Gioca, then the next at 5 500.
- The boss only starts at a quiet moment: `phase === 'roam'`, shop closed, no
  scare, no celebration banner, title menu closed. If the bag is spent below
  the threshold at the Bottega, the boss simply waits for the next crossing.
- Skipping through the Settings toggle (or cancelling a live fight) uses
  `nextBossAtAbove(bag)` — the smallest multiple of 500 strictly above the
  current bag, minimum 1 000 — not the post-win floor of 1 500. A bag below
  1 000 therefore waits for 1 000, not 1 500.

## 4. Fight mechanics

| Knob | Value | Meaning |
|---|---|---|
| `BOSS_FIRST` | 1 000 | first threshold |
| `BOSS_STEP` | 500 | threshold grid |
| `BOSS_HP` | 30 | hits to defeat |
| `BOSS_COST` | 1 | candy spent per throw |
| `BOSS_REWARD` | 60 | candies awarded on the win |

- A tap is accepted only while the fight is live, `hp > 0`, and `bag > 0`. It
  dispatches `SPEND_CANDY` (1), decrements the local HP, and plays the hit.
- No cooldown: fast tapping is fun. The cosmetic candy-flight is capped at
  8 concurrent nodes; beyond that the hit still counts and the flight is
  skipped.
- The boss's reaction is a CSS squash plus a face change; no JS frame loop.
- The HP meter is a bar + `hp / 30` text with `role="progressbar"`.
- The win is final on the 30th hit. The page dispatches `BOSS_REWARD` (60),
  reads the new bag, computes `nextBossAt`, and records the win **in the same
  update** so autosave never sees a transient state.
- If the app is closed mid-fight, the candies already spent stay spent and the
  threshold stays; on the next boot the boss can be retried once the bag is
  back over the threshold. There is no hidden penalty beyond the spent throws.

## 5. Boss cast and art

One shared fight rig (the `Boss` component and its timer/projectile model),
three SVG bodies from `boss-art.ts` (full `<svg>` strings, class hooks for
eyes/mouth/arms/body/crown), each `viewBox="0 0 260 280"`:

| id | IT | EN | palette / silhouette |
|---|---|---|---|
| `zucca` | Grande Zucca | Great Pumpkin | pumpkin orange + deep shade, green stem, amber crown, huge grin |
| `mostro` | Mostro Goloso | Sweet-Tooth Monster | lavender fur, pale belly, long tongue, little horns |
| `recaramella` | Re Caramella | Candy King | berry wrapper cape, lollipop shoulders, amber candy crown |

- The boss is a DOM overlay inside the stage (so it inherits the stage scale and
  the manual rotation); it is not drawn in the canvas.
- The component animates a **static** SVG: entry slide/stomp, idle bob, hit
  squash, happy spin, exit. No per-frame JS art.
- The projectile reuses `candySvg(type)` from `$lib/art/sprites/candy` with a
  random type; the reward shower reuses the same art.
- No new audio assets: entry uses `theatre-setup`, hits `pop`, the win
  `theatre-laugh` + `twinkle`, and the celebration stinger. New cue names are
  out of scope.

## 6. UI and page orchestration

New files:

- `src/lib/play/boss-model.ts` — pure constants and decisions.
- `src/lib/play/boss-art.ts` — the three SVG builders and names.
- `src/lib/play/Boss.svelte` — the overlay, tap surface, HP meter, projectiles,
  win shower.
- `src/lib/play/boss-setting.svelte.ts` — reactive `bossesEnabled()` /
  `setBosses()`, reading/writing the settings envelope.

Page (`src/routes/+page.svelte`):

- Holds `boss: { id: BossId } | null` (the component owns the fight phases).
- A trigger `$effect` reads `bag()`, `bossNextAt()`, `bossesEnabled()`,
  `phase()`, `shopOpen()`, `scareActive`, `menuState.open`, the celebration
  `beat`, and `boss`; when all gates pass it dispatches `STOP`, sets `boss`.
- While `boss` is non-null:
  - `WalkControls`, `KnockButton`, `Scherzo` and the Bottega button are hidden;
  - the rotate button, bag chip and home button stay usable;
  - `Boss` is mounted above the world (z-index 10), below the HUD/rotate
    (11+), with a full-stage tap surface; the boss art itself is
    `pointer-events: none`.
- `Boss` callbacks:
  - `onThrow(): boolean` — page dispatches `SPEND_CANDY` and returns whether the
    bag allowed it; the component counts the hit on `true`.
  - `onWin()` — page dispatches `BOSS_REWARD`, computes the next threshold from
    the new bag, records the win.
  - `onExit()` — page clears `boss`, restoring the controls.
- The boss fights only at a quiet moment, but ambient layers are not forcibly
  stopped: walking and world scroll freeze (`STOP`), the walk/knock/Scherzo/
  Bottega controls leave the DOM, and no new scare, street beat, celebration or
  knock can start (their gates need `dir !== 0` or a quiet phase). The canvas
  keeps drawing the same frame; background NPC idle motion is harmless.
- The component has its own timers (entry 900 ms, win beat 1 200 ms, shower
  900 ms, exit 700 ms) and clears them on destroy.
- The world is frozen by `STOP`; the canvas keeps drawing the same frame. The
  scrolling raster path is untouched.

## 7. Settings

- New optional field in `dos.settings.v1`: `bosses?: boolean`, missing = `true`.
- `DEFAULT_SETTINGS.bosses = true`.
- `isSettings` accepts a missing field and requires a boolean if present.
- Settings card gets a parent-facing row:
  - label **Boss**,
  - two buttons **Sì / No** (IT) · **On / Off** (EN), `aria-pressed`,
    default **Sì/On**.
- `boss-setting.svelte.ts` is the reactive seam; it writes
  `{ ...settings.read(), bosses }` so language/volumes/rotation are preserved.
- Disabling while a boss is active cancels the fight, keeps the candies already
  spent, and sets `nextBossAt` to the next grid point above the current bag so
  re-enabling does not immediately re-trigger.
- Disabling while idle simply suppresses future triggers; the stored threshold
  stays.

## 8. Sim changes

Two actions, no new phases:

- `{ type: 'SPEND_CANDY' }` — if `bag > 0`, `bag -= 1`, else return the same
  state. Never goes negative.
- `{ type: 'BOSS_REWARD'; n: number }` — `bag += n`, `record = max(record,
  bag)`. Guard `n` as a finite positive integer; the page always passes 60.

Both are pure reducer cases with unit tests. The boss's HP/phase stays in the
component; the sim only owns the wallet mutations.

## 9. Save schema and migration

`RunState` v2 gains:

- `nextBossAt: number`
- `bossWins: number`

Rules:

- `migrateRunV1` returns the existing v2 fields plus `nextBossAt: 1000`,
  `bossWins: 0`.
- A v2 envelope written before this feature (no boss fields) is **accepted**
  and normalised to the same defaults. A kid must not lose a save because the
  schema grew.
- If present, `nextBossAt` must be a finite integer ≥ 1 000 and a multiple of
  500; `bossWins` must be a finite integer ≥ 0. A malformed `nextBossAt` is
  repaired to `nextBossAtAbove(bag)` when the bag is already above 1 000,
  otherwise 1 000; a malformed `bossWins` becomes 0. Repair, never wipe.
- The autosave effect writes v2:
  - live `bag`, `record`, `tricks`, `furthestK`;
  - live `homes()` mapped to `SavedHome`;
  - `album` and `cosmetics` preserved from the loaded save (or
    `emptyAlbum()` / `[]` when the save predates them); the album UI is not
    part of this feature;
  - `nextBossAt`, `bossWins` from the boss progress store.
- This autosave change also resolves the pre-existing v1-literal type errors
  and the 3 `persist.test.ts` failures already in the tree.
- The boss progress store lives in `state/game.svelte.ts`, seeded from
  `persist.read()`: `bossNextAt()`, `bossWins()`, `recordBossWin(nextAt)`,
  `skipBoss(nextAt)`.
- The parent reset clears the one run key; a fresh run starts at 1 000 / 0.

## 10. Audio, accessibility, reduced motion

- Audio: existing cues only; the SFX master mute and volumes apply unchanged.
- The tap surface is a real button-like element with
  `aria-label="Lancia una caramella"`, keyboard Space/Enter support and a focus
  ring, so the fight is playable without a pointer.
- The boss name is text, the HP bar is a `progressbar`, and a visually hidden
  live region announces the win and the +60 reward.
- `prefers-reduced-motion: reduce`:
  - no stage shake, boss bob, confetti fall or looping hint pulse;
  - entry is a short fade/slide, hits are a subtle scale/colour change, the win
    is a fade;
  - the fight and the reward stay fully functional.

## 11. Performance and iOS constraints

- No new canvas work, no new scrolling layer and no new raster cache; the world
  is paused during the fight.
- DOM nodes are bounded: one boss SVG, ≤ 8 in-flight candies, ≤ 12 shower
  pieces; all timers are cleared on destroy.
- The overlay lives inside the 852×393 stage, so the stage's scale and manual
  rotation apply automatically; no `position: fixed`.
- The overlay is removed after the fight; the canvas loop and the existing
  crash instrumentation stay untouched.

## 12. Testing

Unit:

- `boss-model`: due/threshold maths, 500-grid, floor 1 500, rotation by wins,
  reward/threshold examples (1 060→1 500, 1 560→2 000, 5 476→5 500), guards.
- `loop`: `SPEND_CANDY` never below zero; `BOSS_REWARD` adds and updates the
  record.
- `persist`: v1 migration, mid-v2 defaults, malformed-field repair, round-trip.
- `settings`: `bosses` default true, optional field, boolean validation.

E2E:

- seed a v1 run with bag 1 000 → welcome boss at the first play; 30 taps; bag
  1 000 → 970 → 1 030; `nextBossAt=1500`, `bossWins=1`; reload → no boss.
- seed bag 5 416 → welcome Zucca; after the win → `nextBossAt=5500`.
- seed `bossWins=1`, bag 1 500 → Mostro Goloso; `bossWins=2` → Re Caramella.
- settings `bosses:false` → no boss at 1 000; re-enable → it appears.
- reduced motion → fight still completes.
- visual screenshots of all three at entry, mid-fight and win, plus one rotated
  stage.
- full regression: e2e 16/16, lint, svelte-check (now 0 errors), unit green
  including the previously failing persist suite.

## 13. Acceptance criteria

1. With bosses on, a bag crossing 1 000 starts Grande Zucca at the next quiet
   roam; 30 taps win; the bag nets +30; the next threshold is 1 500; the win
   count is 1; reload does not re-trigger.
2. The 5 416 save gets one welcome boss immediately after Gioca, then 5 500.
3. The cast rotates Zucca → Mostro → Re Caramella by win count.
4. With bosses off, no boss appears; the setting survives reloads; toggling off
   mid-fight cancels it without a reward and without an instant re-trigger.
5. The fight works with taps and keyboard, under reduced motion, in portrait
   rotation, and at the 1 000 threshold.
6. No canvas/scrolling regression: the world pauses, the overlay is bounded and
   removed, and the existing 16 e2e tests stay green.
7. The save is v2 with `nextBossAt`/`bossWins`, the old v1/v2 saves migrate
   without a wipe, and the 3 pre-existing unit failures + 2 type errors are
   gone.

## 14. Out of scope

- Boss attacks, fail states, lost runs or negative candy.
- Boss difficulty scaling or per-boss mechanics.
- A boss cosmetic/crown on the duo, album UI changes, or new audio assets.
- A second save key.

## 15. Risks and notes

- The 5 416 save gets a welcome boss and then another at 5 500 (84 candies
  later). That is intentional; the first is a catch-up gift, the second is the
  normal grid.
- Bosses every 500 are tunable through the exported constants; the player-
  facing cadence can be slowed later in BALANCE without a schema change.
- The z-order between the boss tap surface, the rotate button and the HUD is
  the main UI risk; the spec places the boss at z 10 and keeps everything the
  player still needs above it.
- Finishing the v2 autosave is required for persistence; it is scoped to
  preserving `album`/`cosmetics` and writing the live fields. The album feature
  itself stays out of scope.
