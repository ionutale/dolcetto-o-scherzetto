# Voice lines — render plan (T28a)

**What this is.** The authored, engine-ready content for the T28 render: every voiced
fragment of *Dolcetto o Scherzetto* in IT + EN, plus the speaker→voice strategy and the
exact `game_voice` commands that turn them into `static/voice/<lang>/*.mp3`.

**Who runs the render.** The studio session (Orchestrator), on GPU, after T28a. This
document is the runbook; the JSONs are the input. Nothing here renders at runtime.

**Copy contract.** `src/lib/i18n/lines.ts` is the single source of truth. Every string in
these JSONs is **byte-equal** to its `lines.ts` counterpart — the bubble the player reads
is the clip the player hears (ADR-0005). They are *derived*, not retyped:
`node voice/lines.mjs extract` reads the `L` table straight out of `lines.ts`, and
`node voice/lines.mjs check` proves the equality on every run (see §7).

---

## 1. The pipeline contract we target (quoted from `game_voice/generate_lines.py`)

The script accepts **one list of `{id, text}`** and binds **exactly one voice per run** to
every entry in it:

```python
def load_lines(path) -> list[dict]:
    """Read the game's emitted fragment list."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return [{"id": str(item["id"]), "text": str(item["text"])} for item in data]
```

```python
# one voice for the whole file — mutually exclusive, exactly one required
voice = (resolve_voice(args.voice, args.voices_dir) if args.voice
         else resolve_speaker(args.speaker, args.language))
```

```python
out_dir.mkdir(parents=True, exist_ok=True)
ext = EXT.get(fmt, ".wav")
pending = [e for e in entries if not _complete(clip_path(out_dir, e["id"]).with_suffix(ext))]
log(f"[lines] {len(entries)} clips total, {len(pending)} to render")
```

```python
def _complete(path: Path) -> bool:
    return path.is_file() and path.stat().st_size > 0
```

```python
def build_manifest(entries, out_dir, duration_fn=None) -> list[dict]:
    """Describe each clip: text, bytes, sha256, and duration when available."""
```

`main()` writes `<out>/manifest.json` from `build_manifest(entries, out, media_duration)`.

Three consequences drive the shape of `voice/`:

| Contract fact | Consequence |
|---|---|
| One voice per run | **Per-speaker render files** — the six neighbours and the boys cannot share one input file (see §2). |
| `clip_path = Path(out) / id`, then `.with_suffix(ext)` | **Ids must not contain a dot.** `greet.ghost` → `greet.mp3`, and two clips silently fight over one file. Ids are `<key>-<arch>` (§3). |
| Manifest is rebuilt from the *entries of that run* into `<out>/manifest.json` | Seven runs into one language dir would leave a 6-row manifest. §6 rebuilds the complete 37-row one. |

Preset names are `config.DEFAULT_SPEAKERS` — `serena`, `vivian`, `uncle_fu`, `ryan`,
`aiden`, `ono_anna`, `sohee`, `eric`, `dylan` (case-sensitive). Languages come from
`config.LANGUAGES`; the game uses **`Italian`** and **`English`**.

## 2. Files (owned by T28a)

```
voice/
├── lines.it.json          # full IT inventory — 37 lines (QA + final-manifest input)
├── lines.en.json          # full EN inventory — 37 lines
├── render/                # what generate_lines.py --lines actually reads
│   ├── it.kids.json       #   1 line   (the boys' shout)
│   ├── it.ghost.json      #   6 lines  ┐
│   ├── it.nonna.json      #   6 lines  │
│   ├── it.strega.json     #   6 lines  │ one run = one voice
│   ├── it.wolf.json       #   6 lines  │
│   ├── it.vlad.json       #   6 lines  │
│   ├── it.scarecrow.json  #   6 lines  ┘
│   ├── en.kids.json       #   … same 7 files for EN
│   ├── en.ghost.json
│   ├── en.nonna.json
│   ├── en.strega.json
│   ├── en.wolf.json
│   ├── en.vlad.json
│   └── en.scarecrow.json
├── lines.mjs              # extract / check / samples (see §7)
└── VOICES.md              # this runbook
```

There is deliberately **no single `voice/lines.json`**: the ADR names one source, but the
tool cannot render two voices from one file, and a file that is not renderable would be a
trap. `lines.it.json` / `lines.en.json` are the "full inventory" the plan asks for; the
`render/*.json` files are the renderable projection of them, and `check` proves the
projection is a partition (same ids, same texts).

