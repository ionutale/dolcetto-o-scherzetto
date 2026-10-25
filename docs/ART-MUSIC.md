# ART-MUSIC

The asset pipeline register: where every shipped picture, sound and voice comes from, how it
was made, and what its licence status is. All audio and raster assets are generated **at build
time** with the maintainer's local studios and committed to the repo — never at runtime
(ADR-0002). The art contract itself (palette, motion, the SVG-vs-raster split rule) lives in
`ART-STYLE.md`; this file is the provenance and licence ledger behind `static/`.

## 1. The split rule (which assets are SVG, which are raster)

User-locked and recorded in `ART-STYLE.md` §11: **if it moves, reacts, or is touched → SVG;
if it is static scenery → a flux2 candidate.** So the kids, neighbors, doors, windows, candy,
props, UI and anything animated are hand-built SVG; only the title hero / OG card, the Bottega
strip and the (unadopted) facade spike come from the raster generator.

## 2. SVG packs — lineage → `src/lib/art`

Every SVG pack is a 1:1 typed port of the frozen, hand-validated prototype
(`prototypes/pieces/*`, accepted 2026-10-17), not a redraw: same path data, fills and class
hooks. They are **original, first-party** work for this project.

| Shipped SVG | Ported from | Result |
|---|---|---|
| World sprite pack (17 sprites + motion CSS) | `prototypes/pieces/sprites.js` | `src/lib/art/sprites/index.ts` (`animCSS`, `injectAnimCSS`) |
| House pack (8 types × 3 palettes, door contract) | `prototypes/pieces/houses.js` | `src/lib/art/sprites/houses.ts` |
| Neighbor sprites (ghost / nonna / strega, + wolf / vlad / scarecrow) | `prototypes/scene-prototype.html` `SVG` map | `src/lib/art/sprites/neighbors.ts` |
| Candy pack (6 shapes + bucket icon) | `prototypes/scene-prototype.html` `candies` map | `src/lib/art/sprites/candy.ts` |
| Trick icons (8) + sky ghosts | prototype packs | `src/lib/art/sprites/trick-icons.ts`, `sky-ghosts.ts` |

Style authority: `ART-STYLE.md` §3 (palette) and §4 (rules — no outlines, rounded,
transform/opacity motion only, `prefers-reduced-motion` kill switch). Text is never baked into
raster/SVG art; it stays HTML/SVG in Fredoka.

## 3. flux2 stills — studio, tool, and the T29 verdicts

- **Studio:** the local `flux2-klein-mlx-studio` (an MLX pipeline; FLUX.2-klein, 4-step
  distilled design point at guidance 1.0, 1K–2K, shipped as WebP — `tools/gen-art.py` header,
  `ART-STYLE.md` §11).
- **Tool:** `tools/gen-art.py` writes the masters to `.scratch/art/` and the shipped WebP to
  `static/art/`; the style string is `ART-STYLE.md` §3/§4 expressed as a prompt.
- **Workflow caveat (recorded):** the studio's v1 is **text-to-image only**, so the
  reference-image / multi-turn-editing workflow `ART-STYLE.md` §11 describes was unavailable;
  prompts alone were used.

Status of each still (`ART-STYLE.md` §11.1, the T29 run of 2026-10-17):

| Asset | Size / bytes | Status |
|---|---|---|
| Title hero `static/art/hero.v1.webp` | 1152 px wide · 79 KB | **shipped** — hero-2 accepted; wired on the title |
| OG card `static/art/og.v1.webp` | 1200×630 crop · 81 KB | **shipped** — wired in `src/app.html` (`og:image`) and verified live at T34 |
| Bottega strip `static/art/bottega-strip.v1.webp` | 640×325 strip · 24 KB | **shipped, parked** — the validated shop card is height-bound in landscape, so the strip is reserved for the About/credits screen, not the shop card |
| Facade spike `static/art/spike/facade-{maisonette,tower}.v1.webp` | samples | **spike, not adopted** — cutouts are technically viable (chroma `#6b5785` keyed at RGB distance < 34), but the "no outlines" checklist fails on the text-only workflow and raster facades multiply assets against the parameterized SVG set; revisit when the studio's reference/editing phase lands |

