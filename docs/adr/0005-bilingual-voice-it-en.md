# ADR-0005: Bilingual voice — Italian default, English toggle

## Status
Accepted (2026-10-16)

## Context
The primary player is a 7-year-old Italian boy; the game may also be played in English. For a pre-reading age, voice *is* the accessibility layer.

## Decision
Ship **both Italian (default) and English**, switchable on the title screen, persisted in settings. Every spoken line is rendered in both languages through the local TTS pipeline; the single source of truth is `voice/lines.json`, and rendered clips live in `static/voice/<lang>/` with per-language manifests.

## Considered Options
- **Italian-only** — rejected: halves the asset pipeline but locks the game to one audience forever.
- **Runtime TTS on device** — rejected: unreliable, heavy, and the voice identity is a design asset.
- **Subtitles-only** — rejected: a 7-year-old plays by ear first; bubbles supplement, they don't carry.

## Consequences
- Voice asset weight roughly doubles (still small MP3s; voices are short lines).
- Every new line must be added to `lines.json` in both languages before it ships — a content-QA checklist item.
