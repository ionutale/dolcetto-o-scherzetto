# Dolcetto o Scherzetto — Design Spec

> **Status:** owner-approved, locked 2026-10-16 (produced in a structured grilling session; every decision below was explicitly chosen by the design owner).
> **Prototype:** `prototypes/scene-prototype.html` + `prototypes/pieces/*` (throwaway, hand-validated in Chrome).
> **Sibling conventions:** mirrors *Wurstel e Sogni* (`restaurant-manager-game`) — stack, docs layout, quality bar.

## 1. Vision & audience

A **cozy, endless Halloween night** for a 7-year-old. Two brothers — **Milo** (6, wizard) and **Tino** (4, pumpkin) — walk one endless street going door to door. Homes give candy; homes that refuse unlock the **Scherzo**, a harmless prank performed as a tiny stage show that makes candy burst out of the startled neighbor. Candy is money; the witch's **Bottega** sells new pranks. There is no losing, no timer, no threat — only a night that keeps going.

Primary device: **iPhone 16, landscape** (852×393 pt reference). Languages: **Italian (default) + English**, toggle on the title screen.

## 2. Experience pillars

1. **Cozy first** — soft light, warm lamps, small numbers of things, never crowded, never loud.
2. **A little spooky, always funny** — the spookiest moment always resolves into a giggle (see §10).
3. **A living street** — neighborhood kids, parked cars, drifting ghosts, decorations; the world moves even when you don't.
4. **Every prank is a show** — picking a trick plays a staged ~2.4 s performance with spotlight and oversize props.
5. **Numbers for a 7-year-old** — candy values are small, round, and spoken in `+N`; the bag is countable; nothing hidden.

## 3. Non-goals

- No backend, accounts, sync, leaderboards, ads, or IAP (ADR-0006).
- No portrait gameplay; portrait shows a friendly rotate screen (ADR-0004).
- No fail states, lives, timers, or punitive mechanics.
- No real scares: nothing chases, grabs, or targets the player; no loud stings (ADR + §10).
- No competitive NPC kids — ambience only; they never take candy.
- No requirement to read: every line is voiced; bubbles supplement.

## 4. The world & cast

### 4.1 Street & layout
- **Endless one-axis street**, walkable both directions, rendered with a recycling window (~20 homes; ADR-0001).
- **Bands, front to back: road → sidewalk → front yards → set-back houses.** Kids walk on the sidewalk; knocking happens from the sidewalk; candy lands on the sidewalk.
- **Houses**: 8 silhouette-distinct types (cottage, townhouse, tall-narrow, witch hut, manor, round tower, victorian, farmhouse — `pieces/houses.js`) × 3 palette families (mauve, teal-slate, brick-sage), mixed so adjacent homes never look alike; door + windows are separate layers (door swings, windows dim when a home is done).
- **Yards**: paths, gates, fences (picket/low-rail/none), mailboxes, trash cans, garden gnomes, leaf drifts.

### 4.2 Neighborhoods
Every ~10 homes the street becomes a new **neighborhood** with a mini-theme (light reskin, same rules): **Leafy Lane → Foggy Bridge → Pumpkin Patch → Starry Alley**, cycling forever with a growing global index. Refusals grow slightly more common and candies slightly richer as the index rises, with soft caps (curves in `BALANCE.md`). A small celebration beat marks each transition.

### 4.3 Cast
| Who | Notes |
|---|---|
| **Milo** (6) | wizard: **long indigo robe with bell sleeves + star motifs, floppy black pointed hat** + star, wand; the braver brother, leads |
| **Tino** (4) | pumpkin costume, jack-o'-lantern bucket; hides his face during scares |
| **Nonna Rosa** | headscarf, glasses, shawl — neighbor archetype |
| **Fantasmino** | sheet ghost — neighbor archetype |
| **Conte Vlad** | polite vampire — neighbor archetype + mid-distance cameo |
| **Lupo Gentile** | gentle grey-lavender werewolf — neighbor archetype + cameo |
| **Spaventapasseri** | scarecrow — neighbor archetype (yard dweller) |
| **Strega** | the witch — neighbor archetype **and** the Bottega keeper |
| **Neighborhood kids** | 4–6 recycled costumed kids (ghost sheet / pumpkin / witchling / skeleton / bat) roaming, waving when passed, sometimes shouting "Dolcetto o scherzetto!" in the distance |

