# Dolcetto o Scherzetto Implementation Plan (TO-PROD)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Dispatch:** task ↔ issue mapping in `docs/ISSUES.md`. Executors read **the spec + their task** and expand the task's steps into TDD micro-steps at dispatch time (each task below states its files, interfaces and acceptance precisely so the expansion is mechanical).

**Goal:** Ship the cozy endless Halloween trick-or-treat game (spec) as a SvelteKit 5 PWA on Vercel, landscape-first for iPhone 16, fully voiced in IT+EN, saved locally.

**Architecture:** Pure TS sim (`src/lib/sim`) drives a DOM/SVG Svelte scene (no canvas) that keeps a recycling window of ~20 homes; audio is WebAudio (synth SFX + real generated assets) with one master mute; persistence is defensive localStorage. Art is hand-built SVG (motion) + flux2 stills (static); all generated assets are baked at build time from the maintainer's local studios.

**Tech Stack:** SvelteKit 5 + TypeScript + Vite · adapter-vercel · PWA (SW offline shell) · Fredoka · Vitest + Playwright · pnpm.

**Spec:** `docs/superpowers/specs/2026-10-16-dolcetto-o-scherzetto-design.md` (the plan argues from the spec; executors read both).

## Global Constraints

Values copied verbatim from the spec / ADRs — every task's requirements include these:
- Stage reference **iPhone 16 landscape: 852×393 pt**; height-scaled, fluid width; portrait → friendly rotate screen; respect `env(safe-area-inset-*)`.
- **No canvas** (ADR-0001). DOM/SVG only; **transform/opacity motion only**; recycling window ~20 homes; node budget documented.
- **`prefers-reduced-motion: reduce`** kills bobs/trembles/flashes everywhere; fades and crossings stay.
- Sim constants (pinned): `SPEED 190` px/s · `SPACING 620` · `NEAR 70` · `TREAT_P 0.60` · `REGIFT_P 0.30` (once ever) · burst counts 4–8 by trick tier · prices `0/15/30/45/60/75/90/110` (BALANCE may tune).
- Scary moments: **walking-only, ≥60–120 s apart**, veil dim+wash ≤1 s (**no strobe**), crossings 1.5–1.8 s, kids' beat 2.5 s, moderate sounds.
- Audio peaks **≤0.18**; one master mute; audio context created on first user gesture.
- **IT default + EN toggle**, settings persisted; all lines voiced from `voice/lines.json` (both languages before shipping a line).
- Persistence: **localStorage only**, versioned keys, defensive (never throws), one slot, autosave, hidden parent reset (ADR-0006).
- All audio/raster assets generated **at build time with the local studios**, never at runtime (ADR-0002).
- Quality bar: `pnpm check` clean · Vitest unit suite · Playwright e2e suite · console-clean · both languages complete.

## Review Focus

Five failure modes no single task's happy-path tests cover — each has a pinning test listed on the owning task:
1. **iOS audio unlock** — first gesture must create/resume AudioContext; sends before any gesture must be silent, not exceptions *(T31)*.
2. **Held-button touch input** — pointercancel/pointerleave/scroll must never leave the kids walking forever; halves + corner buttons + keys agree *(T11)*.
3. **Long-run memory/node growth** — 30-minute walk keeps node count bounded (recycling) *(T32)*.
4. **Save survival across redeploys** — versioned key read/write, corrupted payload → fresh start without throwing *(T03, T31)*.
5. **Reduced-motion consistency** — everything still playable and readable with all ambient loops off *(T33)*.

## File Structure (production)

```
src/lib/sim/        loop.ts · economy.ts · progression.ts        (+ *.test.ts)
src/lib/art/scene/  Stage · Sky · Street · HouseSlot · Yards · Cars · Ghosts · Npcs · Ornaments (.svelte)
src/lib/art/sprites/ index.ts · kids.ts · neighbors.ts · props.ts · ornaments.ts · motion.css
src/lib/play/       Kids · Bubbles · CandyLayer · KnockButton · Fan · Theatre · Scares (.svelte)
src/lib/ui/         Hud · TitleScreen · Bottega · Settings · RotateOverlay (.svelte)
src/lib/audio/      sfx.ts · ambience.ts · music.ts · voice.ts
src/lib/persist/    persist.ts · settings.ts                     (+ *.test.ts)
src/lib/i18n/       ui.ts · lines.ts
src/routes/         +page.svelte · +layout.ts (ssr=false)
static/             voice/<lang>/* · music/* · ambience/* · icons/* · manifest.webmanifest
tools/              gen-icons.mjs · gen-voice.mjs (wraps game_voice)
tests/e2e/          *.spec.ts
```