Recorded deviation: the stills currently carry **soft outlines**; the in-world SVG rule (no
hard outlines) is unchanged. This is the "paused-strip banner": the Bottega strip exists but
is **not** mounted in the shop.

## 4. Ambience — 4 loops (Stable Audio 3)

Generated with **Stable Audio 3** through `music-sfx-voice-studio` (`/music`; ADR-0002);
wired into `src/lib/audio/ambience.svelte.ts`, which probes
`/ambience/<theme>.v1.mp3` and falls back to its synth bed if a loop is missing.

| File | Theme | Measured (this repo) |
|---|---|---|
| `static/ambience/leafy.v1.mp3` | Leafy Lane | 50.000 s · mono · 48 kHz · ~96 kbps |
| `static/ambience/foggy.v1.mp3` | Foggy Bridge | 50.000 s · mono · 48 kHz · ~96 kbps |
| `static/ambience/pumpkin.v1.mp3` | Pumpkin Patch | 50.000 s · mono · 48 kHz · ~96 kbps |
| `static/ambience/starry.v1.mp3` | Starry Alley | 50.000 s · mono · 48 kHz · ~96 kbps |

Loudness target for the beds: **−24 LUFS** (⚠ the task's asset spec; not independently
re-measured in this pass). Mix: the bed sits under music at `AMB_MAX 0.5`, ducked −6 dB during
shows and scares (`BALANCE.md` §7). The engine's synth placeholder remains the fallback for a
missing loop.

## 5. Music — the street loop

- **Track:** the owner-provided **"A Winter's Night" — Etienne Roussel** (spec §11).
- **Optimised:** head/tail silence trimmed (0.5 s head, 4.2 s tail), loudness-normalized to
  −16 LUFS, 112 kbps, versioned filename for SW cache-busting.
- **Shipped:** `static/music/a-winters-night.v1.mp3` — measured **95.94 s · stereo · 48 kHz ·
  ~113 kbps**.
- **Wiring:** `src/lib/audio/music.svelte.ts` fetches, `decodeAudioData`s once and loops it on
  a buffer source (gap-free), through the owner mix `MUSIC_MAX 0.143` (duck `0.042`).
- Title theme + extra loops + stingers could still be generated with Stable Audio 3 (spec
  §11); none shipped beyond this track.

## 6. SFX — the 26-cue synth pack + the witch clip

- **The pack:** the accepted WebAudio synth from `prototypes/pieces/sfx.js`, ported
  line-for-line to `src/lib/audio/sfx.ts`. **26 cues** in three groups — UI/foley (`knock`,
  `pop`, `coin`, `twinkle`, `refuse`, `seen`, `buy`, `giggle`, `passer`, `stepLeaf`), theatre
  (`theatre-setup`, `fire:boo`…`fire:mano`, `theatre-laugh`), scares
  (`scare:witch|wolf|vampire|skeleton|mummy|thunder`). Cue names are the production contract;
  peaks stay ≤ 0.18. Original, first-party.
- **The witch clip:** `static/sfx/scare-witch.v1.mp3` is the **owner-provided** laugh
  (measured **3.200 s · mono · 48 kHz**, ~118 kbps). `playCue('scare:witch')` plays the file
  and falls back to the synth cue if it ever errors (`SFX_WITCH_URL`, `witchFileBroken`).

## 7. Voices — Qwen3-TTS design + render

- **Pipeline:** the local Qwen3-TTS `game_voice` tooling; the runbook is `voice/VOICES.md`,
  the driver is `voice/render_plan.py`.
- **Copy source:** `src/lib/i18n/lines.ts`; inputs are *derived* (`node voice/lines.mjs
  extract`) and proven byte-equal (`node voice/lines.mjs check`) — the copy lock
  ([`CONTENT-BIBLE.md`](CONTENT-BIBLE.md) §1).
- **Designed voices:** **12 designed clones** (six speakers × IT/EN) + one preset rendered
  twice. Speakers: kids, ghost, nonna, strega, wolf, scarecrow are designed;
  **vlad is the preset `ryan`** (fallback `aiden`). Take-2 is picked deterministically; the
  owner auditions later (`voice/render_plan.py`; `voice/VOICES.md` §4–§5).