**Line budget: 1 shout + 6 keys × 6 archetypes = 37 per language → 74 clips.**
The `knock` label (`Bussa ✊` / `Knock ✊`) is a **button caption, not a voiced line** — it
is deliberately not in any render file.

## 3. Id scheme (the playback contract)

| id | lines.ts accessor |
|---|---|
| `shout` | `t(lang, 'shout')` — the boys / NPC kids |
| `<key>-<arch>` | `t(lang, key, arch)` for `key ∈ greet, treat, refuse, regift, seen, scherzo` and `arch ∈ ghost, nonna, strega, wolf, vlad, scarecrow` |

37 ids: `shout`, then for each of the six keys — `greet-ghost`, `greet-nonna`,
`greet-strega`, `greet-wolf`, `greet-vlad`, `greet-scarecrow`, then `treat-…`, `refuse-…`,
`regift-…`, `seen-…`, `scherzo-…` in the same six-archetype order
(`NEIGHBOR_ARCHES` from `src/lib/art/sprites/neighbors.ts`).

Ids are **language-neutral**: the language lives in the directory
(`static/voice/<lang>/<id>.mp3`), exactly as the spec's
`t(lang, key, arch)` API separates copy from settings. Practical note this buys and its
trap: the same id renders to *different* files in the two out dirs, so **never point both
languages at one `--out`** — the second run would find every clip "already rendered" and
exit with 0 clips.

Id order in each file follows the knock chain (`greet → treat → refuse → regift → seen →
scherzo`), which makes a partial render trivially resumable and matches the flow order the
player experiences.

## 4. Speaker → voice strategy

Nine built-ins exist, but the frozen engine's README lists only **`ryan` / `aiden`** as
English speakers (the rest — `vivian`, `serena`, `uncle_fu`, `dylan`, `eric` — are
Chinese, and `ono_anna`/`sohee` read JP/KR), and none of them is a child. For an IT+EN
game that means: **presets only where a native adult male voice is exactly right; design
the rest** (§5). Auditions decide — record the pick in the ISSUES.md T28 row.

| speaker | who (spec §4.3) | strategy | voice name | why |
|---|---|---|---|---|
| `kids` | **Milo (6) + Tino (4)**, shouting together | **designed ×2 langs** | `dos-kids-it`, `dos-kids-en` | every preset is an adult; the shout is the game's signature sound |
| `ghost` | **Fantasmino**, sheet ghost | **designed ×2 langs** | `dos-ghost-it`, `dos-ghost-en` | needs airy/hollow but cute; a human preset can't levitate |
| `nonna` | **Nonna Rosa** | **designed ×2 langs** | `dos-nonna-it`, `dos-nonna-en` | grandmotherly warmth + pace; `voices/nonna-b` is already an auditioned IT nonna and can stand in for IT (§5.1) |
| `strega` | **Strega**, also the Bottega keeper | **designed ×2 langs** | `dos-strega-it`, `dos-strega-en` | cackling warmth — laughter baked into the timbre, the one voice that must be *funny* |
| `wolf` | **Lupo Gentile**, gentle grey-lavender werewolf | **designed ×2 langs** | `dos-wolf-it`, `dos-wolf-en` | "friendly puppy": deep but plush, growl on the `arf`, zero menace |
| `vlad` | **Conte Vlad**, polite vampire | **preset** | `ryan` (fallback `aiden`) | the brief is *formal adult male* — a preset nails it, costs no design pass, and keeps one timbre across languages |
| `scarecrow` | **Spaventapasseri**, goofy straw-brain | **designed ×2 langs** | `dos-scarecrow-it`, `dos-scarecrow-en` | rusty/hollow straw texture; fallback `uncle_fu` if the design pass is skipped (accepts an accent) |

Cost: **12 designed clones** (audition 3 takes each → 12 saved references) + 1 preset
rendered twice. The `--instruct` descriptions for each design pass are in §5.2.

> **Bottega scope note.** Spec §11 gives the shop copy to T16 and `lines.ts`'s header says
> it "extends this table when it lands". When those lines ship, they are **Strega's** voice
> — reuse `dos-strega-<lang>` rather than minting a new one, plus the two boys' greetings.

## 5. Design (clone) passes

`generate_lines.py` has no `--instruct` flag — it renders a **preset** or a **saved clone**.
So all `instruct` text enters through `game_voice/design_voice.py --description`, once per
voice, and the chosen take becomes the reference the lines render against. That is why the
design step is per language: an Italian reference speaking English lines sounds Italian.