---

## Phase 0 — Foundation

### T01 — Scaffold the SvelteKit mirror
**Files:** create project root (Vite/SvelteKit 5, TS strict), `svelte.config.js` (adapter-vercel), `package.json` scripts (`dev/build/test:unit/test:e2e/check/lint`), eslint+prettier configs mirroring the sibling project.
**Deliverable:** `pnpm dev` serves a Fredoka hello page; `pnpm check` clean.
**Acceptance:** `pnpm check && pnpm build` pass; `pnpm exec playwright --version` works.

### T02 — Design tokens + night base styles
**Files:** create `src/app.css` (palette tokens from ART-STYLE §3), `src/app.html` (Fredoka, viewport, manifest link), reduced-motion base.
**Deliverable:** token variables + global `@media (prefers-reduced-motion)` policy utility classes.
**Acceptance:** visual smoke at 852×393; tokens importable; no off-palette hard-codes in later tasks (grep check).

### T03 — Persist + settings modules
**Files:** create `src/lib/persist/persist.ts`, `src/lib/persist/settings.ts` (+ tests).
**Interfaces:** produces `createPersist(storage)` with `read()/write(state)` never-throwing; keys `dos.run.v1`, `dos.settings.v1`; settings = `{ lang, sound }`.
**Deliverable:** defensive wrappers mirroring the sibling project's patterns.
**Acceptance:** Vitest: null storage no-ops; corrupted JSON → defaults; versioned key round-trip; **Review Focus #4 pin**: corrupted payload start-fresh test.

### T04 — PWA shell
**Files:** `static/manifest.webmanifest` (orientation landscape, theme color), `src/service-worker.ts` (offline shell network-first), `tools/gen-icons.mjs` (SVG mark → PNG set).
**Deliverable:** installable PWA; cold offline reload shows the shell.
**Acceptance:** `pnpm build && pnpm preview`; Lighthouse installability checks; icons render.

## Phase 1 — Core sim (pure, TDD)

### T05 — Lift the Loop module to `src/lib/sim/loop.ts`
**Files:** create `loop.ts`, `loop.test.ts` (port `Loop` from `prototypes/scene-prototype.html`).
**Interfaces (produces):** `initial(opts)`, `reduce(state, action)`, `tick(state, dt)`, `TRICKS`, `TRICK_ORDER`, `SPACING/SPEED/NEAR`.
**Deliverable:** typed pure sim, no DOM.
**Acceptance:** table-driven: walk +190 px/s per second; knock force-outcomes (treat/refuse/regift/seen); refuse→walk-away closes; collect → bag/record; trick phase → burst 4–8; RESET semantics.

### T06 — Economy module
**Files:** create `economy.ts` + tests.
**Interfaces (produces):** `rollValue()` uniform 1–10; `treatCount(rng)` 1–2; `burstFor(trickId)`; `buy(state, id)` price guards.
**Acceptance:** distribution sanity (bounds, seeded rng); buy rejected when poor/owned; bag math exact.

### T07 — Progression module
**Files:** create `progression.ts` + tests.
**Interfaces (produces):** `neighborhoodIndex(furthestK)` (÷10), `refusalP(index)` and `richnessBias(index)` (BALANCE placeholders with soft caps), `themeFor(index)` cycling 4 themes.
**Acceptance:** monotonic furthest tracking; caps hold; theme rotation 0-1-2-3-0.

## Phase 2 — Playable scene

### T08 — Stage, sky, fit, rotate overlay
**Files:** `src/lib/art/scene/Stage.svelte`, `Sky.svelte`, `src/lib/ui/RotateOverlay.svelte`.
**Deliverable:** 852×393 stage scaled to height, fluid width; sky gradient, moon, stars, parallax; portrait overlay.
**Acceptance:** e2e placeholder: at 852×393 the stage matches reference layout; at portrait the overlay shows; safe-area padding honored on a notched simulator.

### T09 — Houses, yards, doors (recycling window)
**Files:** `Street.svelte`, `HouseSlot.svelte`, `Yards.svelte`; sprites from `src/lib/art/sprites/` (port `pieces/sprites.js`) + house pack from `pieces/houses.js` (8 types × 3 palettes, door contract).
**Deliverable:** windowed house rendering (≤20 slots), door open/close, window dim on done, yard dressing per theme.
**Acceptance:** unit-ish (Vitest + jsdom or testing-library): walking 50 houses keeps slot count ≤20; done state persists per house while in window.

