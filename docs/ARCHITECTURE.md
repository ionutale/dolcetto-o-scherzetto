# Architecture

> **Status:** final (T36 — Docs finalize). The foundation, the T31 **Budgets**
> section, and the T36 module map / boot sequence / testing map / decision
> pointers below are all in place. `README.md` and the sibling docs point here.

The game is **SvelteKit 5 + TypeScript + Vite**, shipped as a PWA on Vercel,
landscape-first for iPhone 16, voiced in IT + EN, and saved **on the device
only** (ADR-0006). The whole engine is one web page: a pure, DOM-free sim drives
a hand-built **DOM/SVG** scene — *no canvas* (ADR-0001) — while three WebAudio
engines and one voice-clip layer on the synth's bus make the sound. All audio/raster assets
are baked at build time with the maintainer's local studios, never at runtime
(ADR-0002).

## Layers

| Layer | Files | Owns | Never |
|---|---|---|---|
| **Sim** (pure) | `src/lib/sim/` — `loop.ts` · `economy.ts` · `progression.ts` (+ tests) | the loop reducer/tick, the trick catalogue, the neighborhood curves | touching the DOM, timers or storage |
| **State** | `src/lib/state/game.svelte.ts` (+ test) | the one reactive `GameState` + the read seams (`worldX`, `phase`, `candies`, `bag`, `furthest`…) and the rAF loop | reimplementing sim rules |
| **Scene** | `src/lib/art/scene/`, `src/lib/art/sprites/` | sky, parallax, the **recycling window** of ≤ 20 homes, yards, decorations, the sprite motion CSS | deciding outcomes |
| **Play** | `src/lib/play/` | knock chain, bubbles, candy layer, fan, theatre, scares, cars, NPCs, kids | owning sim math |
| **Audio** | `src/lib/audio/` — `sfx.ts` · `ambience.svelte.ts` · `music.svelte.ts` · `voice.ts` · `volumes.svelte.ts` | the 26-cue synth pack, the per-theme beds, the decoded street loop, the voiced lines | throwing on a hostile `AudioContext` |
| **Persist** | `src/lib/persist/` | the defensive `dos.run.v1` / `dos.settings.v1` mirror | throwing (`read`/`write` degrade to no-save) |
| **i18n** | `src/lib/i18n/` | UI copy + the IT/EN voice-line inventory | — |
| **Routes** | `src/routes/` (`+page.svelte`, `ssr = false`) | composition only — mounts the scene, runs the loop, wires the single knock/trick edges | game logic |
| **Assets** | `static/` | `voice/<lang>/*` · `music/*` · `ambience/*` · `icons/*` · manifest | runtime generation |
| **Tools** | `tools/` | `gen-icons.mjs` · `check-voice.mjs` · **`perf-probe.mjs`** | shipping to the bundle |

## Invariants

- **DOM/SVG only** (ADR-0001): transform/opacity motion; the street keeps a
  **recycling window** of ~20 house slots.
- **`prefers-reduced-motion: reduce`** kills every ambient bob/pulse/flash;
  fades and crossings stay (spec §6/§13).
- **Sim constants are pinned**: `SPEED 190` px/s · `SPACING 620` · `NEAR 70` ·
  `TREAT_P 0.60` · `REGIFT_P 0.30` · audio peaks **≤ 0.18**.
- **No backend** (ADR-0006): `localStorage` only, versioned keys, defensive.
- **Quality bar**: `pnpm check` clean · Vitest unit suite · Playwright e2e ·
  console-clean · both languages complete.

## Module map

Expands the **Layers** table above with the audio / persist / service-worker detail; one
responsibility per folder, and the arrows only ever point one way (the sim knows nothing
above it).

