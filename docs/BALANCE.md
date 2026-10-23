# BALANCE

The game's tuning, one honest table at a time. **Every number here is read out of the code**
— nothing in this file is invented or aspirational — and each row names the file it comes
from. The pure sim modules are the authority: `src/lib/sim/loop.ts` (movement, economy
wiring, drops), `src/lib/sim/economy.ts` (rolls, prices, bursts) and
`src/lib/sim/progression.ts` (neighborhood curves). Where a value is a deliberate tunable
shipped with a documented default — the refusal and richness knobs — that is called out.

> "Swallow-free": no range, no "about", no rounding-up in this file. A value is either the
> exact exported constant or it is written as `[lo, hi)`.

See also: [`ARCHITECTURE.md`](ARCHITECTURE.md) (the module map and budgets) and
[`ART-MUSIC.md`](ART-MUSIC.md) (which asset backs each cue).

## 1. Economy — candy, the bag, and drops

| Knob | Value | Source |
|---|---|---|
| Candy value roll | uniform **1–10** (`1 + ((rng()*10) \| 0)`), rolled per drop, revealed as `+N` | `src/lib/sim/economy.ts` `rollValue` (spec §8, ADR-0003) |
| Treat candies per treating home | uniform **1–2** (`1 + ((rng()*2) \| 0)`) | `src/lib/sim/economy.ts` `treatCount` |
| Treat probability (untouched home) | **0.60** at neighborhood 0 (`1 - refusalP(index)` thereafter) | `src/lib/sim/loop.ts` KNOCK; `TREAT_P` baseline; `progression.ts` `refusalP` |
| Refuse probability (untouched home) | **0.40** → soft cap **0.55** by neighborhood index | `progression.ts` `refusalP` (live in `loop.ts`) |
| One-shot homes | a home is **done** on treat-collected or trick-played | `src/lib/sim/loop.ts` (`HomeState.done`), ADR-0003 |
| Re-gift odds (done home, first re-knock ever) | **0.30** | `src/lib/sim/loop.ts` `REGIFT_P` |
| Re-gift cap | **at most once ever** per home (`used` flag) | `src/lib/sim/loop.ts` `HomeState.used`, ADR-0003 |
| Re-gift size | **1** candy | `src/lib/sim/loop.ts` `RESOLVE 'regift'` → `spawnCandies(n, 1)` |
| Bag | the running total of collected values — the wallet, shared by the duo | `src/lib/sim/loop.ts` (`bag`), GLOSSARY "Bag" |
| Record | biggest bag ever held, persisted | `src/lib/sim/loop.ts` (`record`), `src/lib/persist/persist.ts` |

## 2. The trick ladder — prices and bursts

Free default plus seven purchasable; **price** is the candies paid at the Bottega, **burst**
is how many candies a show's climax drops (`src/lib/sim/economy.ts` `TRICKS`, `TRICK_ORDER`;
burst tier in `src/lib/play/fan-model.ts` `tierDots`). Spec §7, plan Global Constraints.

| trick | IT / EN | price | burst | tier dots |
|---|---|---|---|---|
| boo | BOO! / BOO! | **0** (free) | 4 | 1 |
| ragnetto | Ragnetto / Rubber Spider | 15 | 5 | 1 |
| serpente | Serpente / Spring Snake | 30 | 6 | 2 |
| cuscino | Cuscino / Whoopee Cushion | 45 | 6 | 2 |
| maschera | Maschera / Silly Mask | 60 | 7 | 3 |
| topolino | Topolino / Rubber Mouse | 75 | 7 | 3 |
| fantasmino | Fantasmino / Ghost Puppet | 90 | 8 | 4 |
| mano | Mano pelosa / Furry Hand | 110 | 8 | 4 |

The buy guard (`canBuy`) is exact: **known** trick, **not owned**, and `bag >= price`
(paying exactly the price is allowed) — `src/lib/sim/economy.ts`. First-trick pacing target
is ~10–12 candy events (ADR-0003).

## 3. Movement, the street, neighborhoods

| Knob | Value | Source |
|---|---|---|
| Walk speed | **190** px/s | `src/lib/sim/loop.ts` `SPEED` (spec §5) |
| Doorstep spacing | **620** px between doorsteps | `src/lib/sim/loop.ts` `SPACING` |
| "At the door" window | **±70** px (`\|worldX − k·SPACING\| <= NEAR`) | `src/lib/sim/loop.ts` `NEAR` |
| Start position | `worldX = -260` (mid-block, no door in range) | `src/lib/sim/loop.ts` `initial` |
| Homes per neighborhood | **10** | `src/lib/sim/progression.ts` `HOMES_PER_NEIGHBORHOOD` |
| Neighborhood count | **4**, cycling forever `leafy → foggy → pumpkin → starry` | `src/lib/sim/progression.ts` `THEMES`, `themeFor` |
| Theme index | `floor(max(0, furthestK) / 10)` | `src/lib/sim/progression.ts` `neighborhoodIndex` |
| Progress | furthest house reached; monotonic (backtracking never regresses) | `src/lib/sim/progression.ts` `trackFurthest` |
| HUD readout | `Bag` chip counts candy values (not types); types are cosmetic | `src/lib/sim/loop.ts` `CANDY_TYPES`; `src/lib/ui/Hud.svelte` |

