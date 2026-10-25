# Dolcetto o Scherzetto — end-to-end suite (T30)

Playwright, **Chromium only**, run against the **built** app (`vite build` →
`vite preview`), never the dev server. The `webServer` block in
`playwright.config.ts` owns both halves of that command; `pnpm test:e2e` is the
only entry point you need.

```bash
pnpm test:e2e              # build + preview + run everything
pnpm test:e2e --ui        # same config, interactive UI mode
PORT=4300 pnpm test:e2e   # dodge another project's server on 4173
```

The first run downloads Chromium if it is missing:

```bash
pnpm exec playwright install chromium
```

## What it pins

Today: **29 tests across 10 specs** (`pnpm test:e2e`, measured 2026-10-25). Each row names
what its spec is responsible for; the boss spec also covers the newest slice (T42).

| Spec | Pins |
|---|---|
| `audio.spec.ts` | **Review Focus #1 / spec §6** — `AudioContext` (and `webkitAudioContext`) are wrapped before any page script; the count is **0** while the title is up and **≥ 1** after Gioca, the first gesture. Also asserts no page error in the pre-gesture window ("silent, not throwing"). |
| `loop.spec.ts` | The core loop (§5) end to end: Play → hold-to-walk (real `pointerdown`/`pointerup`) until the knock cloud beckons → knock → the random resolve (candy **or** Scherzo) → collect everything → the bag grows and settles. Plus a **reduced-motion** run of the same flow (§6/§13 · Review Focus #5). |
| `bottega.spec.ts` | §8 — a bag of exactly 15 buys the Rubber Spider (`Ragnetto`), the wallet drops to 0, the row flips to owned, the next trick is `disabled`, and `dos.run.v1` carries the purchase. |
| `settings.spec.ts` | §6/§13 — the Music/SFX sliders move and persist to `dos.settings.v1` (`musicVolume`/`sfxVolume`), and IT → EN reaches the door copy (the knock pill says "Knock", the ghost greets in English). Further rows pin that the settings write never touches the run slot, that the **Boss** switch persists across a reload, and that the bag chip renders the seeded save on the title. |
| `menu.spec.ts` | The reopenable title (owner feedback): the HUD 🏠 brings the menu back and Gioca resumes. |
| `persist.spec.ts` | T18b — a collected bag survives `page.reload()`, restored from `dos.run.v1`; a seeded done home survives the boot autosave and a reload (the `homes` map is restored into the sim, not just written). |
| `rotate.spec.ts` | T4b — every press of `#rotateBtn` turns the stage a quarter turn left, and the angle persists across a reload. |
| `world-canvas.spec.ts` | T4/T39 — the single `<canvas>` world draws the street and survives walking (page stays error-free, the canvas keeps drawing). |
| `blackbox.spec.ts` | T38 — an interrupted session boots into the crash banner and archives `prev`, the settings open the error-log archive and a session views, the live session records errors and heartbeats, heartbeats reach `localStorage` on their own, a clean close writes `end` and the next boot shows no banner, and the banner's Gioca stays reachable. |
| `boss.spec.ts` | **T42** — a seeded 1 000 bag stages Grande Zucca at the first quiet roam; 30 throws (pointer and keyboard) spend 30 and bank +60, writing `nextBossAt=1500` / `bossWins=1` to `dos.run.v1`; the 5 416 v1 save migrates into its welcome fight; `bossWins` 1/2 stage Mostro Goloso and Re Caramella; the Settings switch off leaves the due fight dormant and turning it off mid-fight cancels above the current bag (plain HUD/rotate clicks prove the overlay's z-order), with `bossWins` still 0; a mid-fight reload keeps the spends, leaves no overlay and re-arms a full-HP fight once the bag crosses 1 000; a reload after a win does not replay it; the fight is fully playable under reduced motion and at rotation 270. |

## How it drives the game

- **Ownership is pointer events.** Hold-to-walk is a `pointerdown`/`pointerup`
  pair on `.walkbtn.r`, dispatched as real events (not `click()`), because the
  control is hold-to-walk. `walkToKnock()` walks in bursts and stops the moment
  the knock cloud shows; a burst that overshoots a doorway simply continues.
- **Randomness is tolerated, never asserted.** A knock on an untouched home is
  60 % treat / 40 % refuse, so `resolveOutcome()` waits for whichever branch the
  reducer rolled and the specs drive that branch. `seedRun()` / `seedSettings()`
  write the localStorage slots via `addInitScript` before boot where a fixed
  start makes a test deterministic (the shop, the language flow, the reload
  test).
- **The Play button is clicked with `force: true`.** It carries an infinite
  `menuInvite` pulse (ISSUES T30 note), so Playwright's stability check never
  settles. Same for the other animated pills; the click event itself is real.
- **The menu hides by class, not by unmount.** `.menu.hide` is `opacity:0` +
  `pointer-events:none`, and Playwright ignores opacity when judging
  visibility — so "is the title up?" is asserted on the class.
- **No fixed sleeps.** Every wait is an `expect`/`expect.poll` against real
  state; the config raises the expect timeout to 10 s for the wall-clock beats
  (knock resolve +2 s, candy flight ~2 s, trick climax ~1.9 s).

## Artifacts

Failures are captured under `test-results/<spec>/` (screenshot +
`trace.zip`) and a browsable report lands in `playwright-report/`. Both are
git-ignored. Open the report with:

```bash
pnpm exec playwright show-report
```

## Environment notes

- The reference viewport is **852×393** (iPhone 16 landscape); the stage scales
  to fit, so the same `fit()` path the phone takes is exercised in Chromium.
- The config defaults to port **4173** (`vite preview`) and can be pointed
  elsewhere with `PORT` when another project holds it.
