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

| Spec | Pins |
|---|---|
| `audio.spec.ts` | **Review Focus #1 / spec §6** — `AudioContext` (and `webkitAudioContext`) are wrapped before any page script; the count is **0** while the title is up and **≥ 1** after Gioca, the first gesture. Also asserts no page error in the pre-gesture window ("silent, not throwing"). |
| `loop.spec.ts` | The core loop (§5) end to end: Play → hold-to-walk (real `pointerdown`/`pointerup`) until the knock cloud beckons → knock → the random resolve (candy **or** Scherzo) → collect everything → the bag grows and settles. Plus a **reduced-motion** run of the same flow (§6/§13 · Review Focus #5). |
| `bottega.spec.ts` | §8 — a bag of exactly 15 buys the Rubber Spider (`Ragnetto`), the wallet drops to 0, the row flips to owned, the next trick is `disabled`, and `dos.run.v1` carries the purchase. |
| `settings.spec.ts` | §6/§13 — the Music/SFX sliders move and persist to `dos.settings.v1` (`musicVolume`/`sfxVolume`), and IT → EN reaches the door copy (the knock pill says "Knock", the ghost greets in English). A second test pins that the settings write never touches the run slot. |
| `menu.spec.ts` | The reopenable title (owner feedback): the HUD 🏠 brings the menu back and Gioca resumes. |
| `persist.spec.ts` | T18b — a collected bag survives `page.reload()`, restored from `dos.run.v1`. |

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
