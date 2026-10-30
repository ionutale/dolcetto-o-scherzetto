# CONTENT-BIBLE

Every player-facing string in *Dolcetto o Scherzetto*, in one place. The spoken lines are
**not authored here** — `src/lib/i18n/lines.ts` is the single source of truth, and a render
script proves that what is read on screen is byte-for-byte what is heard (the *copy lock*,
below). This file is the readable inventory: it quotes `lines.ts`, `bottega-model.ts`,
`boss-art.ts`, `progression.ts` and the UI components, and names where each table comes from.

## 1. The copy lock

- **`src/lib/i18n/lines.ts` is the source of truth for spoken copy.** Every bubble line is a
  *voiced* line, and the rendered clip is **byte-equal** to the string in `lines.ts`
  (`voice/VOICES.md` "Copy contract"; ADR-0005).
- The render inputs (`voice/lines.it.json`, `voice/lines.en.json`, `voice/render/*.json`) are
  **derived** from `lines.ts`, never retyped: `node voice/lines.mjs extract` reads the `L`
  table straight out of the TypeScript; `node voice/lines.mjs check` proves the equality on
  every run (sample of 12 lines per language, exact UTF-8 bytes, found in both `lines.ts` and
  the emitted JSON).
- **Editing a line invalidates its clip.** Re-run `extract` + `check` and re-render the
  changed ids (`voice/VOICES.md` §8).
- Line keys: one flat line per language (`shout`, and the button caption `knock`) plus six
  archetype tables (`greet`, `treat`, `refuse`, `regift`, `seen`, `scherzo`), each with one
  row per neighbor archetype in the fixed order **ghost, nonna, strega, wolf, vlad,
  scarecrow** (`NEIGHBOR_ARCHES`, `src/lib/art/sprites/neighbors.ts`).

## 2. The kids — the shout and the knock

| key | voiced? | IT | EN |
|---|---|---|---|
| `shout` | **yes** (Milo + Tino, together) | Dolcetto o scherzetto! | Trick or treat! |
| `knock` | no — a button caption, deliberately **not** in any render file | Bussa ✊ | Knock ✊ |

The shout leaves the kids' heads at `+420 ms` after a knock and holds 900 ms; the knock pill's
label is `knock` with the `✊` glyph split into its own tapping-hand span
(`src/lib/play/flow.ts`, `src/lib/play/KnockButton.svelte`).

## 3. The neighbors — the six archetype tables (all voiced)

Each table below is one `L[lang][key]`, quoted verbatim from `src/lib/i18n/lines.ts`.

### `greet` — when the door opens

| archetype | IT | EN |
|---|---|---|
| ghost | Buuu! Chi va là?... Ah, siete voi! | Boo! Who goes there?.. Oh, it’s you! |
| nonna | Oh, che bei bimbi! | Oh, what sweet boys! |
| strega | Ehehe, chi c’è alla porta? | Ehehe, who’s at my door? |
| wolf | Arf! Amici pelosi in visita! | Woof! Furry friends at the door! |
| vlad | Buonasera, piccoli ospiti! | Good evening, little guests! |
| scarecrow | Oh! Qualcuno mi ha parlato! | Oh! Someone talked to me! |

### `treat` — the home gives candy

| archetype | IT | EN |
|---|---|---|
| ghost | Dolcetti per voi... buuu! | Candy for you... boo! |
| nonna | Che carini! Ecco i dolcetti! | How cute! Here’s some candy! |
| strega | Prendete, piccoli maghi! | Take some, little wizards! |
| wolf | Tieni, tieni! Arf arf! | Here, take some! Woof woof! |
| vlad | Con piacere, prendete i dolcetti. | With pleasure — do take some. |
| scarecrow | Dolcetti freschi di paglia! | Candy fresh out of the straw! |

### `refuse` — the home has nothing; the Scherzo unlocks

| archetype | IT | EN |
|---|---|---|
| ghost | Ooooh... ho finito i dolcetti! | Oooh... I ran out of candy! |
| nonna | Stasera niente caramelle, mi dispiace! | No candy tonight, sorry! |
| strega | Il mio calderone è vuoto stasera! | My cauldron is empty tonight! |
| wolf | Ho già dato tutto, arf... peccato! | All out, woof... sorry! |
| vlad | Mille scuse: la dispensa è vuota. | A thousand pardons: the pantry is bare. |
| scarecrow | Ops! Ho la zucca di paglia, stasera! | Oops! My straw brain is empty! |