### T10 — The kids duo + walk input
**Files:** `Kids.svelte`, `src/lib/play/Kids` wiring, input handlers.
**Deliverable:** Milo+Tino walk cycle (pack `.walking` hooks), flip, hold-to-walk (corner buttons + halves + keys).
**Acceptance:** e2e: press-and-hold moves at spec speed; release stops; **Review Focus #2 pin**: pointercancel/leave stop walking; keys parity.

### T11 — Knock → greet → resolve; bubbles
**Files:** `KnockButton.svelte`, `Bubbles.svelte`, flow wiring.
**Deliverable:** in-range floating knock; door opens; greet bubble+voice hook; outcome resolves (treat/refuse/regift/seen).
**Acceptance:** e2e treat flow: knock → open → candies appear; refuse flow: SCHERZO appears.

### T12 — Candy layer: float, pile, collect
**Files:** `CandyLayer.svelte` (port the 2 s float + bob + stagger + twinkle + idle bob).
**Deliverable:** candies float down lightly, settle, wait; tap → bag + `+N` + fly-to-bucket.
**Acceptance:** e2e: collect all → bag equals sum; sprites' idle bob pauses under reduced-motion.

## Phase 3 — Scherzo & theatre

### T13 — Fan + selection
**Files:** `Fan.svelte`.
**Acceptance:** only owned tricks listed; pick starts the show; ✕ closes; keyboard/tap parity.

### T14 — Theatre stage + 8 shows
**Files:** `Theatre.svelte` (port `pieces/theatre.js` choreography; veil+cone+props).
**Deliverable:** the eight staged shows, watch-and-laugh; climax callback → burst.
**Acceptance:** e2e: each trickId shows its prop element and fires burst after ~1.9 s; `prefers-reduced-motion` keeps fades only.

### T15 — Scherzo wiring + sky-ghost hop
**Files:** flow wiring; `Ghosts.svelte` hop hook.
**Acceptance:** e2e: refuse → scherzo → collect → home done; ghosts hop once per show.

## Phase 4 — Store, meta, settings

### T16 — Bottega panel
**Files:** `Bottega.svelte`; witch sprite; scroll list of 8.
**Acceptance:** e2e: buy when affordable → owned + bag reduced; poor → disabled; already owned → "Tuo!".

### T17 — Title menu + settings + hidden reset
**Files:** `TitleScreen.svelte`, `Settings.svelte`; extend `settings.ts` shape to `{ lang, sound, musicVolume, sfxVolume }` (+ tests) and add `setVolume` to the audio modules.
**Deliverable:** opening screen with **Gioca / Impostazioni**; Settings = separate **Music** and **SFX** sliders (persisted; music default = owner-tuned `MUSIC_MAX 0.143`), IT/EN toggle; Play unlocks audio and enters the game.
**Acceptance:** e2e: Play → last save; both sliders persist across reload and audibly scale the right layers (music+ambience vs SFX); long-press reveals parent reset which clears both keys.

### T18 — Celebration + neighborhood transition beat
**Files:** transition overlay + stinger hook.
**Acceptance:** crossing a 10-home boundary shows the beat once; never during a flow.

## Phase 5 — Ambience cast & scares

### T19 — NPC kids
**Files:** `Npcs.svelte` (pool 4–6, roam, wrap, wave, shout hook), kids sprites.
**Acceptance:** bounded nodes over a long run; wave triggers once per pass; shouts call the voice hook with a random line id.

