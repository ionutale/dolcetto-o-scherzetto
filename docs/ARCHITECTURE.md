# Architecture

> **Status:** foundation + the T31 **Budgets** section landed. The remaining
> sections are stamped by **T36 — Docs finalize**; this file grows the way
> `README.md` points at it, one task at a time.

The game is **SvelteKit 5 + TypeScript + Vite**, shipped as a PWA on Vercel,
landscape-first for iPhone 16, voiced in IT + EN, and saved **on the device
only** (ADR-0006). The whole engine is one web page: a pure, DOM-free sim drives
a hand-built **DOM/SVG** scene — *no canvas* (ADR-0001) — while three WebAudio
engines and one media-element voice pool make the sound. All audio/raster assets
are baked at build time with the maintainer's local studios, never at runtime
(ADR-0002).

## Layers

| Layer | Files | Owns | Never |
|---|---|---|---|
| **Sim** (pure) | `src/lib/sim/` — `loop.ts` · `economy.ts` · `progression.ts` (+ tests) | the loop reducer/tick, the trick catalogue, the neighborhood curves | touching the DOM, timers or storage |
| **State** | `src/lib/state/game.svelte.ts` (+ test) | the one reactive `GameState` + the read seams (`worldX`, `phase`, `candies`, `bag`, `furthest`…) and the rAF loop | reimplementing sim rules |
| **Scene** | `src/lib/art/scene/`, `src/lib/art/sprites/` | sky, parallax, the **recycling window** of ≤ 20 homes, yards, decorations, the sprite motion CSS | deciding outcomes |
| **Play** | `src/lib/play/` | knock chain, bubbles, candy layer, fan, theatre, scares, cars, NPCs, kids | owning sim math |
| **Audio** | `src/lib/audio/` — `sfx.ts` · `ambience.svelte.ts` · `music.svelte.ts` · `voice.svelte.ts` · `volumes.svelte.ts` | the 26-cue synth pack, the per-theme beds, the decoded street loop, the voiced lines | throwing on a hostile `AudioContext` |
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

---

## Budgets

Measured **2026-10-17** on this machine (Chrome 155.0.8059.82, Node 26.1.0,
macOS) by **T31**. Every row names the command that backs it — a budget without
a backer is a guess, so none of these are.

| Budget | Ceiling | Measured | Backer |
|---|---|---|---|
| Unit suite green | 100 % · ≤ 5 s | **625 tests / 22 files · 1.47 s** (wall 2.6 s) | `pnpm test:unit` |
| Type/component check | clean | **clean** (0 errors) | `pnpm check` |
| Route chunk (`+page.svelte`) | ≤ 200 kB | **184.2 kB** (gzip **55.9 kB**) | `pnpm build` |
| Client JS total | ≤ 300 kB | **270.2 kB** (gzip ≈ **89 kB**) incl. SW | `pnpm build` |
| Client CSS total | ≤ 100 kB | **81.8 kB** (gzip **33.5 kB**) | `pnpm build` |
| All client assets (pre-gzip) | ≤ 600 kB | **552.6 kB** (JS 270.2 · CSS 81.8 · fonts 191.5 · SW 9.1) | `pnpm build` |
| **DOM nodes during play** | **≤ 2000** | **1567 – 1748** (boot 1679 · end 1666) | `tools/perf-probe.mjs` |
| **Audio live-node gap** | **≤ 60** (alarm) | boot **12** · max **35** · end **26** | `tools/perf-probe.mjs` |
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

1. **The live-node gap drifts gently upward.** It climbs from **12** at boot to
   **35** by home 51 (+≈ 0.45 nodes/home), driven by ambience-loop adoption
   churn under the rapid theme changes the fast-drive homes create; the settled
   theme march reclaims most of it (**35 → 26**). It never approaches the
   **≤ 60** alarm, but the trend is worth a look the next time this file is
   touched. No action taken here — `src/` is out of scope for T31.
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
