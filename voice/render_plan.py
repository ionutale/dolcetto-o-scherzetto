#!/usr/bin/env python3
"""T28 render driver — designs the 12 voices, renders 74 clips, rebuilds the manifests.

Run from anywhere with the studio venv:
  /Users/ionutale/developer-playground/qwen3-tts-mlx-studio/.venv/bin/python voice/render_plan.py
Follows voice/VOICES.md exactly. Take-2 is picked deterministically for every design
(the owner auditions later and can re-render any single voice; every command is resumable).
"""
import os
import shutil
import subprocess
from pathlib import Path

ST = Path('/Users/ionutale/developer-playground/music-sfx-voice-studio')  # not used; keep clarity
STUDIO = Path('/Users/ionutale/developer-playground/qwen3-tts-mlx-studio')
PY = str(STUDIO / '.venv' / 'bin' / 'python')
G = Path('/Users/ionutale/developer-playground/dolcetto-o-scherzetto')

VOICES = ['kids', 'ghost', 'nonna', 'strega', 'wolf', 'scarecrow']

INSTR_IT = {
    'kids': "Two Italian brothers, about six and four years old, shouting \"Dolcetto o scherzetto!\" together on a doorstep on Halloween night — bright, excited, slightly breathless children's voices, the younger one a touch higher and just behind the beat. Warm and playful, never screechy.",
    'ghost': "A soft, airy, hollow little ghost boy — a friendly sheet ghost with a wispy, slightly echoing, half-whispered voice. Light and floaty, playful and never frightening, with a gentle \"boooo\" wobble and a smile at the end.",
    'nonna': "A warm, slightly older grandmotherly female, a cozy Italian nonna with a soft, slightly husky voice, speaking slowly and lovingly to very small children — tender, patient, full of affection.",
    'strega': "A cheerful old witch with cackling warmth: a creaky, delighted female voice that laughs mid-sentence (\"ehehe\"), theatrical and mischievous, genuinely fond of the children she teases. Warm in the chest, slightly raspy, always on the edge of a giggle.",
    'wolf': "A big friendly werewolf puppy: a deep but plush male voice with a soft growl and dog noises (\"arf\"), eager and a little bashful — more golden retriever than monster, warm, never menacing.",
    'scarecrow': "A goofy talking scarecrow with straw for brains: a rusty, creaky, cheerful male voice, slightly nasal and hollow, with a dry straw texture and a surprised beat — friendly and silly.",
}

INSTR_EN = {
    'kids': "Two brothers, about six and four years old, shouting \"Trick or treat!\" together on a doorstep on Halloween night — bright, excited, slightly breathless children's voices, the younger one a touch higher and just behind the beat. Warm and playful, never screechy. Speaking English.",
    'ghost': "A soft, airy, hollow little ghost boy — a friendly sheet ghost with a wispy, slightly echoing, half-whispered voice. Light and floaty, playful and never frightening, with a gentle \"boooo\" wobble and a smile at the end. Speaking English.",
    'nonna': "A warm, slightly older grandmotherly female with a soft, slightly husky voice, speaking slowly and lovingly to very small children — tender, patient, full of affection. Speaking English.",
    'strega': "A cheerful old witch with cackling warmth: a creaky, delighted female voice that laughs mid-sentence (\"ehehe\"), theatrical and mischievous, genuinely fond of the children she teases. Warm in the chest, slightly raspy, always on the edge of a giggle. Speaking English.",
    'wolf': "A big friendly werewolf puppy: a deep but plush male voice with a soft growl and dog noises (\"arf\"), eager and a little bashful — more golden retriever than monster, warm, never menacing. Speaking English.",
    'scarecrow': "A goofy talking scarecrow with straw for brains: a rusty, creaky, cheerful male voice, slightly nasal and hollow, with a dry straw texture and a surprised beat — friendly and silly. Speaking English.",
}

SAMPLE_IT = {
    'kids': "Dolcetto o scherzetto! Dolcetto o scherzetto! Ehi, siamo noi! Abbiamo le lanterne accese, veniamo a bussare a tutte le porte!",
    'ghost': "Buuu! Chi va là?... Ah, siete voi! Dolcetti per voi... buuu! Ooooh... ho finito i dolcetti!",
    'nonna': "Oh, che bei bimbi! Che carini! Ecco i dolcetti! Stasera niente caramelle, mi dispiace!",
    'strega': "Ehehe, chi c'è alla porta? Prendete, piccoli maghi! Il mio calderone è vuoto stasera! Ehehe! Bei maghetti! Tutto per voi!",
    'wolf': "Arf! Amici pelosi in visita! Tieni, tieni! Arf arf! Ho già dato tutto, arf... peccato!",
    'scarecrow': "Oh! Qualcuno mi ha parlato! Dolcetti freschi di paglia! Ops! Ho la zucca di paglia, stasera!",
}