## 4. Progression curves (tunable — the BALANCE-owned knobs)

`progression.ts` exports these as **live** knobs wired into `loop.ts`: knock treat chance is
`1 - refusalP(neighborhoodIndex(k))`, and candy value / treat-count rolls apply
`richnessBias` at the active house. The *shapes* (monotone rise, soft cap, base value) are
pinned by tests; the numbers are the tuning knobs. `TREAT_P` (0.60) remains the neighborhood-0
baseline (`1 - REFUSAL_BASE`).

| Knob | Value | Source |
|---|---|---|
| Refusal baseline (index 0) | **0.40** | `src/lib/sim/progression.ts` `REFUSAL_BASE` |
| Refusal step per neighborhood | **+0.015** | `src/lib/sim/progression.ts` `REFUSAL_STEP` |
| Refusal soft cap | **0.55** (reached at index 10, pinned forever) | `src/lib/sim/progression.ts` `REFUSAL_CAP`, `refusalP` |
| Richness step per neighborhood | **+0.03** | `src/lib/sim/progression.ts` `RICHNESS_STEP` |
| Richness soft cap | **0.35** (index 12+) | `src/lib/sim/progression.ts` `RICHNESS_CAP`, `richnessBias` |

## 5. Cadences and timings

### Candy and the knock flow