### 4.4 Ambient life
- **Cars**: 3–5 parked (4 dusk-muted colours) at curb/driveways; a **rare slow passer** (~60–90 s) on the far lane with sweeping headlights. Never a hazard.
- **Sky ghosts**: 2–3 drifting above rooftops (behind houses), gentle bob; a shy one peeks from a trash can occasionally; sky ghosts giggle-hop after every successful scherzo.
- **Ornaments** (2–4 per house, pure decor — **never correlates with refusal odds**): cobwebs (with dangling spider), fluttering bats, candle lanterns, tombstones (funny carvings, no readable text), scarecrows, pumpkin pairs, garden gnomes.
- **Ambience visuals**: fog wisps, fireflies, leaf drifts, twinkling stars, crater moon.

## 5. Core loop

```
roam → knock → door (greet) → resolve:
        treat (60%)  → candies float out → collect → done
        refuse (40%) → SCHERZO lights up → fan → trick show → candy burst → collect → done
        re-gift  (done homes, first re-knock ever, 30%) → 1 candy → collect
        seen     (done homes otherwise) → funny bubble → close
```
- **Candy drops** land in a little sidewalk pile; **nothing expires**; the pile waits forever. Every candy **glows** — a soft halo in its own pastel colour with a gentle pulse (stronger on the landed pile); static under reduced motion.
- **One-shot homes**; re-gift capped once per home ever (ADR-0003).
- **Store** opens anytime from the HUD button; buying never blocks the loop.
- **Never lose**: no fail, no timer; walking away mid-flow simply closes the door (a refused-but-unpranked home stays available).

## 6. Controls & input

- **Walk**: hold (both directions, free backtracking). Touch: translucent corner buttons **and** the whole screen half works. Desktop: arrow keys / A-D, or hold the mouse on a side. No auto-stop at doors — the player chooses.
- **Knock**: floating `Bussa ✊` button appears above the door when in range; ↑ also works. The cloud **beckons** — a gentle 1.25 s pulse with an amber glow ring and a tapping-hand animation (static under reduced motion).
- **Collect**: tap each candy. **+N** floats; candy flies into the bucket HUD.
- **Scherzo**: HUD-lights up at a refusing home → tap → trick fan → tap a trick → show plays (no input during it).
- **Bottega**: HUD button, anytime. **Sound**: toggle (persists). **Language**: toggle (persists).
- iOS gotchas (Review Focus in the plan): audio unlock on first gesture; `pointer-events` and `touch-action` for held buttons; safe-area insets.

## 7. Scherzo & the trick theatre

**8 tricks** (free default + 7 purchasable; prices provisional, bursts are the gentle power tiers):

| id | IT / EN | price | burst | show beats |
|---|---|---|---|---|
| boo | BOO! / BOO! | 0 | 4 | ghost face rises over the step, pops with "BOO!" |
| ragnetto | Ragnetto / Rubber Spider | 15 | 5 | spider on a thread lowers to the knob, dances |
| serpente | Serpente a molla / Spring Snake | 30 | 6 | can slides in, lid pops, snake boings |
| cuscino | Cuscino / Whoopee Cushion | 45 | 6 | cushion slips under the mat, *prrrt*, puff |
| maschera | Maschera buffa / Silly Mask | 60 | 7 | mask thrusts up into the neighbor's face, "BOOO!" |
| topolino | Topolino / Rubber Mouse | 75 | 7 | wind-up mouse zips across, wobble, innocent look |
| fantasmino | Fantasmino / Ghost Puppet | 90 | 8 | puppet rises from the bucket, twirls, bows |
| mano | Mano pelosa / Furry Hand | 110 | 8 | furry hand slides around the frame, waves ciao |