All commands run from `/Users/ionutale/developer-playground/qwen3-tts-mlx-studio`
(never from the game repo), and save into the studio's Library `voices/`.

```bash
cd /Users/ionutale/developer-playground/qwen3-tts-mlx-studio
PY=.venv/bin/python
```

### 5.1 Template (one voice)

```bash
# 1) audition 3 takes with the instruct text (see §5.2)
$PY game_voice/design_voice.py --takes 3 --language Italian \
    --description "<instruct from §5.2>" --text "<sample from §5.3>" \
    --outdir outputs/auditions/dos-kids-it
# 2) listen; save the winning take as the Library voice the lines will use
$PY game_voice/design_voice.py --save-as dos-kids-it --language Italian \
    --description "<same instruct>" --text "<same sample>" \
    --from outputs/auditions/dos-kids-it/take-2.wav
```

The `--text` transcript is stored as the clone's `ref_text`, so it **must be exactly what
the take says** — pass the same string to both commands. §5.3's samples already quote real
`lines.ts` lines (`node voice/lines.mjs samples` reprints them and warns on drift).

A ready-made shortcut for the IT nonna: `voices/nonna-b` is an auditioned Italian nonna
("cozy Italian nonna, soft, slightly husky, slow and loving"). Rendering `it.nonna.json`
with `--voice nonna-b` is legitimate if timbre parity with EN is not wanted; for parity,
design `dos-nonna-it` + `dos-nonna-en` from the *same* description.

### 5.2 Instruct text per voice (`--description`)

| voice | instruct (IT pass) |
|---|---|
| `dos-kids-*` | Two Italian brothers, about six and four years old, shouting "Dolcetto o scherzetto!" together on a doorstep on Halloween night — bright, excited, slightly breathless children's voices, the younger one a touch higher and just behind the beat. Warm and playful, never screechy. |
| `dos-ghost-*` | A soft, airy, hollow little ghost boy — a friendly sheet ghost with a wispy, slightly echoing, half-whispered voice. Light and floaty, playful and never frightening, with a gentle "boooo" wobble and a smile at the end. |
| `dos-nonna-*` | A warm, slightly older grandmotherly female, a cozy Italian nonna with a soft, slightly husky voice, speaking slowly and lovingly to very small children — tender, patient, full of affection. |
| `dos-strega-*` | A cheerful old witch with cackling warmth: a creaky, delighted female voice that laughs mid-sentence ("ehehe"), theatrical and mischievous, genuinely fond of the children she teases. Warm in the chest, slightly raspy, always on the edge of a giggle. |
| `dos-wolf-*` | A big friendly werewolf puppy: a deep but plush male voice with a soft growl and dog noises ("arf"), eager and a little bashful — more golden retriever than monster, warm, never menacing. |
| `dos-scarecrow-*` | A goofy talking scarecrow with straw for brains: a rusty, creaky, cheerful male voice, slightly nasal and hollow, with a dry straw texture and a surprised beat — friendly and silly. |

For the EN passes (`dos-*-en`) use **the same description written in English**, ending
with `speaking English`. The Italian-language direction lives in the sample text, which is
already the character's own lines.
For `vlad` (preset) there is no design pass. If a design is preferred later:
`A courteous, formal gentleman vampire: an unhurried, velvety male voice with precise
diction and old-fashioned politeness, quietly amused, never scary.`

### 5.3 Design samples (`--text`) — 5–10 s, the character in its own words

Quoted from `lines.ts` (printed by `node voice/lines.mjs samples`):