| Module | Files | Owns | Never |
|---|---|---|---|
| **Sim** (pure) | `src/lib/sim/loop.ts` · `economy.ts` · `progression.ts` | the pure reducer/tick (`initial`/`reduce`/`tick`), the trick catalogue, the price/burst/roll helpers, the neighborhood curves | touching the DOM, timers or storage |
| **State** | `src/lib/state/game.svelte.ts` | the one reactive runes store, the read seams (`worldX`/`phase`/`candies`/`bag`/`furthest`…), the clamped rAF loop, and the `bootState()` that seeds the sim from the save | reimplementing sim rules |
| **Scene** | `src/lib/art/scene/`, `src/lib/art/sprites/` | sky, parallax, the **recycling window** of ≤ 20 homes, yards, decorations, the sprite-motion CSS | deciding outcomes |
| **Play** | `src/lib/play/` | the interaction widgets — knock chain, bubbles, candy layer, fan, theatre, scares, cars, NPCs — plus their pure `*-model.ts` maths | owning sim math |
| **Audio** | `src/lib/audio/` | **three independent engines**, each with its own lazy `AudioContext` and self-driven rAF frame: `sfx.ts` (26-cue WebAudio synth), `ambience.svelte.ts` (per-theme beds + sprinkles + duck), `music.svelte.ts` (the decoded street loop); `voice.ts` decodes clips once and plays them on the synth's bus; `volumes.svelte.ts` is the shared gain seam | throwing on a hostile `AudioContext` |
| **Persist** | `src/lib/persist/persist.ts` · `settings.ts` | defensive `localStorage`: the run slot `dos.run.v1` and the one settings envelope `dos.settings.v1` | throwing (`read`/`write` degrade to no-save/defaults) |
| **Diagnostics** | `src/lib/diagnostics/crashlog.ts` · `share-text.ts` | the black box: the crash/heartbeat log (`dos.log.live.v1` / `dos.log.prev.v1`), the crash verdict, the copy/share helpers — read by the title banner and viewer | throwing (every path degrades to memory-only) |
| **i18n** | `src/lib/i18n/lines.ts` | the UI copy + the IT/EN voice-line inventory (the copy lock) | — |
| **Service worker** | `src/service-worker.ts` | **precache** (hashed build + static assets), the versioned **shell** (network-first navigations, cached under `/`), and the runtime **voice cache** (cache-first `/voice/**`, never precached) | caching anything unversioned |
| **Routes** | `src/routes/` (`+page.svelte`, `ssr = false`) | composition only — mounts the scene, runs the loop, wires the single knock/trick edge | game logic |
| **Assets / Tools** | `static/`, `tools/` | the shipped files; `gen-icons.mjs` · `check-voice.mjs` · `perf-probe.mjs` · `gen-art.py` | shipping to the bundle |

Three WebAudio engines (`sfx` / `ambience` / `music`), each with its own context and frame,
plus the **voice clips**: `voice.ts` fetches each line once, decodes it once (a small
LRU) and plays a `BufferSource` **on the synth's bus** (`sfxBus()` — no media elements, no
second context; `volumes.svelte.ts` and the `sound` master toggle apply to it exactly as they
do to cues). The engine split exists for isolation, not for voices.

### Save schema

Four versioned keys, all read/written defensively (`read`/`write` never throw; a corrupt,
truncated, hand-edited or future-version payload is refused and the game falls back to
defaults / a fresh run):

| Key | Shape | Source |
|---|---|---|
| `dos.run.v1` | `{ version: 1, bag, record, tricks: string[], furthestK }` | `src/lib/persist/persist.ts` `RunState` + `isRunState` |
| `dos.settings.v1` | `{ version: 1, lang: 'it'\|'en', sound, musicVolume: 0..1, sfxVolume: 0..1 }` | `src/lib/persist/settings.ts` `Settings` + `isSettings` |
| `dos.log.live.v1` | `[{ t, k, d? }]` — the live session's flight log (ring, ≤ 320 entries) | `src/lib/diagnostics/crashlog.ts` |
| `dos.log.prev.v1` | the same shape — the previous session, archived only when it ended abruptly | `src/lib/diagnostics/crashlog.ts` |

