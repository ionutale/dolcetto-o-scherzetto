# Dolcetto o Scherzetto

Cozy endless Halloween trick-or-treat game for a 7-year-old. Two brothers — Milo (6, wizard) and Tino (4, pumpkin) — walk one endless night street: knock, collect candy, and play a *scherzo* at homes that refuse. Landscape, touch-first (iPhone 16), Italian + English, all progress saved on the device.

**Status:** playable throwaway prototype (hand-validated in Chrome) → production build planned via the docs below.

## Quick start (prototype)

- **Hand-off file:** `prototypes/scene-prototype-single.html` — everything inlined, one double-clickable file (regenerate with `node prototypes/inline-pieces.mjs` after editing pieces).
- **Dev version:** `prototypes/scene-prototype.html` — same game, loads `pieces/*.js` via script tags.
- Piece previews: `prototypes/pieces/sprites-preview.html` · `houses-preview.html` · `theatre-preview.html` · `scares-preview.html` · `sfx-preview.html`.
- Hold ◀ / ▶ (or the screen halves, or arrow keys) to walk · **Bussa** at a door · tap the candies · ✨ **SCHERZO** at a refusing home · 👻 button (tools row) test-fires a scary moment.

## Canonical documents

| Doc | What it holds |
|---|---|
| `docs/superpowers/specs/2026-10-16-dolcetto-o-scherzetto-design.md` | **The spec** — every product decision |
| `docs/superpowers/plans/2026-10-16-dolcetto-o-scherzetto.md` | **TO-PROD** — phased build plan, task by task |
| `docs/ISSUES.md` | **TO-ISSUES** — agent-dispatchable work list |
| `docs/adr/` | **TO-ADR** — decision records (6 so far) |
| `GLOSSARY.md` | the game's vocabulary — use these words |
| `ART-STYLE.md` | art contract (SVG + flux2 split, palette, motion) |

## Conventions (mirrors the sibling project *Wurstel e Sogni*)

SvelteKit 5 + TypeScript + Vite · `adapter-vercel` → Vercel · PWA (manifest, service worker, icons) · Vitest + Playwright · pnpm · root-level canonical docs · `docs/superpowers/{specs,plans}` · `docs/adr`.

**Assets are generated with the maintainer's local studios** (never at runtime): music/SFX/ambience via `music-sfx-voice-studio` (Stable Audio 3), all voice lines IT+EN via its Qwen3-TTS `game_voice` pipeline, static illustrations via `flux2-klein-mlx-studio`. The prototype uses in-repo WebAudio synth + SVG so nothing blocks on generation.

**No backend.** Progress lives in `localStorage` only (one slot, autosave, hidden parent reset) — see ADR 0006.