### `regift` — the once-ever small treat

| archetype | IT | EN |
|---|---|---|
| ghost | Aspetta... una è rimasta! | Wait... one left! |
| nonna | Tieni, ancora una! | Here, one more! |
| strega | Una scappata dal calderone! | One escaped my cauldron! |
| wolf | Aspetta! Una era nel pelo! | Wait! One was in my fur! |
| vlad | Un ultimo dolcetto, con garbo. | One last candy, with grace. |
| scarecrow | Una era qui tra la paglia! | One was hiding in the straw! |

### `seen` — a done home, already met

| archetype | IT | EN |
|---|---|---|
| ghost | Buuu... ci siamo già visti! | Boo... we already met! |
| nonna | Ci siamo già visti, aha! | We already met, haha! |
| strega | Già passati di qui, ehehe! | Already been here, ehehe! |
| wolf | Arf! Ci eravamo già annusati! | Woof! We sniffed noses already! |
| vlad | Ci siamo già presentati, rammento. | We have met already, I recall. |
| scarecrow | Già visti, già visti! Che testa! | Seen you already! Silly me! |

### `scherzo` — the trick's payoff

| archetype | IT | EN |
|---|---|---|
| ghost | Ehehe! Mi avete fatto ridere! Tieni! | Ehehe! You made me laugh! Take! |
| nonna | Ah! Che burloni! Prendete! | Ah! You rascals! Take these! |
| strega | Ehehe! Bei maghetti! Tutto per voi! | Ehehe! What little wizards! All yours! |
| wolf | Arf arf! Che ridere! Tutto per voi! | Woof woof! That tickled! All yours! |
| vlad | Ah! Spiritosi. Ve li siete meritati! | Ah! Droll. You have earned these! |
| scarecrow | Eh eh! Mi avete scompigliato la paglia! | Heh heh! You ruffled my straw! |

Line durations and cue per outcome: treat/regift 1800 ms, refuse 2200 ms, seen 1600 ms,
scherzo 2200 ms (`src/lib/play/flow.ts` `OUTCOME_MS`, `SCHERZO_MS`).

## 4. Neighborhood names (captions — not voiced)

Names only; the celebration banner shows the one you just entered
(`THEME_NAMES`/`themeName`, `src/lib/i18n/lines.ts`).

| theme | IT | EN |
|---|---|---|
| leafy | Viale delle Foglie | Leafy Lane |
| foggy | Ponte Nebbioso | Foggy Bridge |
| pumpkin | Campo delle Zucche | Pumpkin Patch |
| starry | Viale Stellato | Starry Alley |

## 5. The celebration beat

A small top-centre banner drops in when a 10-home boundary is crossed (never mid-flow),
shows the neighborhood's name with `✨` on either side, and leaves after **2600 ms**
(`src/lib/play/Celebration.svelte` `BEAT_MS`; the *when* is `src/lib/play/celebration-model.ts`).
Its text is exactly the theme name above; it is announced politely (`role="status"`).
There is a `onStinger(theme)` audio hook, but **the stinger is a no-op today**
(`+page.svelte` `noopStinger`).

## 6. The Bottega — shop chrome and the eight tricks

Chrome (`SHOP_COPY`, `src/lib/ui/bottega-model.ts`):

| string | IT | EN |
|---|---|---|
| title | La Bottega della Strega | The Witch’s Shop |
| sub | Compra trucchi col sacchetto. (Prezzi provvisori — BALANCE.md) | Buy tricks with your candy bag. (Provisional prices — BALANCE.md) |
| owned chip | Tuo! | Yours! |
| buy button | Compra | Buy |

Rows (name from `TRICKS[id].name`, flavour from `trickDesc`, `src/lib/sim/economy.ts` +
`src/lib/ui/bottega-model.ts`). All eight are always listed, cheapest first (`TRICK_ORDER`);
a row is `owned` / `affordable` / `poor`:

| id | IT name | EN name | IT flavour | EN flavour |
|---|---|---|---|---|
| boo | BOO! | BOO! | Il tuo primo scherzo, sempre con te | Your first trick, always with you |
| ragnetto | Ragnetto | Rubber Spider | Un ragnetto di gomma sul pomello | A rubber spider on the doorknob |
| serpente | Serpente | Spring Snake | Un serpente a molla dalla scatola | A spring snake from a can |
| cuscino | Cuscino | Whoopee Cushion | Prrrrrt! sotto lo zerbino | Prrrrrt! under the doormat |
| maschera | Maschera | Silly Mask | Una faccia buffa a sorpresa | A silly face surprise |
| topolino | Topolino | Rubber Mouse | Un topolino a molla che sfreccia | A wind-up mouse zooming by |
| fantasmino | Fantasmino | Ghost Puppet | Un burlone che sale dal secchio | A prankster rising from the bucket |
| mano | Mano pelosa | Furry Hand | Una mano pelosa che saluta | A furry hand waving hello |