| voice | IT sample | EN sample |
|---|---|---|
| `kids` | Dolcetto o scherzetto! Dolcetto o scherzetto! Ehi, siamo noi! Abbiamo le lanterne accese, veniamo a bussare a tutte le porte! | Trick or treat! Trick or treat! Hey, it’s us! Our lanterns are lit and we’re knocking on every door on the street! |
| `ghost` | Buuu! Chi va là?... Ah, siete voi! Dolcetti per voi... buuu! Ooooh... ho finito i dolcetti! | Boo! Who goes there?.. Oh, it’s you! Candy for you... boo! Oooh... I ran out of candy! |
| `nonna` | Oh, che bei bimbi! Che carini! Ecco i dolcetti! Stasera niente caramelle, mi dispiace! | Oh, what sweet boys! How cute! Here’s some candy! No candy tonight, sorry! |
| `strega` | Ehehe, chi c’è alla porta? Prendete, piccoli maghi! Il mio calderone è vuoto stasera! Ehehe! Bei maghetti! Tutto per voi! | Ehehe, who’s at my door? Take some, little wizards! My cauldron is empty tonight! Ehehe! What little wizards! All yours! |
| `wolf` | Arf! Amici pelosi in visita! Tieni, tieni! Arf arf! Ho già dato tutto, arf... peccato! | Woof! Furry friends at the door! Here, take some! Woof woof! All out, woof... sorry! |
| `vlad` | Buonasera, piccoli ospiti! Con piacere, prendete i dolcetti. Mille scuse: la dispensa è vuota. | Good evening, little guests! With pleasure — do take some. A thousand pardons: the pantry is bare. |
| `scarecrow` | Oh! Qualcuno mi ha parlato! Dolcetti freschi di paglia! Ops! Ho la zucca di paglia, stasera! | Oh! Someone talked to me! Candy fresh out of the straw! Oops! My straw brain is empty! |

(`strega`/IT above is the tricky one — always copy the string from
`node voice/lines.mjs samples`, which is byte-equal to `lines.ts`.)

## 6. Render commands (exact) — 14 runs, 74 clips

`G` is the game repo; `--out` is the **per-language** directory (spec §11 + plan's
`static/voice/<lang>/*` + per-language manifest). Run from the studio repo.

```bash
cd /Users/ionutale/developer-playground/qwen3-tts-mlx-studio
PY=.venv/bin/python
G=/Users/ionutale/developer-playground/dolcetto-o-scherzetto

# ---- Italian ---------------------------------------------------------------
$PY game_voice/generate_lines.py --lines $G/voice/render/it.kids.json       --voice dos-kids-it       --out $G/static/voice/it --format mp3 --bitrate 96
$PY game_voice/generate_lines.py --lines $G/voice/render/it.ghost.json      --voice dos-ghost-it      --out $G/static/voice/it --format mp3 --bitrate 96
$PY game_voice/generate_lines.py --lines $G/voice/render/it.nonna.json      --voice dos-nonna-it      --out $G/static/voice/it --format mp3 --bitrate 96
$PY game_voice/generate_lines.py --lines $G/voice/render/it.strega.json     --voice dos-strega-it     --out $G/static/voice/it --format mp3 --bitrate 96
$PY game_voice/generate_lines.py --lines $G/voice/render/it.wolf.json       --voice dos-wolf-it       --out $G/static/voice/it --format mp3 --bitrate 96
$PY game_voice/generate_lines.py --lines $G/voice/render/it.vlad.json       --speaker ryan --language Italian --out $G/static/voice/it --format mp3 --bitrate 96
$PY game_voice/generate_lines.py --lines $G/voice/render/it.scarecrow.json  --voice dos-scarecrow-it  --out $G/static/voice/it --format mp3 --bitrate 96

# ---- English ---------------------------------------------------------------
$PY game_voice/generate_lines.py --lines $G/voice/render/en.kids.json       --voice dos-kids-en       --out $G/static/voice/en --format mp3 --bitrate 96
$PY game_voice/generate_lines.py --lines $G/voice/render/en.ghost.json      --voice dos-ghost-en      --out $G/static/voice/en --format mp3 --bitrate 96
$PY game_voice/generate_lines.py --lines $G/voice/render/en.nonna.json      --voice dos-nonna-en      --out $G/static/voice/en --format mp3 --bitrate 96
$PY game_voice/generate_lines.py --lines $G/voice/render/en.strega.json     --voice dos-strega-en     --out $G/static/voice/en --format mp3 --bitrate 96
$PY game_voice/generate_lines.py --lines $G/voice/render/en.wolf.json       --voice dos-wolf-en       --out $G/static/voice/en --format mp3 --bitrate 96
$PY game_voice/generate_lines.py --lines $G/voice/render/en.vlad.json       --speaker ryan --language English  --out $G/static/voice/en --format mp3 --bitrate 96
$PY game_voice/generate_lines.py --lines $G/voice/render/en.scarecrow.json  --voice dos-scarecrow-en  --out $G/static/voice/en --format mp3 --bitrate 96
```

Defaults kept as shipped: `--format mp3 --bitrate 96`, `--batch-size 4`, `--retries 2`,
`--model-size 1.7B`, `--quant 8bit`; `--voices-dir` defaults to the studio's `voices/`.
Add `--model-size 0.6B` only for a cheap smoke pass, never for the shipped assets.