### T20 — Cars + passer
**Files:** `Cars.svelte` (parked per-block patterns + rare passer with headlights).
**Acceptance:** passer ≤ once per 60–90 s window; `.rolling` only while moving; reduced-motion keeps the drive (it's translation, allowed) but no extra flourishes.

### T21 — Sky ghosts + trash-can cameo
**Acceptance:** 2–3 drifting behind roofs; cameo ≤ once per ~30 s when a can is in view; hop hook from T15.

### T22 — Ornaments per theme + host fallbacks
**Files:** `Ornaments.svelte` (pool picker; pure decor; never refusal-correlated).
**Acceptance:** deterministic pick per house index; 2–4 per house; all titles/hooks from `motion.css` (`prefers-reduced-motion` respected).

### T23 — Ambience audio engine
**Files:** `src/lib/audio/ambience.ts` (beds per neighborhood + sprinkles + ducking −6 dB on shows/scares; synth now, asset swap later).
**Acceptance:** unit: theme switch ramps params; duck target on `phase=trick`/scare; sprinkle scheduler rate-limited ≥20 s; no-op without AudioContext.

### T24 — Scary moments
**Files:** `Scares.svelte` (port `pieces/scares.js`), trigger rules.
**Acceptance:** e2e: fires only while walking; ≥60 s gap honored (fake timers); kids' beat classes run; reduced-motion → no wash animation; input ignored during the beat.

## Phase 6 — Asset production (local studios)

### T25 — Music: title + 3 loops + stingers
**Files:** `tools/` generation notes, `static/music/*` (trimmed loops), `music.ts` rotation.
**Acceptance:** loops seamless (no click at wrap — manual listen + waveform check note); rotation switches per neighborhood; duck under shows.

### T26 — Ambience loops ×4
**Files:** `static/ambience/*`; wire into `ambience.ts` replacing synth.
**Acceptance:** each theme audible; bed −6 dB duck verified; no-regeneration without the studio documented.

### T27 — SFX bake + placeholders swap
**Files:** replace WebAudio synth with baked files where better; keep cue-name contract.
**Acceptance:** all cue names resolve; peaks ≤0.18; mute cuts live sound.

### T28 — Voice lines IT+EN (game_voice pipeline)
**Files:** `voice/lines.json` (full inventory), `tools/gen-voice.mjs`, `static/voice/<lang>/*.mp3` + manifests; `voice.ts` playback.
**Acceptance:** every line exists in both languages (CI check script); resumable generation; random line variance per archetype without repeats back-to-back.

### T29 — flux2 stills + facade spike
**Files:** `static/art/*` (WebP), title hero/OG, Bottega panel; facade cutout spike + fallback decision recorded in ART-MUSIC.
**Acceptance:** hero renders on title + OG meta; spike verdict documented.

## Phase 7 — Quality

### T30 — Playwright e2e suite
**Files:** `tests/e2e/*` (full treat flow; refuse→show→collect; shop; language; sound; reduced-motion; save→reload; **Review Focus #1 pin** — pre-gesture plays are silent-not-throwing).
**Acceptance:** suite green on CI-ish run; runs against built app.

### T31 — Perf + memory pass
**Files:** budget notes → `ARCHITECTURE.md`; **Review Focus #3 pin**: 30-minute simulated walk keeps nodes bounded.
**Acceptance:** node count and heap stable; animation budget documented.

### T32 — Safety/a11y pass
**Pool:** tap targets ≥44 pt, contrast checks on paper UI, reduced-motion completeness (**Review Focus #5 pin**: full flow playable with all motion off), no strobe anywhere.

### T33 — Offline PWA verification
**Acceptance:** cold offline reload → shell + playable; assets cached appropriately (music/voice runtime-cache).

## Phase 8 — Ship

### T34 — Deploy to Vercel + meta/OG
**Acceptance:** preview + production URLs; OG card correct; `dos-o-scherzetto`(name TBD) project configured; parent can open on the iPhone.

### T35 — iPhone device pass (human)
**Checklist:** Add to Home Screen, landscape lock behavior, safe areas, audio unlock, hold-walk feel, font sizes, 15-min session with a 7-year-old.

### T36 — Docs finalize
**Files:** `ARCHITECTURE.md`, `CONTENT-BIBLE.md`, `BALANCE.md`, `ART-MUSIC.md`, `CREDITS.md`; README status update.
**Acceptance:** every ADR referenced; open items from the spec closed or re-ticketed.

---

## Self-review (done at writing time)

- Spec coverage: §4 world → T08–T09/T19–T22 · §5 loop → T10–T15 · §7 theatre → T13–T15 · §8 economy → T06+T16 · §9 progression → T07/T18 · §10 scares → T24 · §11 audio → T23/T25–T28 · §12 art → T29 + sprite ports · §13 tech → T01–T04 · §14 quality → T30–T33. Gaps: none known; **CELEBRATION copy** lives in CONTENT-BIBLE (T36) by design.
- Naming consistency: `trickId` set (boo, ragnetto, serpente, cuscino, maschera, topolino, fantasmino, mano) used uniformly; cue names `fire:*`, `scare:*`, `theatre-*` uniform; keys `dos.run.v1`/`dos.settings.v1` uniform.
- Review Focus lines each pinned to an owning task (T31, T10, T31-perf→T30? see T30/T31, T03, T32) — as listed inline.