The buy button's accessible name is `"{buy} {name}"`; the close control is
`Chiudi la Bottega` / `Close the shop` (`src/lib/ui/Bottega.svelte`).

## 7. HUD, title, settings and the overlays

**Title** (`src/lib/ui/TitleScreen.svelte`; `<h1>` is `Dolcetto o Scherzetto` in both):

| string | IT | EN |
|---|---|---|
| eyebrow | 🎃 Una notte di caramelle | 🎃 A night of candy |
| play | Gioca ▶ | Play ▶ |
| settings | ⚙️ Impostazioni | ⚙️ Settings |
| dialog name | Menu principale | Main menu |

**Settings** (`src/lib/ui/Settings.svelte`):

| string | IT | EN |
|---|---|---|
| title | Impostazioni | Settings |
| music | 🎵 Musica | 🎵 Music |
| sfx | 🔊 Effetti | 🔊 Sound effects |
| language | Lingua | Language |
| back | Indietro | Back |
| parent wipe | Cancella progressi (genitori) | Erase progress (parents) |
| …confirm | Sicuro? Tocca di nuovo | Sure? Tap again |

The language buttons read `IT` / `EN` in both (accessible names `Italiano` / `English`).

**HUD** (`src/lib/ui/Hud.svelte`):

| string | IT | EN |
|---|---|---|
| bag chip (spoken) | Sacchetto: N caramelle (N=1 → caramella) | Bag: N candies (N=1 → candy) |
| Bottega pill (visible) | 🏪 Bottega | 🏪 Bottega |
| Bottega pill (spoken) | Apri la Bottega | Open the shop |
| menu button | Menu | Menu |

**Scherzo button + fan** (`src/lib/play/Scherzo.svelte`): the button reads `✨ SCHERZO` in
both languages; spoken names are `Usa uno scherzo` / `Use a trick`; the fan group is
`Trucchi` / `Tricks`; the `✕` is `Chiudi gli scherzi` / `Close the tricks`; a card is read as
`"{name}, livello N"` / `"{name}, tier N"`.

**Walk controls** (`src/lib/play/WalkControls.svelte`): `Cammina a sinistra` / `Cammina a
destra` (IT), `Walk left` / `Walk right` (EN).

**Rotate button** (`src/lib/ui/RotateButton.svelte`, T4b): `Gira il gioco a sinistra` /
`Turn the game left` — the manual screen rotation. Every tap turns the stage a quarter turn
to the left. The Settings card labels the same control `Rotazione` / `Rotation` with
`Ruota a sinistra` / `Rotate left` plus the live angle (`Ruota a sinistra · 90°`).

**Rotation mode** (T43, ADR-0007): the Settings `Schermo` / `Screen` row is a pair,
`Automatica` / `Automatic` and `Manuale` / `Manual`, persisted as `rotationMode` in
`dos.settings.v1` and defaulting to automatic. Automatic shows the pure-CSS portrait prompt
(`src/lib/ui/RotatePrompt.svelte`) — there is still no sensor; the prompt is a media query.
Its copy follows the language and its one pill is `Gioca così` / `Play this way`, which
persists `Manuale`. The knock pill's spoken name is the `knock` label without the glyph
(`Bussa` / `Knock`).

**Silent-switch tip** (T44): `src/lib/ui/SilentHint.svelte` says `Non senti? Togli il
silenzioso o usa le cuffie.` / `No sound? Turn off silent mode or use headphones.` with a
`Chiudi` / `Close` button. iOS exposes no mute signal, so the tip is not a detection: it is
shown once, only on iOS builds without `navigator.audioSession` (iOS 16 and older), and
remembered as `audioHintSeen` in `dos.settings.v1`. iOS 17+ ignores the switch instead
(`audioSession.type = 'playback'` set on the first gesture).