SAMPLE_EN = {
    'kids': "Trick or treat! Trick or treat! Hey, it\u2019s us! Our lanterns are lit and we\u2019re knocking on every door on the street!",
    'ghost': "Boo! Who goes there?.. Oh, it\u2019s you! Candy for you... boo! Oooh... I ran out of candy!",
    'nonna': "Oh, what sweet boys! How cute! Here\u2019s some candy! No candy tonight, sorry!",
    'strega': "Ehehe, who\u2019s at my door? Take some, little wizards! My cauldron is empty tonight! Ehehe! What little wizards! All yours!",
    'wolf': "Woof! Furry friends at the door! Here, take some! Woof woof! All out, woof... sorry!",
    'scarecrow': "Oh! Someone talked to me! Candy fresh out of the straw! Oops! My straw brain is empty!",
}


def run(cmd):
    print('>>>', ' '.join(cmd), flush=True)
    r = subprocess.run(cmd)
    if r.returncode != 0:
        print('!!! FAILED', r.returncode, flush=True)
    return r.returncode


def design(lang_key, voice):
    name = f'dos-{voice}-{lang_key}'
    language = 'Italian' if lang_key == 'it' else 'English'
    desc = (INSTR_IT if lang_key == 'it' else INSTR_EN)[voice]
    text = (SAMPLE_IT if lang_key == 'it' else SAMPLE_EN)[voice]
    outdir = STUDIO / 'outputs' / 'auditions' / name
    if not (STUDIO / 'voices' / name).is_dir():
        if not (outdir / 'take-2.wav').is_file():
            run([PY, 'game_voice/design_voice.py', '--takes', '3', '--language', language,
                 '--description', desc, '--text', text, '--outdir', str(outdir)])
        take = outdir / 'take-2.wav'
        if not take.is_file():
            take = outdir / 'take-1.wav'
        if not take.is_file():
            print(f'!!! no take for {name}', flush=True)
            return
        run([PY, 'game_voice/design_voice.py', '--save-as', name, '--language', language,
             '--description', desc, '--text', text, '--from', str(take)])
    else:
        print(f'--- {name} already designed', flush=True)


def render(lang_key, speaker):
    out = G / 'static' / 'voice' / lang_key
    out.mkdir(parents=True, exist_ok=True)
    lines = G / 'voice' / 'render' / f'{lang_key}.{speaker}.json'
    cmd = [PY, 'game_voice/generate_lines.py', '--lines', str(lines),
           '--out', str(out), '--format', 'mp3', '--bitrate', '96']
    if speaker == 'vlad':
        cmd += ['--speaker', 'ryan', '--language', 'Italian' if lang_key == 'it' else 'English']
    else:
        cmd += ['--voice', f'dos-{speaker}-{lang_key}']
    run(cmd)
    # per-run evidence
    ev = G / 'voice' / 'manifests'
    ev.mkdir(parents=True, exist_ok=True)
    mf = out / 'manifest.json'
    if mf.is_file():
        shutil.copy(mf, ev / f'{lang_key}.{speaker}.json')


def rebuild_manifests():
    for lang_key in ('it', 'en'):
        out = G / 'static' / 'voice' / lang_key
        code = (
            "import json,sys; sys.path.insert(0,'game_voice'); import generate_lines as g; "
            f"out={str(out)!r}; rows=g.build_manifest(g.load_lines({str(G / 'voice' / ('lines.' + lang_key + '.json'))!r}), out, duration_fn=g.media_duration); "
            f"open(out+'/manifest.json','w').write(json.dumps(rows, indent=2)+'\\n'); print(len(rows),'rows')"
        )
        run([PY, '-c', code])


def main():
    os.chdir(STUDIO)
    print('=== designs', flush=True)
    for lang_key in ('it', 'en'):
        for voice in VOICES:
            design(lang_key, voice)
    print('=== renders', flush=True)
    for lang_key in ('it', 'en'):
        for speaker in VOICES + ['vlad']:
            render(lang_key, speaker)
    print('=== manifests', flush=True)
    rebuild_manifests()
    print('=== DRIVER DONE', flush=True)
    for lang_key in ('it', 'en'):
        d = G / 'static' / 'voice' / lang_key
        n = len(list(d.glob('*.mp3')))
        print(lang_key, n, 'clips', flush=True)


if __name__ == '__main__':
    main()