- **Output:** `static/voice/<lang>/<id>.mp3` — **37 ids × 2 languages = 74 clips** (mono,
  96 kbps, loudness-normalized, silence-trimmed; ~31 KB average, ≈ 2.2 MB total), plus a
  37-row `manifest.json` per language and per-run evidence in `voice/manifests/`.
- **The gate:** `pnpm check:voice` (`tools/check-voice.mjs`) asserts a non-empty clip and a
  matching manifest row per id, both languages, same id set.

## 8. File naming and versioning

| Kind | Convention | Example |
|---|---|---|
| Raster / audio build asset | `<name>.v<version>.<ext>` — the `.vN` is the cache-buster the service worker keys on (spec §11; `src/service-worker.ts`) | `hero.v1.webp`, `ambience/leafy.v1.mp3`, `music/a-winters-night.v1.mp3`, `sfx/scare-witch.v1.mp3` |
| Voice clip | `static/voice/<lang>/<id>.mp3` — **language-neutral ids**, no version; the language is the directory, the cache is re-versioned per deploy by the SW cache name | `static/voice/it/greet-strega.mp3` |
| Generated master | kept in `.scratch/art/` (not shipped) | `.scratch/art/*.png` |
| Proof / evidence | `voice/manifests/<lang>.<speaker>.json` (per-run), `static/voice/<lang>/manifest.json` (complete) | `voice/manifests/it.strega.json` |

Re-running a generator is safe by design: `gen_voice`/`generate_lines.py` skips any clip with
bytes on disk, and a re-run of a still may differ (**the rendered masters are the artifact —
re-view and re-accept if the output changes** — `tools/gen-art.py` header).

## 9. Licence register

Best-known source and status for every shipped asset class. **Where the terms are not recorded
in this repo, the row says so explicitly** — do not assume a permissive licence.

| Asset | Best-known source | Status |
|---|---|---|
| SVG packs (`src/lib/art/sprites/*`) | original, hand-built for this project (ported from the frozen prototype; `ART-STYLE.md` §2/§16) | ✅ first-party original — no third-party rights |
| flux2 stills (`static/art/*.webp`, `static/art/spike/*`) | generated with **FLUX.2-klein** via `flux2-klein-mlx-studio` (`tools/gen-art.py`) | ⚠ **verify before public distribution** — the FLUX.2-klein model-weights terms are not recorded here |
| Ambience loops (`static/ambience/*.v1.mp3`) | generated with **Stable Audio 3** via `music-sfx-voice-studio` (ADR-0002) | ⚠ **verify before public distribution** — the SA3 model-weights terms are not recorded here |
| Music (`static/music/a-winters-night.v1.mp3`) | owner-provided track **"A Winter's Night" — Etienne Roussel** (spec §11) | ⚠ **verify before public distribution** — owner-provided; terms unverified |
| Witch clip (`static/sfx/scare-witch.v1.mp3`) | **owner-provided** laugh (spec §11 / T27) | ⚠ **verify before public distribution** — the repo is public |
| SFX synth pack (26 cues, `src/lib/audio/sfx.ts`) | original WebAudio, authored/ported in-repo | ✅ first-party original |
| Voice clips (`static/voice/**`, 74) | synthetic, generated with **Qwen3-TTS** `game_voice` (`voice/render_plan.py`) | ⚠ **verify before public distribution** — the Qwen3-TTS model-weights terms are not recorded here; also confirm the designed-voice references may ship |
| Fredoka typeface (`@fontsource/fredoka`) | The Fredoka Project via Fontsource | ✅ **OFL-1.1** (verified: `node_modules/@fontsource/fredoka/package.json` + `LICENSE`) |
| SvelteKit · Svelte · Vite · Vitest · Prettier | the frameworks/tools | ✅ **MIT** (verified in each `node_modules/<pkg>/package.json` + `LICENSE`) |
| Playwright (`@playwright/test`) | Microsoft Playwright | ✅ **Apache-2.0** (verified: `node_modules/@playwright/test/package.json` + `LICENSE`) |

The ⚠ items are exactly the ones the owner pass flags for a decision — see
[`T35-CHECKLIST.md`](T35-CHECKLIST.md) §H ("keep public / make the repo private / swap the
assets").