**Install guide** (T45): the home card's pill is `📲 Installa sul telefono` / `📲 Install on
phone`, hidden when the game already runs from the Home Screen. It opens
`InstallGuide.svelte`: badge `iPhone · iOS 18 · iOS 27`, title `Installa sul telefono` /
`Install on your phone`, intro `Safari non ha un pulsante «Installa»: il gioco si aggiunge
alla schermata Home.` / `Safari has no “Install” button: the game is added to your Home
Screen.`, four steps — open in **Safari**, tap **Condividi** / **Share**, tap **Aggiungi
alla schermata Home** / **Add to Home Screen**, tap **Aggiungi** / **Add** — two notes (the
iOS 18 `Apri come app web` / `Open as Web App` switch, and `Modifica azioni…` /
`Edit Actions…` when the row is hidden), and the close pill `Ho capito` / `Got it`.

**The candy boss** (T42) — the three display names live in `BOSS_META` and the fight's four
chrome strings in `BOSS_COPY` (`src/lib/play/boss-art.ts`; `Boss.svelte` renders them and
picks the language live). None of it is voiced, and the boss art itself carries no text.

| string | IT | EN |
|---|---|---|
| `zucca` name | Grande Zucca | Great Pumpkin |
| `mostro` name | Mostro Goloso | Sweet-Tooth Monster |
| `recaramella` name | Re Caramella | Candy King |
| hint | Tocca per lanciare caramelle | Tap to throw candy |
| win | Bravissimo! | You did it! |
| reward | +60 caramelle | +60 candies |
| throw button label (screen reader) | Lancia una caramella | Throw a candy |

The win card shows `win` over `reward`; the same pair is announced once through a polite
`role="status"` live region. The Settings card adds the parent switch
(`src/lib/ui/Settings.svelte`):

| string | IT | EN |
|---|---|---|
| row label | Boss | Boss |
| on | Sì | On |
| off | No | Off |

There is no on-screen text in the scares or the sky ghosts (`src/lib/play/Scares.svelte`,
`Ghosts.svelte`) — those beats are visual.

## 8. The voice-clip id scheme and counts

Source: `voice/VOICES.md` §3/§6.2; consumed by `src/lib/audio/voice.ts`.

- **Id scheme (language-neutral):** `shout`, then `<key>-<arch>` for each of the six keys ×
  six archetypes. The language lives in the **directory**:
  `static/voice/<lang>/<id>.mp3` (`lang ∈ it, en`). Ids never contain a dot.
- **Counts:** 1 shout + 6 keys × 6 archetypes = **37 ids per language → 74 clips total**;
  each language's `manifest.json` carries **37 rows** (`{id, text, bytes, duration, sha256}`,
  `text` byte-equal to `lines.ts`).
- **Not voiced:** the `knock` button caption, the four neighborhood names, the shop copy
  (`Tuo!`/`Compra`/… — `voice/VOICES.md` §8 notes the shop lines would reuse Strega's voice
  when/if they are rendered), and the candy-boss names/hint/win/reward plus its throw label
  (T42 — the fight uses the existing `theatre-setup` / `pop` / `theatre-laugh` / `twinkle` cues,
  never a new clip).
- **The gate:** `pnpm check:voice` (`tools/check-voice.mjs`) proves, for both languages, a
  non-empty clip and a matching manifest row per id; the two languages ship the same id set.

The clip pipeline, the designed voices and the licence status live in
[`ART-MUSIC.md`](ART-MUSIC.md) §7/§9.

## 9. Neighborhood decor & the ornament catalog

These are the only content items owned by this bible that carry **no player-facing strings** —
and that is deliberate: no text is ever baked into an ornament or a decoration
(`ART-STYLE.md` §4 rule 5; the tombstones carry carvings, never readable words). Listed here so
the catalog is not lost.

**The ornament pool** (2–4 per house, pure decor, **never** correlated with refusal odds;
`ART-STYLE.md` §7): cobwebs (with a dangling spider), fluttering bats, candle lanterns
(flicker), tiny tombstones (funny carvings, no readable text), scarecrows, pumpkin clusters —
plus, in the yards, garden gnomes and mailboxes.

**The per-theme ambient decor** (the T22 "light reskin":
`src/lib/art/scene/theme-model.ts`, `≤ 30` nodes per window):

| theme | decor | per window |
|---|---|---|
| leafy | drifting leaves on the walk/road band | 25 |
| foggy | fog wisps + one faint mist band | 11 |
| pumpkin | pumpkin clusters + a hay tuft | 20 |
| starry | a brighter star shimmer pass (+ the rare shooting star) | 20 |

Picks are a deterministic pure function of `(theme, k)`, so a re-entered house looks
identical and the decor can never hint at a home's outcome.
