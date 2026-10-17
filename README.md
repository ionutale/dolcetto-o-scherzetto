# Dolcetto o Scherzetto

A cozy, **endless Halloween trick-or-treat** night for a 7-year-old. Two brothers —
**Milo** (6, wizard) and **Tino** (4, pumpkin) — walk one endless street door to door:
knock, collect candy, and play a *scherzo* at the homes that refuse. Candy is the wallet;
the witch's **Bottega** sells new pranks. There is no losing, no timer, no threat — only a
night that keeps going (spec §1–§3). Italian (default) + English, touch-first, a **landscape
PWA** built for the iPhone 16 in landscape (852×393 pt; ADR-0004). Progress lives on the
device only, in `localStorage` — no backend (ADR-0006).

**Live:** https://dolcetto-o-scherzetto.vercel.app

## Tech stack

**SvelteKit 5 + TypeScript + Vite**, shipped to **Vercel** via `@sveltejs/adapter-vercel`;
a **PWA** (manifest `orientation: landscape`, service-worker offline shell, icons), the
**Fredoka** typeface self-hosted through `@fontsource/fredoka`, **pnpm**, and
**Vitest + Playwright** for tests (spec §13, `package.json`). The renderer is hand-built
**DOM/SVG** animated with transform/opacity only — **no canvas** (ADR-0001).

## Dev quickstart

```bash
pnpm i                 # install
pnpm dev               # dev server
pnpm test:unit         # Vitest unit suite (pure sim + models + components)
pnpm test:e2e          # Playwright e2e — builds, previews, drives the built app
pnpm check             # svelte-check (types + components)
pnpm lint              # prettier --check . && eslint .
pnpm build             # production build
pnpm check:voice       # voice render gate (37 clips × 2 languages on disk)
```

Playwright runs against the **built** app (852×393 viewport), so `pnpm test:e2e` needs
Chromium once: `pnpm exec playwright install chromium` (see [`tests/README.md`](tests/README.md)).

## Where the generated assets come from

All audio and raster art is baked **at build time with the maintainer's local studios**,
never at runtime (ADR-0002). Full provenance, recipes and licences: **[`docs/ART-MUSIC.md`](docs/ART-MUSIC.md)**.

- **SVG sprite + house + candy + trick packs** — hand-built and versioned in
  `src/lib/art/sprites/` and `src/lib/art/scene/` (typed ports of the validated prototype
  packs; style contract `ART-STYLE.md`).
- **flux2 stills** (title hero, OG card, Bottega strip, facade spike) — `tools/gen-art.py`
  through the local `flux2-klein-mlx-studio`; results in `static/art/` (`ART-STYLE.md` §11.1).
- **Ambience ×4** (leafy / foggy / pumpkin / starry) — Stable Audio 3 via
  `music-sfx-voice-studio` ⇒ `static/ambience/*.v1.mp3`.
- **Music ×1** (the street loop) — the owner track "A Winter's Night" ⇒
  `static/music/a-winters-night.v1.mp3`.
- **SFX** — the 26-cue WebAudio synth pack in `src/lib/audio/sfx.ts`, plus one
  owner-provided witch clip `static/sfx/scare-witch.v1.mp3`.
- **Voice** — 74 clips (37 ids × IT/EN) via the local Qwen3-TTS `game_voice` pipeline,
  driven by `voice/render_plan.py` into `static/voice/<lang>/` + manifests.

## Repo map

| Path | What lives there |
|---|---|
| `src/` | the game — `lib/sim` (pure loop), `lib/state` (runes store), `lib/art` (scene + sprites), `lib/play` (interaction widgets), `lib/audio` (four engines), `lib/persist` (localStorage), `lib/i18n` (copy), `routes/`, `service-worker.ts`. Map: `docs/ARCHITECTURE.md`. |
| `docs/` | `ARCHITECTURE.md` · `CONTENT-BIBLE.md` · `BALANCE.md` · `ART-MUSIC.md` · `CREDITS.md`, the spec + plan under `docs/superpowers/`, `docs/adr/`, `docs/ISSUES.md`, `docs/OFFLINE-NOTES.md`. |
| `voice/` | the TTS render plan (`VOICES.md`, `render_plan.py`), the derived line inventories, and the per-run manifests (`tools/check-voice.mjs` is the gate). |
| `tools/` | `gen-art.py` · `gen-icons.mjs` · `check-voice.mjs` · `perf-probe.mjs` (build-time + measurement scripts, not shipped). |
| `static/` | the shipped assets — `voice/` · `music/` · `ambience/` · `sfx/` · `art/` · `icons/` · `manifest.webmanifest`. |

## Canonical documents

| Doc | What it holds |
|---|---|
| [`docs/superpowers/specs/2026-10-16-dolcetto-o-scherzetto-design.md`](docs/superpowers/specs/2026-10-16-dolcetto-o-scherzetto-design.md) | **The spec** — every product decision |
| [`docs/superpowers/plans/2026-10-16-dolcetto-o-scherzetto.md`](docs/superpowers/plans/2026-10-16-dolcetto-o-scherzetto.md) | **TO-PROD** — the phased build plan (T01–T36) |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | module map, boot sequence, testing map, budgets, ADR pointers |
| [`docs/CONTENT-BIBLE.md`](docs/CONTENT-BIBLE.md) | every player-facing string (IT/EN) + the voice-clip id scheme |
| [`docs/BALANCE.md`](docs/BALANCE.md) | the tuning table (economy, progression, timings, audio levels) |
| [`docs/ART-MUSIC.md`](docs/ART-MUSIC.md) | the asset pipeline register + the licence register |
| [`docs/CREDITS.md`](docs/CREDITS.md) | creators, tech and lineage |
| [`GLOSSARY.md`](GLOSSARY.md) · [`ART-STYLE.md`](ART-STYLE.md) | the game's vocabulary · the art contract |
