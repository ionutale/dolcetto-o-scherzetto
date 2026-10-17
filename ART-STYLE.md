# ART-STYLE.md — *Dolcetto o Scherzetto*

> **Status:** locked for prototype → production.
> This is the style contract for everything drawn in the game: hand-built SVG **and** flux2-generated stills both answer to this document.
> Sibling docs (as they're written): `GLOSSARY.md`, `CONTENT-BIBLE.md`, `BALANCE.md`, `ARCHITECTURE.md`, `ART-MUSIC.md` (asset pipeline), spec + plan under `docs/superpowers/`.

## 1. The world in one sentence

A **plush storybook night**: the soft rounded warmth of Wurstel e Sogni re-keyed to a deep indigo Halloween — cream ink, amber lamps, pastel candy — friendly-spooky, never harsh.

## 2. Lineage & references

- Inherits the **"storybook plush"** language from *Wurstel e Sogni*: rounded shapes, soft shadows instead of outlines, subtle volume, Fredoka type.
- Night adaptation here: same plushness, night palette (§3), warm light sources (lamps, windows, moon) as the only "high" values.
- Family reference: the user's *Buddy's Money Day* softness (pastels, rounded, no outlines).

## 3. Palette (live tokens)

| Role | Hex | Use |
|---|---|---|
| Notte 0–4 | `#191231` `#241d45` `#3a2c5f` `#59406b` `#7a5166` | sky gradient, deep to warm horizon |
| Luna / bagliore | `#fff6dd` / `#ffeccf` / `#ffd9a0` | moon, window glow, lamp light |
| Inchiostro notte | `#3a2f4e` | faces, eyes, dark shapes (never pure black) |
| Inchiostro carta | `#4a3728` | text on paper UI |
| Carta | `#fff6e5` / `#fffdf8` | bubbles, panels, cards |
| Ambra / deep | `#ffd166` / `#e8a93a` | CTA, scherzo, coins, lamplight |
| Zucca / deep | `#ff9e57` / `#e8874a` | pumpkins, Tino, warm accents |
| Stelo | `#7fb069` | pumpkin stems, leaves |
| Strada | `#3a2e4c` | asphalt |
| Marciapiede | `#57446c` | sidewalk |
| Prato notte | `#443a63` | yards/grass |
| Recinzione | `#6b5785` | fences, gates, railings |
| Pelle cast | `#ffd9b8` / `#cfe8d2` / `#efe6f7` | kids / witch / vampire pale |
| Capelli biondi | `#f2d0a0` | Milo & Tino |
| Milo (robe/cape/hat) | `#6672df` / `#4a54b0` / `#7c5cff` + `#5d43d6` band | wizard costume |
| Tino (zucca/costume) | `#ff9e57` / `#e8874a` | pumpkin costume |
| Fantasmino | `#f6f0ff` / `#e4d9f5` | sheet ghost |
| Strega | `#43326b` hat · `#7a5cff` hair · `#cfe8d2` skin | Bottega keeper |
| Conte Vlad | `#6d3a5e` cape · `#efe6f7` skin · `#2e2751` hair | polite vampire |
| Lupo Gentile | `#9a8fc0` fur · `#cbbfdd` belly | gentle werewolf |
| Caramelle | `#ff9ec7` `#ff7a59` `#c98a4b` `#ffd166` `#ffb347` `#7fd7ff` | six candy pastels |

## 4. Rules that never bend

1. **No hard outlines.** Depth = darker-shade shapes + ellipse contact shadows `rgba(10,6,30,.30–.35)`.
2. **Rounded everything** (radii 6–24 inside sprites; 999 for UI pills).
3. **Transform/opacity motion only** — never animate layout.
4. **`prefers-reduced-motion`**: kill bobbing, trembling and screen flashes; fades + crossings stay.
5. **Text is HTML/SVG** (Fredoka) — never baked into raster art.
6. **Readable at 56 px**: every character silhouette must survive being tiny.
7. **Nothing is aimed at the player.** The spooky ceiling is "rare cameos that always end funny"; no threat, no chase, no jumpscare framing, no volume spikes.

## 5. The cast (canon)

| Character | Look | Role |
|---|---|---|
| **Milo** (6) | **long indigo wizard robe with bell sleeves, amber star motifs + belt; big floppy black pointed hat** with purple band + star; wooden wand | the braver brother; leads; hugs Tino during scares |
| **Tino** (4) | round pumpkin costume, stem cap, jack-o'-lantern bucket | the little one; timid; hides face in Milo's robe |
| Fantasmino | sheet ghost, wavy hem, blush, big friendly eyes | neighbor archetype |
| Nonna Rosa | headscarf, round glasses, shawl | neighbor archetype |
| Conte Vlad | neat plum cape, pale, polite | neighbor archetype + mid-distance cameo |
| Lupo Gentile | grey-lavender fur, soft belly | neighbor archetype + mid-distance cameo |
| Spaventapasseri | straw hat, patch grin | neighbor archetype (yard dweller) |
| Strega | lavender hair, sage skin, star earring, dark hat | neighbor archetype + **Bottega keeper** |
| NPC kids ×6 | ghost sheet kid, pumpkin kid, witchling, skeleton onesie, bat-cape kid, cat-ears kid | ambient street life (wave, distant shouts) |

Relative sizes (852×393 scene): Milo ≈96 px tall with hat, Tino ≈78, door neighbors ≈88, Strega at the Bottega ≈92. NPC kids 66–74.

## 6. Candy

- **Six silhouette archetypes**: lollipop, gummy, chocolate bar, wrapped toffee, candy corn, star. 30–34 px.
- Shape and colour are **visual variety only** — value (1–10) is rolled per drop, revealed as `+N` on collect.
- Motion: candies **float down lightly (~2 s) with an up-down bob**, staggered in a cascade; soft settle, gentle idle bob in the pile, twinkle on landing. Every candy **glows** — a soft halo in its own pastel colour with a gentle pulse (the landed pile pulses a touch stronger, inviting the tap); static glow under `prefers-reduced-motion`.

## 7. The world

- **Houses**: 8 silhouette-distinct types (cottage, townhouse, tall-narrow, witch hut, manor, round tower, victorian, farmhouse) × 3 palette families (mauve, teal-slate, brick-sage), set back from the street. Door + windows are separate interactive layers (door swings, windows dim when a home is done).
- **Layout bands** (front to back): road → sidewalk → yards → houses.
- **Yards**: paths, gates, fences (picket, low-rail), mailboxes, bushes, garden gnomes.
- **Ornaments pool** (2–4 per house, playback-spooky, pure decor — **never hints refusal odds**): cobwebs, fluttering bats, candle lanterns (flicker), tiny tombstones with funny epitaphs (IT/EN), scarecrows, pumpkin clusters.
- **Street**: lamp posts with warm glow pools, leaf drifts, fireflies, fog wisps, trash cans.
- **Cars**: parked cars in muted pastels at curb/driveways; rare slow passer on the far lane, headlights sweeping — ambience only, never a hazard.
- **Sky**: moon with craters, twinkling stars, 2–3 drifting ghosts (peek above rooflines), occasional shy ghost peeking from a trash can.

## 8. Effects & motion durations (canon)

| Effect | Spec |
|---|---|
| Door swing | 0.55 s, perspective rotateY |
| Knock | 3 thuds, house shake 0.5 s; the **Bussa cloud beckons** — 1.25 s invite pulse + glow ring + tapping hand (static under reduced motion) |
| Candy float | 2.0 s per candy, stagger 0.12 s, bob amplitude ~10 px decaying |
| Candy pile idle | ±2.5 px, ~1.8 s alternate |
| Trick show | ~2.4 s staged (spotlight dim `rgba(12,7,30,.45)` + warm cone, props ~1.5× world scale) |
| Scary moment | dim/wash ≤1 s; crossing 1.5–1.8 s; kids' hug-tremble-giggle beat 2.5 s |
| Bubbles in/out | 0.22 s snappy |
| Player walk | 190 px/s; NPC kids 120–160 px/s |
| Fireflies / fog / bats | ambient loops 6–26 s, subtle |

## 9. The trick theatre (8 shows)

Every trick is a staged performance at the door: **setup → gag → reaction**, watch-and-laugh (no input during the show), always succeeds, always ends with the candy burst popping out of the neighbor. One distinct sound per trick. Spotlight + oversized props are the standard framing.

BOO! (ghost face over the doorstep) · Ragnetto (spider lowers onto the doorknob, dances) · Serpente a molla (can slides in, spring snake boings) · Cuscino rumoroso (under the mat, *prrrt*) · Maschera buffa (mask thrusts into the neighbor's face) · Topolino di gomma (wind-up mouse zips across) · Fantasmino burlone (puppet rises from the bucket, bows) · Mano pelosa (furry hand waves from the door frame).

## 10. Scary moments (the shown ceiling)

Rare (~60–120 s min gap), **only while freely walking**, never during door flows, shows or collecting. Brief dim + soft purple/green wash, then one of: **witch on a broom** crossing the sky, **werewolf** dashing across the yard band, **vampire** gliding at mid distance. Moderate cartoon sound per character. The kids stop, turn to each other, Tino buries his face in Milo's robe, both tremble, peek, then giggle it off and take hands (~2.5 s). Reduced motion → dim + crossing only, no flash.

## 11. Raster (flux2) vs SVG — the split rule

> **The rule (user-locked):** if it **moves, reacts, or is touched** → **SVG**. If it is **static scenery** → **flux2** candidate.

- **SVG (always):** kids, all neighbors, doors, windows & light states, tricks & props, candy, UI, icons, fences, paths, anything with an animation.
- **flux2 (static):** title hero + OG image, Bottega panel art, celebration panels; *spike:* house facades & yard backdrops as painted cutouts (chroma-keyed at build; manual edge cleanup expected).
- **Fallback:** if facade cutouts disappoint at 56 px readability, those assets return to SVG. The SVG versions above are the canonical geometry either way.
- **flux2 workflow** (mirrors Wurstel's proven mechanism): **reference images, never seeds** — pin style with a style-reference sheet, pin each subject with a character/asset sheet, 4–5 reference slots max per call, iterate by multi-turn editing, never claim hand-drawn. Generated at 1K–2K, shipped as WebP (hero ~1200 px wide, panels ~800, facades ~640×480+).
- **Prompt skeleton:** `storybook plush night illustration, deep indigo Halloween palette, rounded shapes, soft shadows, no outlines, warm amber lamps, gentle gradients, cozy not creepy` + subject + "no text".

### 11.1 The T29 run — results & verdicts (2026-10-17)

Generated with `tools/gen-art.py` through `flux2-klein-mlx-studio` (4-step distilled
design point, 1K–2K, keyed/shipped as WebP per §11 — with one adaptation recorded:
**the studio's v1 is text-to-image only**, so the reference-image workflow (style
sheets, multi-turn editing) was not available; prompts alone were used).

- **Title hero (shipped):** `static/art/hero.v1.webp` (1152 px wide, 79 KB) — the two
  brothers hand-in-hand down the lamp-lit street. Two candidates rendered; hero-2
  accepted. The hero/OG register is *illustrated storybook* — soft ink outlines present.
- **OG card (shipped):** `static/art/og.v1.webp` (1200×630 crop, 81 KB) — wired in
  `src/app.html` (`og:image` absolute URL; verified live at T34).
- **Bottega panel (shipped):** `static/art/bottega-strip.v1.webp` (640×325 strip of the
  witch-at-her-stall render, 24 KB) for the shop card header.
- **Facade spike — verdict:** cutouts are technically viable (chroma `#6b5785` keyed at
  RGB distance < 34: maisonette 65% / tower 84% transparent, zero-alpha corners;
  samples in `static/art/spike/`). Both read on-model (green-trim gable ≈ the
  maisonette; conical tower ≈ the round-tower home). **NOT adopted in v1**: the §13
  checklist's "no outlines" fails on the current text-only workflow, and raster facades
  multiply assets against the parameterized SVG set. Revisit when the studio's
  reference/editing phase lands — then re-judge against §13 at 56 px.
- **Recorded deviation:** stills currently carry soft outlines; the in-world rule (SVG,
  no hard outlines) is unchanged. If the stills should match the flat-shape style
  exactly, re-render with the studio's future reference workflow.

## 12. Iconography

- Jack-o'-lantern bucket = **bag/wallet**.
- Sparkle/star = **scherzo** action.
- Moon + star motifs for menus; the Bottega sign is a hanging wooden board with a candle.

## 13. QA checklist for any new asset

- [ ] Rounded, no outlines, soft contact shadow
- [ ] Uses palette tokens (§3) — no off-palette colours
- [ ] Reads at 56 px (squint test)
- [ ] Motion is transform/opacity only; survives `prefers-reduced-motion`
- [ ] Text stays in HTML/SVG, never in raster
- [ ] Nothing aimed at the player; spooky stays in §10's ceiling
- [ ] Sound, if any, is matched to the moment and toggle-respecting