### 6.1 Manifests

Each run rewrites `<out>/manifest.json` with **only its own rows**, so after the seven
runs the file describes 6 clips. Two options:

* **Keep the per-run evidence** (recommended): after each run, copy the partial manifest
  aside as `voice/manifests/<lang>.<speaker>.json` — the audition/QA trail the T28 row asks
  for.
* **Write the complete manifest** — one command per language, using the studio's own
  helpers (this is the manifest `voice.ts` should read):

```bash
$PY -c "import json,sys; sys.path.insert(0,'game_voice'); import generate_lines as g; \
out='$G/static/voice/it'; rows=g.build_manifest(g.load_lines('$G/voice/lines.it.json'), out, duration_fn=g.media_duration); \
open(out+'/manifest.json','w').write(json.dumps(rows, indent=2)+'\n'); print(len(rows),'rows')"
$PY -c "import json,sys; sys.path.insert(0,'game_voice'); import generate_lines as g; \
out='$G/static/voice/en'; rows=g.build_manifest(g.load_lines('$G/voice/lines.en.json'), out, duration_fn=g.media_duration); \
open(out+'/manifest.json','w').write(json.dumps(rows, indent=2)+'\n'); print(len(rows),'rows')"
```

### 6.2 Expected outputs

| path | count | notes |
|---|---|---|
| `static/voice/it/<id>.mp3` | 37 | ids per §3 (mono 96 kbps, loudness-normalized, silence-trimmed by `export_audio`) |
| `static/voice/en/<id>.mp3` | 37 | same ids, English audio |
| `static/voice/it/manifest.json` | 37 rows | `{id, text, bytes, duration, sha256}`; `text` byte-equal to `lines.ts` |
| `static/voice/en/manifest.json` | 37 rows | ditto |
| `voice/manifests/<lang>.<speaker>.json` | 14× | optional per-run evidence |
| studio `voices/dos-*-{it,en}/` | 12 | designed clone references (`profile.json` + `reference.wav`) |
| studio `outputs/auditions/dos-*-{it,en}/take-{1..3}.wav` | 36 | audition takes |

**Total shipped audio: 74 MP3s.** Re-running any command is safe: `_complete()` skips any
clip with bytes on disk, so a resumed run renders only what is missing
(`[lines] N clips total, M to render`).

## 7. Validation

```bash
cd /Users/ionutale/developer-playground/dolcetto-o-scherzetto
node voice/lines.mjs check      # every JSON parses + byte-equality vs lines.ts + counts
node voice/lines.mjs samples    # reprints the §5.3 design samples, warns if they drift
```

`check` asserts, per language: 37 lines; ids unique and dot-free; no duplicate **texts**
within a render file (the script keys its batch results by text — a duplicate would
collapse two clips into one); each per-speaker file partitions `lines.<lang>.json`; and it
samples 12 lines per language whose exact UTF-8 bytes must be found in **both** `lines.ts`
and the emitted JSON, alongside the parsed-string comparison for every line.

Cross-check with the real consumer (no GPU, no model load):

```bash
cd /Users/ionutale/developer-playground/qwen3-tts-mlx-studio
.venv/bin/python -c "import glob,sys; sys.path.insert(0,'game_voice'); import generate_lines as g; \
G='/Users/ionutale/developer-playground/dolcetto-o-scherzetto/voice'; \
print(sum(len(g.load_lines(f)) for f in glob.glob(G+'/lines.*.json')+glob.glob(G+'/render/*.json')))"
```

## 8. Risks / open items

* **Preset accents.** `ryan`/`aiden` are the only English-speaker presets; if `ryan` carries
  an accent on the Italian `vlad` lines, either accept it (he is a *Count* — a slightly
  foreign timbre reads as character) or design `dos-vlad-it` with §5.2's vampire brief.
* **Child voices.** Voice-design can drift adult; if the `kids` audition never lands
  child-like, fall back to a preset + a fixed pitch/formant lift applied **outside** this
  pipeline (a post-pass on the 2 shout clips only), and record the deviation here.
* **Byte-equality is a copy lock.** Any future edit to `lines.ts` invalidates clips; re-run
  `node voice/lines.mjs extract && check` and re-render only the changed ids (resume
  handles it). Add `check` to CI as the T28 completeness gate.
* **T15/T16 copy.** `scherzo` is included (T15 shipped it); Bottega/shop copy is **not** —
  when it lands, extend the Strega render file (§1 budget becomes 37 + shop lines).