**Staging rules** (all shows): veil dim `rgba(12,7,30,.45)` + warm cone spotlight on the door; props ~1.5× world scale; timeline 0–0.6 s setup → 0.6–1.7 s gag → ~1.9 s climax (candy burst) → ~2.4 s done → veil out ~3.0 s; one distinct sound per gag; **watch-and-laugh** (no mid-show input); always succeeds; the neighbor reacts scared-then-laughing; collection is the only tap step.

## 8. Candy & economy

- **10 candy types** (lollipop, gummy, chocolate, toffee, corn, star, +4 visual variants): **cosmetic only**.
- **Value**: uniform **1–10 rolled at drop**, revealed as `+N` on collect.
- **Bag = wallet** (shared by the duo). **Album** screen: total + per-type counts this run. **Record**: biggest bag ever, persisted.
- Treating home: 1–2 candies. Scherzo burst: 4–8 by trick tier. Re-gift: 1.
- **Pacing**: first trick affordable within ~10–12 candy events (~2–3 min); price ladder stretches after. Exact curves, refusal scaling and drop weights live in `BALANCE.md` (to write).

## 9. Endless & progression

- **Progress = furthest house reached** (backtracking never regresses).
- Neighborhood every ~10 homes; theme rotates; refusal/richness shift gently with the global index; soft caps.
- Bought tricks visibly pay off in later neighborhoods (bigger bursts vs slightly stingier homes).

## 10. Tone, scary moments & safety

**Ceiling**: friendly + a little spooky; rare monster cameos that **always end funny**; never aimed at the player.

**Scary moment spec** (this intentionally supersedes the earlier "never a real startle" lock):
- Triggers **only while freely walking** (roam), at most once per **60–120 s**; never during door flows, trick shows, or collecting.
- Veil: brief dim + soft purple/green wash (≤1 s; **no strobe**); `prefers-reduced-motion` → dim + crossing only, no flash.
- One of: **witch** crossing the sky on a broom, **werewolf** dashing across the yard line, **vampire** gliding mid-distance. 1.5–1.8 s traversals; moderate cartoon sound each (`scare:*`).
- **Kids' beat (~2.5 s)**: stop, turn to each other, Tino buries his face in Milo's robe, both tremble, peek, then a **giggle recovery** and hands again. Walking input is ignored during it.
- Volume policy: moderate, no spikes (peaks ≤0.18); every sound respects the global toggle.

## 11. Audio design

- **Music**: the street loop is the owner-provided track **"A Winter's Night" — Etienne Roussel**, optimized for space (ears-trimmed: 0.5 s head / 4.2 s tail silence removed, loudness-normalized EBU R128 to −16 LUFS, 112 kbps → 1.35 MB / 95.9 s; versioned filename `static/music/a-winters-night.v1.mp3` for SW cache-busting). Title theme + optional extra loops + 2–3 stingers can still be generated with **Stable Audio 3** via `music-sfx-voice-studio`. **License note: owner-provided track — verify license terms before any public deploy.**
- **Ambience**: per-neighborhood **beds** — leafy = wind + leaf rustle; foggy = wind + drips + distant bell; pumpkin = wind + creaks + crows; starry = very quiet + owls + distant laughter — plus sparse **sprinkles** (one-shot owl/creak/drip/bell/crow/laugh/rustle every ~20–40 s). Mix: bed sits quietly under music; **ducks ~6 dB during trick shows and scary moments**. Real loops from the studio in the asset pass; the prototype ships a WebAudio synth placeholder (host module).
- **SFX inventory** (prototype reference implementation: `pieces/sfx.js` — accepted): knock, pop, coin, twinkle, refuse, seen, buy, giggle, passer, stepLeaf + one `fire:<trick>` per trick + `theatre-setup` / `theatre-laugh` + `scare:witch|wolf|vampire`. Production bakes these (jsfxr / SA3) with the same cue names.
- **Voice**: full lines IT+EN via the Qwen3-TTS `game_voice` pipeline (ADR-0005). `voice/lines.json` is the single source; rendered to `static/voice/<lang>/` + `manifest.json` (resumable). Voices: the two boys (young, warm), six neighbor archetypes (distinct; Strega also speaks the Bottega), neighborhood-kid shout lines. Lines per archetype: greet / treat / refuse / scherzo-reaction / re-gift / already-seen.

