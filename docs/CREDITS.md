# CREDITS

Who made *Dolcetto o Scherzetto*, whose work it stands on, and what the names on the box
should be. Creator and maintainer of the game and of the local studios it uses: the project
owner. The rest is listed below with the same honesty as `docs/ART-MUSIC.md` — thanks where
thanks is due, and a ⚠ where a licence still needs a look before public distribution.

## The players

- **The owner's two boys** — the reason the game exists and its first audience. The design
  brief is written for a 7-year-old (spec §1); the in-game duo, **Milo** (6) and **Tino** (4),
  take their cue from the two brothers the game was made for (GLOSSARY "Milo"/"Tino").
- The owner held the taste vetoes: the frozen prototype ("sì, è questo"), the louder `BOO!`
  cue, the candy **pick-me nudge**, and the reopenable title screen all came from owner
  feedback.

## Music and sound

- **"A Winter's Night" — Etienne Roussel** — the owner-provided street loop, trimmed and
  loudness-normalised, shipped as `static/music/a-winters-night.v1.mp3` (spec §11). With
  thanks, and a ⚠ to verify the track's terms before the repo/space stays public
  ([`docs/ART-MUSIC.md`](ART-MUSIC.md) §9).
- **The witch laugh** — the owner-provided clip `static/sfx/scare-witch.v1.mp3` (spec §11 /
  T27); same ⚠ note.
- **The 26-cue SFX pack** and the ambience **synth beds** — original WebAudio authored for
  this project (`src/lib/audio/sfx.ts`, `src/lib/audio/ambience.svelte.ts`).

## Models and tools

- **FLUX.2-klein** — the image model behind the title hero, the OG card, the Bottega strip and
  the facade spike, run through the maintainer's local **`flux2-klein-mlx-studio`** (MLX),
  driven by `tools/gen-art.py` (`ART-STYLE.md` §11.1). ⚠ model-weights terms unrecorded.
- **Stable Audio 3** — the model behind the four neighborhood ambience loops, run through
  **`music-sfx-voice-studio`** (`/music`; ADR-0002). ⚠ model-weights terms unrecorded.
- **Qwen3-TTS** — the voice-design and render pipeline behind the 74 IT/EN voice clips,
  through its **`game_voice`** tooling (`voice/render_plan.py`, `voice/VOICES.md`). ⚠
  model-weights terms unrecorded.
- **Fredoka** — the game's typeface, self-hosted via `@fontsource/fredoka` (**OFL-1.1**;
  verified in `node_modules`).
- **SvelteKit · Svelte · Vite · Vitest · Prettier** (**MIT**) and **Playwright**
  (**Apache-2.0**) — the app and test stack (licences verified in `node_modules`).
- **WebAudio + the DOM** — the renderer and audio engine need no third-party runtime; the
  whole game is DOM/SVG (ADR-0001) and WebAudio — no canvas engine.

## Lineage

- **"Storybook plush"** — the art language inherited from *Wurstel e Sogni* (rounded shapes,
  soft shadows instead of outlines, subtle volume, Fredoka type), re-keyed here to a deep
  indigo Halloween night (`ART-STYLE.md` §2).
- **Family reference:** the owner's **Buddy's Money Day** softness (pastels, rounded, no
  outlines) (`ART-STYLE.md` §2).
- The project mirrors the sibling *Wurstel e Sogni*'s conventions — stack, docs layout, quality
  bar (spec "Sibling conventions").
