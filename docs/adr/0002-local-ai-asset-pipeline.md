# ADR-0002: Local-AI asset pipeline (own studios, never runtime)

## Status
Accepted (2026-10-16)

## Context
The game needs music loops, per-neighborhood ambience loops, ~25 SFX cues, and full voice lines in two languages. The maintainer runs local generation studios on this Mac.

## Decision
Every production asset is generated with the maintainer's own studios, at build time, and committed to the repo:
- **music / ambience / SFX** → `music-sfx-voice-studio` (`POST /music`, `/sfx/text`, `/sfx`; Stable Audio 3), loops trimmed to seamless
- **voice lines IT + EN** → its Qwen3-TTS `game_voice` pipeline (`voice/lines.json` → `static/voice/*.mp3` + `manifest.json`)
- **static illustrations** (title hero/OG, panels; facade spike) → `flux2-klein-mlx-studio`
- The prototype meanwhile uses in-repo WebAudio synth (`pieces/sfx.js` + host ambience) so development never blocks on the GPU.

## Considered Options
- **Stock libraries** (sibling project used Pixabay + Gemini images) — rejected: the local studios are exactly the tool the maintainer built them to be; zero recurring cost; full license control.
- **Runtime generation on device** — rejected: impossible on iOS Safari, and slow/expensive.

## Consequences
- The repo carries generation provenance (prompts, seeds-as-reference-sheets philosophy, license notes) in `ART-MUSIC.md` when written.
- Voice/style identity is regenerable but not byte-identical — reference sheets, not seeds (mirrors the sibling project's mechanism).
- Nothing about the player's session ever touches the network.