The run is autosaved after every change (a `$effect` in `+page.svelte`) and seeds the boot;
the settings envelope is a device preference (written by the title's sliders/toggle). A future
setting joins the envelope as an optional field — except the volume pair, which was added as
required. The hidden parent reset clears **all of them** (`Settings.svelte`).

### Audio graph

Four graphs, one lazy `AudioContext` each (created on the first gesture), each self-driven by
its own rAF frame; there is no shared node graph.

- **sfx** — one master `GainNode` (the mute gate) → destination; each cue builds oscillators /
  noise / filters under a fresh set, and `sweepCue` disconnects the finished cue's whole node
  set a beat after its last stop (the iOS leak guard). Peaks ≤ `SFX_PEAK 0.18`. `scare:witch`
  prefers the owner `<audio>` file.
- **ambience** — `master → destination`; a looped noise source → lowpass → bed gain → master,
  with two slow LFOs drifting the cutoff and gain; sprinkles and an adopted studio loop land
  on the same master (the adopted loop decodes **at 24 kHz** — `decode.ts`). Duck −6 dB on `phase === 'trick'` and on a manual `duckAmbience`.
- **music** — one master `GainNode`; one decoded buffer source looped into it (`loop = true`),
  gap-free at the wrap; the loop decodes **at 32 kHz** (the owner's memory/ear call,
  2026-10-18 — see `decode.ts`), trimming ~10–12 MB off the resident buffer.
- **voice** — fetch → decode once per clip (LRU of 12, **at 24 kHz** — `decode.ts`), played as a
  `BufferSource` on the **SFX bus** (`sfxBus()`), disconnected on `onended`; re-saying a line
  stops the old source (rewind, not stack); volume/mute ride the shared master. The
  media-element pool this replaced (2026-10-18) was the killer the owner's device trail
  finally cornered: ~12-18 distinct `<audio>` loads — one native WebKit media session each,
  outside every page-visible counter — and the process died at ~6-7 homes, every run.

`volumes.svelte.ts` is the only cross-engine state: the two 0..1 gains the audio frames read.

## Boot sequence

Settings first, then the save, then the title, then one gesture, then the engines:

1. **Settings** — `settings.ts` reads the device envelope `dos.settings.v1`
   (`{ lang, sound, musicVolume, sfxVolume }`); `volumes.svelte.ts` seeds its two gains from
   it at import. Defaults are Italian, sound on, both sliders full.
2. **Store seed from the save** — `game.svelte.ts` reads `dos.run.v1` once (`persist.read()`)
   and builds the first `GameState`: `bag`, `record` (lifted over the save's bag), the owned
   `tricks` (catalogue ids only, with the free `boo` guaranteed), and a `worldX` at the
   furthest doorstep the save's `furthestK` points at. Candies, homes, phase, direction and
   the open door are transient and start fresh (`+page.svelte` boot note).
3. **Title** — the scene mounts and the sim loop starts (`start()` in `+page.svelte`
   `onMount`); `TitleScreen.svelte` sits over it with `Gioca` / `Impostazioni`.
4. **Gesture unlock** — the first `pointerdown` (the `Gioca` tap included) runs
   `unlockAudio()`: `startAmbience()`, `startMusic()`, `initSfx()`. The same gesture attempts
   `screen.orientation.lock('landscape')` (iOS refuses; the rotate overlay covers it).
5. **Engines** — each audio engine lazily creates and resumes its own `AudioContext` and
   drives its own frame; voice clips decode once and play on the synth's bus (no media
   elements). An autosave `$effect` writes `{ bag, record, tricks, furthestK }` to
   `dos.run.v1` on any change.
6. **Service worker** — `+layout.svelte` registers `/service-worker.js` client-only, guarded;
   the offline shell and the versioned caches come from `src/service-worker.ts`.
7. **Black box** — `+layout.svelte` also installs the crashlog (owner request): it reads the
   previous session's log, decides *crash* (abrupt tail + a recent last heartbeat), shows the
   title banner when true, and starts the 4 s heartbeat that records the leak-hunt numbers
   (DOM nodes, WebAudio created/disconnected, ambience loops, fps, phase/bag). See
   `src/lib/diagnostics/crashlog.ts`.

## Testing map

| Layer | Command | Backer / shape |
|---|---|---|
| **Unit** | `pnpm test:unit` | Vitest — **651 tests / 23 files** (0.7 s), covering the pure sim, the play/scene models, the audio modules, the black box and the store. Count backed by the Budgets table below. |
| **e2e** | `pnpm test:e2e` | Playwright — **13 tests in 7 specs** (`tests/e2e/*.spec.ts`), run against the **built** app at 852×393: audio unlock, the full loop + reduced motion, Bottega, settings/language, the reopenable menu, save→reload, and the black box (crash banner + viewer, error capture, unassisted heartbeat flush, clean close, reachability). See `tests/README.md`. |
| **Perf / memory** | `node tools/perf-probe.mjs --launch` | the CDP harness behind the Budgets table: audio-node gap, loop replacement, DOM count, heap, page errors. Re-measure recipe in *Budgets → Re-measuring*. |
| **Voice gate** | `pnpm check:voice` | `tools/check-voice.mjs` — a non-empty clip + a manifest row per id, both languages. |

## Decisions (ADRs)

`docs/adr/` holds six accepted decision records; each is quoted here in one line (the files
carry the full context/options/consequences).

- **[ADR-0001](adr/0001-dom-svg-renderer-no-canvas.md) — DOM/SVG renderer, no canvas layer.** Everything is DOM + inline SVG animated
  by CSS (transform/opacity), with a recycling window of ~20 houses and pooled sprites.
- **[ADR-0002](adr/0002-local-ai-asset-pipeline.md) — Local-AI asset pipeline, build-time only.** Music / ambience / SFX / voice /
  stills are generated with the maintainer's own studios and committed; nothing renders at
  runtime.
- **[ADR-0003](adr/0003-random-candy-values-one-shot-homes.md) — Random candy values, one-shot homes, capped re-gift.** Values are a uniform
  1–10 rolled at drop (types are cosmetic); a home is one-shot and re-gifts at most once ever.
- **[ADR-0004](adr/0004-landscape-iphone16-fluid-stage.md) — Landscape-first, iPhone 16 reference stage.** The design reference is
  852×393 pt, height-scaled with fluid width; portrait shows a rotate overlay.
- **[ADR-0005](adr/0005-bilingual-voice-it-en.md) — Bilingual voice, Italian default + English toggle.** `voice/lines.ts` is the
  single copy source; both languages are rendered and shipped before a line ships.
- **[ADR-0006](adr/0006-local-only-save-no-backend.md) — Local-only save, no backend.** One `localStorage` slot, autosaved, defensive,
  hidden parent reset; no accounts, sync or servers.

---

## Budgets

Measured **2026-10-17** on this machine (Chrome 155.0.8059.82, Node 26.1.0,
macOS) by **T31**. Every row names the command that backs it — a budget without
a backer is a guess, so none of these are.

| Budget | Ceiling | Measured | Backer |
|---|---|---|---|
| Unit suite green | 100 % · ≤ 5 s | **651 tests / 23 files · 0.73 s** (wall ~2 s) | `pnpm test:unit` |
| Type/component check | clean | **clean** (0 errors) | `pnpm check` |
| Route chunk (`+page.svelte`) | ≤ 200 kB | **184.2 kB** (gzip **55.9 kB**) | `pnpm build` |
| Client JS total | ≤ 300 kB | **270.2 kB** (gzip ≈ **89 kB**) incl. SW | `pnpm build` |
| Client CSS total | ≤ 100 kB | **81.8 kB** (gzip **33.5 kB**) | `pnpm build` |
| All client assets (pre-gzip) | ≤ 600 kB | **552.6 kB** (JS 270.2 · CSS 81.8 · fonts 191.5 · SW 9.1) | `pnpm build` |
| **DOM nodes during play** | **≤ 2000** | **1567 – 1748** (boot 1679 · end 1666) | `tools/perf-probe.mjs` |
| **Audio live-node gap** | **≤ 60** (alarm) | boot **12** · steady **≈ 11** after the meter fix — the old "12→46 drift" was non-node `createBuffer` counts (2026-10-18) | `tools/perf-probe.mjs` |
| **Page memory (Mac Safari)** | iOS budget unknown — watch | idle **~225 MB** · play peak **~355–400 MB** (owner reading, 2026-10-18) — the suspected iOS kill axis; front collects within ~10–15 s of idling | Activity Monitor (owner) |
| Ambience loop replacement | one live loop | **17 started / 15 stopped** → 1 ambience + 1 music live | `tools/perf-probe.mjs` |
| Heap after a 30-min session | ≤ 50 MB · no monotonic rise | **14.5 → 21.2 MB** (peak 40.0) | `tools/perf-probe.mjs` |
| Sim session (long run) | ≥ 30 sim-min · 0 page errors | **34.4 sim-min · 0 errors** (52 homes, 258.9 s wall) | `tools/perf-probe.mjs` |

### The long-session run (the T31 acceptance)

`node tools/perf-probe.mjs --launch` drives the dev page, pastes the audio-node
meter in before the first gesture, and walks **52 homes** (≥ 40): odd homes run
the real wall-clock knock flow (refuse → `boo` show → burst → collect), even
homes fast-drive 1 320 sim steps while walking, every third home fires a `witch`
scare, and a closing **theme march** settles each neighborhood so its ambience
loop is adopted and the previous one replaced. The headline rows:

| sample | created | disconnected | gap | loops (start/stop) | DOM | heap MB |
|---|---|---|---|---|---|---|
| boot | 13 | 1 | 12 | 2 / 0 | 1679 | 14.5 |
| home 1 (refuse/real) | 130 | 118 | 12 | 3 / 1 | 1661 | 32.7 |
| home 25 (refuse/real) | 1547 | 1524 | 23 | 5 / 3 | 1622 | 22.4 |
| home 51 (refuse/real) | 3088 | 3053 | 35 | 8 / 6 | 1662 | 14.4 |
| soak | 3088 | 3053 | 35 | 8 / 6 | 1650 | 39.8 |
| **march** | **3101** | **3075** | **26** | **17 / 15** | **1666** | **21.2** |

- **The iOS leak guard holds.** The sweep keeps the live-node gap small
  (`created − disconnected`) while 3 101 nodes are created and 3 075 released:
  the gap peaks at **35**, well inside the **≤ 60** alarm, and the page logs
  **zero** errors for the whole 34.4 sim-min session. This is the measurement
  that the T27 `sweepCue` + T23 sprinkle tails + T26 loop replacement actually
  work under a long session.
- **Loops are replaced, not stacked.** 17 loop sources started and 15 stopped →
  exactly one ambience loop alive at a time (plus the one music loop). The
  `started n ≈ stopped n + 1` shape is the proof the theme crossing retires the
  old bed.
- **DOM and heap stay bounded.** The recycling window holds the tree in a
  **1567 – 1748** band over 52 homes and ~64 homes of extra walking (the ~20-slot
  contract, spec §4.2); the heap fluctuates between ~14 and ~40 MB with no
  monotonic rise — the GC reclaims what the sim drops.

### Findings (reported, not patched)

1. **The live-node gap "drift" was a metering artifact — resolved (2026-10-18).**
   The meter counted `createBuffer` — not an AudioNode, no `disconnect` — among
   "created", so transient cue noise buffers read as a slow permanent leak
   (+34 over the 60-home run, versus 35 buffers created in the same run). With
   the meter corrected, the true node gap sits steady at the intentional
   keepers (≈ 11–12: masters, LFOs, loops), and every one of the 26 cues is
   pinned by a unit test to disconnect *all* of its nodes. The probe now prints
   `gap by kind`, so a real leak can never hide between kinds again.
2. **No product-level jank, no console errors, no growth breach.** The full
   sample table (54 rows) is reproducible with the command above; the probe's
   `--out` flag writes the raw JSON.

### Re-measuring

```
pnpm dev --port 5211                 # one terminal
node tools/perf-probe.mjs --launch --url http://localhost:5211 \
     --homes 52 --fast-steps 1320 --soak-steps 1800 \
     --theme-steps 16 --theme-step-ms 800 --out perf.json
```

The probe is **plain JS + CDP** (Node's global `fetch`/`WebSocket`) — no repo
dependency. It clears `localStorage` on each fresh document so the monotonic
`furthestK` cannot pin the theme, installs the meter before the first gesture,
and prints the sample table + the summary lines above. Re-baseline the numbers
here whenever a budget row changes.
