#!/usr/bin/env python3
"""T29 — flux2 stills: title hero (+OG crop), Bottega banner, facade-spike pairs.

Run:  cd /Users/ionutale/developer-playground/flux2-klein-mlx-studio
      .venv/bin/python /Users/ionutale/developer-playground/dolcetto-o-scherzetto/tools/gen-art.py

Outputs:
  <game>/.scratch/art/*.png          masters (the accepted takes stay on disk)
  <game>/static/art/hero.v1.webp     the title key-art band (1152 wide)
  <game>/static/art/og.v1.webp       1200x630 OG crop of the hero
  <game>/static/art/bottega.v1.webp  640px Bottega banner

The style string is the ART-STYLE.md §3/§4 contract in prompt form. FLUX.2-klein
is distilled: 4 steps at guidance 1.0 is the design point (config.py). Seeds are
whatever the studio history records — the rendered masters ARE the artifact; a
re-run may differ, so re-view and re-accept if that happens.
"""
import os
import sys
import tempfile
from pathlib import Path

from PIL import Image

STUDIO = Path('/Users/ionutale/developer-playground/flux2-klein-mlx-studio')
sys.path.insert(0, str(STUDIO))

from engine import ImageEngine  # noqa: E402
from generation import build_request, run_request  # noqa: E402
from history import GenerationHistory  # noqa: E402
from state import AppContext, AppSettings  # noqa: E402

G = Path('/Users/ionutale/developer-playground/dolcetto-o-scherzetto')
SCRATCH = G / '.scratch' / 'art'
STATIC = G / 'static' / 'art'

STYLE = (
    'flat storybook illustration with soft rounded shapes and gentle shading, '
    'no hard black outlines, muted indigo night palette (#241d45 sky, #3a2c5f shadows, #59406b warmth), '
    'warm amber #ffd166 lamp and window light, pastel candy accents (#ff9ec7, #ffb347, #7fd7ff), '
    'cozy children\u2019s picture-book mood, friendly spooky, no text, no watermark.'
)

HERO = (
    'A wide cozy Halloween night street scene: two small brothers in costume on the sidewalk \u2014 '
    'an older boy in a long indigo wizard robe with a big floppy pointed hat holding a tiny wooden wand, '
    'and a little round pumpkin-costume toddler carrying a jack-o\u2019-lantern bucket \u2014 '
    'standing in front of a friendly two-story house with warm glowing windows and a small porch, '
    'big soft cream moon, tiny stars, one amber street lamp, rounded pumpkins by a low fence. ' + STYLE
)

HERO2 = HERO.replace(
    'standing in front of a friendly two-story house with warm glowing windows and a small porch,',
    'walking hand in hand down the sidewalk past cozy houses,',
)

BOTTEGA = (
    'A friendly old witch\u2019s little market stall at night: a cheerful old witch with lavender hair, '
    'sage-green skin and a dark pointed hat stands behind a wooden counter with glass jars of glowing '
    'pastel candy, small hanging lanterns, a striped awning and little stars, centered composition. ' + STYLE
)

FACADE_A = (
    'Front view of a single cozy storybook house facade: two floors, gabled roof with a soft green trim, '
    'a rounded front door, four warm glowing windows, small pumpkins at the doorstep, centered, filling '
    'most of the frame, on a perfectly flat plain solid background of uniform color #6b5785, no sky, '
    'no ground shadow, no other objects. ' + STYLE
)

FACADE_B = (
    'Front view of a single cozy storybook tower house facade: a round tower with a dark pointed roof, '
    'arched door and glowing round windows, centered, filling most of the frame, on a perfectly flat '
    'plain solid background of uniform color #6b5785, no sky, no ground shadow, no other objects. ' + STYLE
)

JOBS = [
    ('hero', HERO, '16:9'),
    ('hero2', HERO2, '16:9'),
    ('bottega', BOTTEGA, '1:1'),
    ('facade-maisonette', FACADE_A, '1:1'),
    ('facade-tower', FACADE_B, '1:1'),
]


def export(img: Image.Image, name: str, width: int, q: int) -> None:
    STATIC.mkdir(parents=True, exist_ok=True)
    m = img
    if m.width != width:
        m = m.resize((width, round(m.height * width / m.width)), Image.LANCZOS)
    m.save(STATIC / name, 'WEBP', quality=q, method=6)
    print('saved', STATIC / name, m.size, flush=True)


def main() -> None:
    SCRATCH.mkdir(parents=True, exist_ok=True)
    engine = ImageEngine()
    engine.quantization = os.environ.get('QUANT', '8bit')
    with tempfile.TemporaryDirectory() as tmp:
        ctx = AppContext(
            engine=engine,
            history=GenerationHistory(str(Path(tmp) / 'h')),
            settings=AppSettings(
                output_dir=str(Path(tmp) / 'out'), steps=4, live_preview=False, timeout=1800
            ),
        )
        for name, prompt, aspect in JOBS:
            req = build_request(prompt, aspect, count=1)
            results = run_request(ctx, req, on_event=lambda e: None)
            img = results[0].image
            img.save(SCRATCH / f'{name}.png')
            print('render OK', name, img.size, flush=True)

    hero = Image.open(SCRATCH / 'hero.png')
    export(hero, 'hero.v1.webp', 1152, 80)
    og = hero.crop((0, 31, 1344, 31 + 705)).resize((1200, 630), Image.LANCZOS)
    og.save(STATIC / 'og.v1.webp', 'WEBP', quality=80, method=6)
    print('saved', STATIC / 'og.v1.webp', og.size, flush=True)
    export(Image.open(SCRATCH / 'bottega.png'), 'bottega.v1.webp', 640, 80)
    print('ALL DONE', flush=True)


if __name__ == '__main__':
    main()