| Beat | Value | Source |
|---|---|---|
| Candy float (one candy) | **2.0** s | `src/lib/sim/loop.ts` `spawnCandies` (`dur: 2.0`); `src/lib/play/candy-motion.ts` |
| Float stagger | **0.12** s per candy | `src/lib/sim/loop.ts` (`delay: i * 0.12`) |
| Pile geometry | x0 **332**, step **30**, **5** columns; y **318**, 2-row stagger **8** | `src/lib/play/candy-motion.ts` `PILE_*` (mirrors the sim's `tx/ty`) |
| Pile idle bob | ±2.5 px, ~1.8 s alternate | `ART-STYLE.md` §8 |
| **Candy pick-me nudge** | an unpicked candy asks to be picked after **5000 ms** | `src/lib/play/CandyLayer.svelte` `PICKME_MS` |
| Knock invite (Bussa cloud) | **1.25** s pulse + glow ring + tapping hand | `ART-STYLE.md` §8; `src/lib/play/KnockButton.svelte` |
| Door swing | **0.55** s | `ART-STYLE.md` §8 |
| Knock chain | shout **+420 ms**, greet **+900 ms**, resolve **+2000 ms**, outcome **+150 ms** after resolve; door closes for `seen` **+2000 ms** | `src/lib/play/flow.ts` |
| Outcome line lengths | treat/regift 1800, refuse 2200, seen 1600, scherzo 2200 ms | `src/lib/play/flow.ts` `OUTCOME_MS`, `SCHERZO_MS` |

### The trick theatre (cue schedule, ms from `start()`)

`src/lib/play/theatre-timeline.ts`. Show: **0** setup sting → **90** setup begins →
per-trick gag (`fire:<id>`) → **1901** laugh + climax → **2402** done → **2450** veil out
begins → **3050** clear.

| trick | gag after setup | fire from start |
|---|---|---|
| boo | 760 | 850 |
| ragnetto | 1040 | 1130 |
| serpente | 860 | 950 |
| cuscino | 950 | 1040 |
| maschera | 360 | 450 |
| topolino | 140 | 230 |
| fantasmino | 220 | 310 |
| mano | 890 | 980 |

### Scary moments (`src/lib/play/scare-model.ts`)

| Knob | Value | Source |
|---|---|---|
| First cameo | no earlier than **28 000 ms** after load | `SCARE_FIRST_MS`, `firstScareAt` |
| Gap between cameos | **60 000 … 120 000 ms** (`[60 s, 120 s)`) | `SCARE_MIN_MS` + `SCARE_SPAN_MS` |
| Trigger | **roam only** — not refused/door/collect/trick, not shop-open, and only while moving (`dir ≠ 0`) | `scareTick` |
| Kinds | six: `witch`, `wolf`, `vampire`, `skeleton`, `mummy`, `thunder`; never twice in a row | `SCARE_KINDS`, `pickKind` |
| Kids' beat | **2500 ms** (stop → hug 60 → tremble 120 → peek 1400 → giggle 1900 → release) | `SCARE_BEAT_MS`, `SCARE_BEAT` |
| Veil fade | **450 ms**, no strobe | `SCARE_VEIL_MS`; spec §10 |
| Crossing | 1.5–1.8 s traversals | `ART-STYLE.md` §8 |

### Ambient life and cadences

| Event | Value | Source |
|---|---|---|
| Neighborhood celebration | fires on each 10-home boundary, **2600 ms** on screen | `src/lib/play/celebration-model.ts`; `src/lib/play/Celebration.svelte` `BEAT_MS` |
| NPC kids pool | **6** recycled costumes (incl. cat-ears) | `src/lib/play/npc-model.ts` `NPC_POOL` |
| NPC walk speed | **120 … 160** px/s | `npc-model.ts` `NPC_SPEED_MIN`/`NPC_SPEED_SPAN` |
| NPC shout | first after **24 000 ms**, then **26 000 … 46 000 ms**; on-screen kids only | `npc-model.ts` `SHOUT_FIRST_MS`, `SHOUT_MIN_MS`/`SHOUT_SPAN_MS` |
| Parked cars | **4** per 5-block window (one in five blocks skipped) | `src/lib/play/car-model.ts` `CAR_SKIP_MOD`, `carSlots` |
| Rare passer | first after **30 000 ms**, then **70 000 … 100 000 ms**; crossing **4.2 s** | `car-model.ts` `PASSER_FIRST_MS`, `PASSER_GAP_MIN_MS`/`PASSER_GAP_SPAN_MS`, `PASSER_DUR_MS` |
| Firecracker kids (T37) | first **50 000 ms**, then **80 000 … 120 000 ms**; dash **2.5 s** | `street-life-model.ts` |
| Monster stroller (T37) | first **55 000 ms**, then **90 000 … 140 000 ms**; roll **5 s** | `street-life-model.ts` |
| Mystery van (T37) | first **70 000 ms**, then **100 000 … 160 000 ms**; toss 1 candy at mid | `street-life-model.ts` + `AMBIENT_CANDY` |
| Sky ghosts | **3** drifting behind the rooflines | `src/lib/play/ghost-model.ts` `GHOST_COUNT` |
| Trash-can cameo | first after **30 000 ms**, then **32 000 … 52 000 ms**; only a visible can | `ghost-model.ts` `CAMEO_FIRST_MS`, `CAMEO_MIN_MS`/`CAMEO_SPAN_MS` |
| Shooting star (`starry`) | first **40 000 ms**, then **40 000 … 60 000 ms**; shot lasts **1.4 s** | `src/lib/art/scene/theme-model.ts` `SHOOT_FIRST_MS`, `SHOOT_MIN_MS`/`SHOOT_SPAN_MS`, `SHOOT_DUR_MS` |
| Ambience sprinkles | **20 000 … 40 000 ms** between one-shots; only in `roam`/`refuse`, never ducked | `src/lib/audio/ambience.svelte.ts` `AMB_SPRINKLE_MIN_MS`/`AMB_SPRINKLE_MAX_MS`, `sprinkleAllowed` |
| Decor nodes per window | **≤ 30** (leafy 25, foggy 11, pumpkin 20, starry 20) | `theme-model.ts` `MAX_NODES_PER_WINDOW`, `NODES_PER_WINDOW` |

## 6. Audio levels

All gains are linear 0..1 scaled by the player's slider (`src/lib/audio/volumes.svelte.ts`;
defaults full at 1). The owner-tuned ceilings below sit **under** those sliders.

| Layer | Value | Source |
|---|---|---|
| SFX peak ceiling | **≤ 0.18** (worst-case sums stay inside) | `src/lib/audio/sfx.ts` `SFX_PEAK` |
| SFX master | slider value (1.0 = authored) | `sfx.ts` `setSfxVolume` |
| Ambience unducked master | **AMB_MAX = 0.5** | `src/lib/audio/ambience.svelte.ts` `AMB_MAX` |
| Ambience duck (show / scare) | **−6 dB** → factor **≈ 0.5012** | `ambience.svelte.ts` `AMB_DUCK_DB`, `AMB_DUCK_FACTOR` |
| Ambience theme-change ramp | τ = **2** s | `AMB_RAMP_S` |
| Music unducked master | **MUSIC_MAX = 0.143** | `src/lib/audio/music.svelte.ts` `MUSIC_MAX` |
| Music duck (show / scare) | **MUSIC_DUCK_MAX = 0.042** | `music.svelte.ts` `MUSIC_DUCK_MAX` |
| Music ramp | τ = **0.25** s | `MUSIC_RAMP_S` |
| Voice one-shots | played through the SFX bus (mute latches + slider on the master) | `src/lib/audio/voice.ts` `say` |
| Master mute | `settings.sound === false` zeroes every layer (polled ~500 ms in the frame engines) | `src/lib/persist/settings.ts`; `ambience.svelte.ts`/`music.svelte.ts`/`sfx.ts` |
| Decoded street loop | 95.9 s; gap-free via WebAudio decode | `src/lib/audio/music.svelte.ts`; spec §11 |