## 12. Art direction

- Canonical: **`ART-STYLE.md`** (plush night; palette; rules; motion durations; QA checklist).
- **Split rule**: anything that **moves, reacts, or is touched → hand-built SVG**; **static scenery → flux2 candidate** (title hero/OG, Bottega panel, celebration panels; house-facade cutouts as a spike with SVG fallback).
- Sprite inventory lives in `pieces/sprites.js` (accepted, with motion layer) + host fallbacks in the prototype.
- All motion transform/opacity only; `prefers-reduced-motion` kill switch everywhere.

## 13. Platform & tech

- **Stack**: SvelteKit 5 + TypeScript + Vite, `adapter-vercel` → **Vercel**, PWA (manifest `orientation: landscape`, service worker offline shell, icons via `tools/gen-icons`), Fredoka font, pnpm, **Vitest + Playwright**.
- **Renderer**: DOM/SVG, no canvas (ADR-0001); node/animation budgets documented in `ARCHITECTURE.md` (to write).
- **Stage**: height-scaled, fluid width, iPhone 16 landscape reference; safe-area insets (ADR-0004).
- **Persistence**: localStorage only — defensive `persist` + `settings` modules mirroring the sibling project (versioned keys, never throws), one slot, autosave, hidden parent reset (ADR-0006).
- **Docs set**: `GLOSSARY.md`, `ART-STYLE.md`, spec + plan under `docs/superpowers/`, `docs/adr/`, `docs/ISSUES.md`; later: `ARCHITECTURE.md`, `CONTENT-BIBLE.md`, `BALANCE.md`, `ART-MUSIC.md`, `CREDITS.md`.

## 14. Quality bar

- Unit: the pure `Loop` sim (walk/knock/treat/refuse/scherzo/collect/re-gift/shop/progression) — table-driven tests.
- E2E (Playwright): the full treat flow, the refuse→trick-show flow, shop purchase, language toggle, sound toggle, reduce-motion, save→reload persistence.
- Device pass on an actual iPhone 16 in Safari (PWA install, rotation, safe areas, audio unlock).
- Console-clean; both languages complete; no flash under reduced-motion.

## 15. Open items owned by future docs

| Doc | Owns |
|---|---|
| `BALANCE.md` | refusal curve, richness scaling, price ladder, drop weights, burst counts, re-gift odds |
| `CONTENT-BIBLE.md` | every line (IT/EN), archetype copy, ornament catalog per theme, trick flavor text, celebration beats |
| `ARCHITECTURE.md` | file map, node/animation budgets, save schema, audio graph |
| `ART-MUSIC.md` | generation provenance, prompts, licenses, trim/loop procedure |
| `CREDITS.md` | fonts, tools, licences |

## 16. Prototype status (what production inherits)

- `Loop` — pure, liftable sim module (TypeScript target: `src/lib/sim/loop.ts`).
- `pieces/sprites.js` — world sprite pack **with motion layer** (class hooks: `.walking`, `.s`, `.flame`, `.bat`, `.web`, `.sway`, `.rolling`) → becomes `src/lib/art/sprites/*`.
- `pieces/houses.js` — 8-type house pack × 3 palettes (door contract) → becomes `src/lib/art/scenes/houses.ts`.
- `pieces/sfx.js` — synth SFX reference (cue names = production contract) → becomes `src/lib/audio/sfx.ts` behind the same API.
- `pieces/theatre.js`, `pieces/scares.js` — show/beat choreography reference (port to Svelte components).
- `pieces/*-preview.html` — visual acceptance harnesses (throwaway).
- Ambience engine + per-neighborhood beds — host module in the prototype → `src/lib/audio/ambience.ts`.
