/*!
 * ============================================================================
 *  Dolcetto o Scherzetto — SYNTH SFX PACK (v1, prototype)
 *  Classic script: no modules, no build, no dependencies, no audio files.
 *  Everything is synthesized live with WebAudio. Runs from file://.
 *
 *  USAGE
 *    <script src="sfx.js"></script>
 *    SFX.init();                 // call from a user gesture (lazily makes the AudioContext)
 *    SFX.play('coin');           // NEVER throws; unknown name or no WebAudio -> silent no-op
 *    SFX.setEnabled(false);      // global mute  (SFX.enabled reads back the same flag)
 *    SFX.setVolume(0.5);         // 0..1 level applied to the master gain (combined with the mute)
 *
 *  CONTRACT (ART-STYLE.md §4.7 "no volume spikes", §8 durations, §9 shows, §10 ceiling)
 *    - cartoonish, cozy, moderate: peak gains sit at 0.05–0.18, most cues 0.1–0.9 s
 *      (three deliberate long tails: scare:wolf 1.2 s howl, scare:thunder 1.8 s roll,
 *       scare:vampire 2.0 s organ sting)
 *    - oscillators + gain envelopes only; a short-lived noise buffer is used
 *      sparingly for rustle / whoosh (stepLeaf, passer, ragnetto, fantasmino, mano)
 *    - every cue routed through one master gain, so setEnabled() cuts live sound too
 *    - nothing is harsh, nothing is a drone, nothing is aimed at the player
 *
 *  API
 *    SFX.init()            -> boolean  (creates AudioContext + tries to resume it)
 *    SFX.play(name)        -> boolean  (true if a cue was scheduled)
 *    SFX.setEnabled(bool)  -> boolean
 *    SFX.enabled           get/set accessor over the same mute flag
 *    SFX.cueGroups         { ui:[…], theatre:[…], scares:[…] }  (read-only listing)
 * ============================================================================
 */
(function () {
  'use strict';

  var ctx = null;      // AudioContext, created lazily
  var master = null;   // single master gain (the mute gate), created lazily too
  var enabled = true;
  var volume = 1;      // 0..1 master level (menu slider), combined with the mute

  /* ------------------------------------------------------------------ *
   * infrastructure — every helper swallows its own errors
   * ------------------------------------------------------------------ */

  // Lazily create the AudioContext. Safe to call any number of times.
  function ac() {
    if (ctx) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch (e) { ctx = null; }
    return ctx;
  }

  // Browsers start contexts suspended until a gesture; resume() returns a
  // promise, so the rejection must be .catch()ed explicitly (try/catch would
  // NOT see it and Chrome would log an unhandled rejection).
  function resume(a) {
    try {
      if (a.state === 'suspended') {
        var p = a.resume();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
    } catch (e) {}
  }

  // Everything hangs off one master gain, so mute can cut a playing cue too.
  function sink(a) {
    try {
      if (!master) {
        var m = a.createGain();
        m.gain.value = enabled ? volume : 0;
        m.connect(a.destination);
        master = m;
      }
      return master;
    } catch (e) { return a.destination; }
  }

  // One enveloped oscillator.
  //   tone(a, f1, f2, dur, { type, vol, attack, at, cutoff, cutoff2, q, points, lfo, lfo2, env })
  //     f1/f2  start / end Hz (exponential glide)      — pass f2 = null for a held note
  //     points [[hz, offsetSeconds], …] multi-segment glide (overrides f2)
  //     vol    peak gain (0.05–0.18 in this pack)      attack  seconds to the peak
  //     at     delay from "now"                       dur     seconds to full silence
  //     cutoff/cutoff2 lowpass Hz (optional sweep)    q      lowpass resonance
  //     lfo    { rate, depth } vibrato on the pitch   lfo2   depth at the end (decays)
  //     env    [[gain, offsetSeconds], …] ABSOLUTE gain contour (linear ramps) — overrides
  //            the default percussive shape and ignores vol/attack; lets a cue swell into a
  //            peak or do attack / hold / release
  function tone(a, f1, f2, dur, o) {
    o = o || {};
    try {
      if (!(dur > 0)) dur = 0.05;
      var t = a.currentTime + (o.at || 0);
      var vol = o.vol == null ? 0.1 : Math.max(0.0002, o.vol);
      var atk = o.attack == null ? 0.012 : Math.min(o.attack, dur * 0.4);

      var osc = a.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(Math.max(1, f1), t);
      if (o.points) {
        for (var i = 0; i < o.points.length; i++)
          osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.points[i][0]), t + o.points[i][1]);
      } else if (f2 != null && f2 !== f1) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
      }

      var g = a.createGain();
      if (o.env) {                                   // explicit contour: swell / hold / release
        g.gain.setValueAtTime(Math.max(0, o.env[0][0]), t + o.env[0][1]);
        for (var k = 1; k < o.env.length; k++)
          g.gain.linearRampToValueAtTime(Math.max(0, o.env[k][0]), t + o.env[k][1]);
      } else {                                       // percussive envelope: up fast, down slow
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + atk);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      }

      var out = g;
      if (o.cutoff) {                              // optional lowpass = "hollow / mellow" knob
        var flt = a.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(Math.max(40, o.cutoff), t);
        if (o.cutoff2) flt.frequency.exponentialRampToValueAtTime(Math.max(40, o.cutoff2), t + dur);
        if (o.q) flt.Q.value = o.q;
        g.connect(flt); out = flt;
      }

      if (o.lfo) {                                 // vibrato / wobble, added to the pitch
        var lo = a.createOscillator();
        lo.type = 'sine';
        lo.frequency.setValueAtTime(o.lfo.rate, t);
        var lg = a.createGain();
        lg.gain.setValueAtTime(o.lfo.depth, t);
        if (o.lfo2) lg.gain.exponentialRampToValueAtTime(Math.max(0.0001, o.lfo2), t + dur);
        lo.connect(lg); lg.connect(osc.frequency);
        lo.start(t); lo.stop(t + dur + 0.05);
      }

      osc.connect(g);
      out.connect(sink(a));
      osc.start(t);
      osc.stop(t + dur + 0.05);
    } catch (e) {}
  }

  // One enveloped, filtered burst of white noise from a throwaway buffer.
  //   noise(a, dur, { type:'bandpass'|'highpass'|'lowpass', f, f2, q, vol, attack, at })
  function noise(a, dur, o) {
    o = o || {};
    try {
      if (!(dur > 0)) dur = 0.05;
      var t = a.currentTime + (o.at || 0);
      var vol = o.vol == null ? 0.06 : Math.max(0.0002, o.vol);
      var len = Math.max(1, Math.floor(a.sampleRate * dur));
      var buf = a.createBuffer(1, len, a.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      var src = a.createBufferSource();
      src.buffer = buf;
      var g = a.createGain();
      var atk = Math.min(o.attack == null ? dur * 0.35 : o.attack, dur * 0.6);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      var out = g;
      if (o.type) {
        var f = a.createBiquadFilter();
        f.type = o.type;
        f.frequency.setValueAtTime(Math.max(40, o.f || 1000), t);
        if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.f2), t + dur);
        f.Q.value = o.q == null ? 0.9 : o.q;
        g.connect(f); out = f;
      }

      src.connect(g);
      out.connect(sink(a));
      src.start(t);
      src.stop(t + dur + 0.03);
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ *
   * the cues — one design-intent comment above each (audio taste lives there)
   * ------------------------------------------------------------------ */

  var CUES = {

    /* ------------------------------ UI / foley ------------------------------ */

    // knock — intent: a REAL warm wooden knock on a front door (§8 "knock = 3 thuds") — chunky,
    //   firm and friendly, never a beep and never alarming. Each hit stacks three layers:
    //     wood    bandpassed noise 430→300 Hz, Q 1.2, 55 ms, attack 3 ms, gain .070
    //     thump   sine 85→60 Hz body, 80 ms, attack 4 ms, gain .090
    //     click   bandpassed noise burst at 3 kHz, 4 ms, attack 1 ms, gain .018
    //   hits at 0 / 0.16 / 0.32 s (third at 0.78 level) + a quieter 0.365 s echo (0.36 level)
    //   as a tiny room tail. Layered worst-case sum stays ≤ .178.
    'knock': function (a) {
      var hits = [[0, 1], [0.16, 0.94], [0.32, 0.78], [0.365, 0.36]];
      for (var i = 0; i < hits.length; i++) {
        var at = hits[i][0], v = hits[i][1];
        noise(a, 0.055, { type: 'bandpass', f: 430, f2: 300, q: 1.2, vol: 0.070 * v, attack: 0.003, at: at });
        tone(a, 85, 60, 0.080, { vol: 0.090 * v, attack: 0.004, at: at });
        noise(a, 0.004, { type: 'bandpass', f: 3000, q: 0.8, vol: 0.018 * v, attack: 0.001, at: at });
      }
    },

    // pop — intent: UI bubble/panel popping open — snappy like the 0.22 s bubbles in §8.
    //   sine 430→980 Hz up-chirp, 0.09 s, attack 4 ms, peak gain .13.
    'pop': function (a) {
      tone(a, 430, 980, 0.09, { vol: 0.13, attack: 0.004 });
    },

    // coin — intent: candy collected — warm two-step bell, instantly readable as "reward".
    //   triangle 1047→1319 Hz (0.07 s) then 1568 Hz held 0.14 s, attack 6–8 ms, peak gain .10.
    'coin': function (a) {
      tone(a, 1047, 1319, 0.07, { type: 'triangle', vol: 0.10, attack: 0.006 });
      tone(a, 1568, null, 0.14, { type: 'triangle', vol: 0.10, attack: 0.008, at: 0.07 });
    },

    // twinkle — intent: a candy settles into the pile with a soft sparkle (§6 "twinkle on landing").
    //   sine bells 1568 / 1976 / 2637 Hz, 0.2–0.24 s each, 0.06 s stagger, attack 20 ms,
    //   peak gains .07 / .06 / .05 — glitters, never pierces.
    'twinkle': function (a) {
      tone(a, 1568, null, 0.24, { vol: 0.07, attack: 0.02 });
      tone(a, 1976, null, 0.22, { vol: 0.06, attack: 0.02, at: 0.06 });
      tone(a, 2637, null, 0.20, { vol: 0.05, attack: 0.02, at: 0.12 });
    },

    // refuse — intent: "no candy tonight" — a shrug, not a buzzer; disappointment without sting.
    //   sine 349→233 Hz (F4→B3) glide down, 0.22 s, attack 10 ms, peak gain .08.
    'refuse': function (a) {
      tone(a, 349, 233, 0.22, { vol: 0.08, attack: 0.01 });
    },

    // seen — intent: playful "we've met already!" wiggle — friendly recognition, no scolding.
    //   sine 587→704 Hz (0.07 s) then 831→623 Hz (0.1 s), attack 6 ms, peak gains .09 / .08.
    'seen': function (a) {
      tone(a, 587, 704, 0.07, { vol: 0.09, attack: 0.006 });
      tone(a, 831, 623, 0.10, { vol: 0.08, attack: 0.006, at: 0.07 });
    },

    // buy — intent: two-note purchase fanfare in the Bottega — small, cheerful, done in a breath.
    //   triangle 659 Hz (0.1 s) then 880 Hz (0.16 s), 0.11 s apart, attack 8–10 ms, peak gain .11.
    'buy': function (a) {
      tone(a, 659, null, 0.10, { type: 'triangle', vol: 0.11, attack: 0.008 });
      tone(a, 880, null, 0.16, { type: 'triangle', vol: 0.11, attack: 0.01, at: 0.11 });
    },

    // giggle — intent: a very cute kid giggle (hug-giggle beat, §10) — six quick chirps that
    //   ALTERNATE contour (up / down / up …) so it bubbles instead of marching, with tiny
    //   breathy sprinkles between them and a bright snort-ish blip to finish. ~0.58 s.
    //   chirps: sine 0.055 s each at 0/.09/.17/.26/.34/.42 s, bases 700/780/720/830/760/880 Hz,
    //     odd chirps rise ×1.25, even chirps fall ×0.80, attack 5 ms, peak gain .085
    //   sprinkles: highpassed noise 2 kHz, 0.02 s, gain .02 at 0.05 / 0.21 / 0.38 s
    //   snort: triangle 900→600 Hz, 0.06 s, gain .075, plus a 1.6 kHz noise tick, at 0.50 s
    'giggle': function (a) {
      var at = [0, 0.09, 0.17, 0.26, 0.34, 0.42];
      var f = [700, 780, 720, 830, 760, 880];
      for (var i = 0; i < at.length; i++)
        tone(a, f[i], f[i] * (i % 2 ? 0.80 : 1.25), 0.055, { vol: 0.085, attack: 0.005, at: at[i] });
      var sp = [0.05, 0.21, 0.38];
      for (var j = 0; j < sp.length; j++)
        noise(a, 0.02, { type: 'highpass', f: 2000, vol: 0.02, attack: 0.004, at: sp[j] });
      tone(a, 900, 600, 0.06, { vol: 0.075, attack: 0.004, at: 0.50 });
      noise(a, 0.025, { type: 'bandpass', f: 1600, q: 1.4, vol: 0.02, attack: 0.003, at: 0.50 });
    },

    // passer — intent: the rare far-lane car drifting past with a doppler-ish dip — ambience,
    //   never a hazard (§7). Longest cue in the pack at 0.9 s, and quiet.
    //   bandpassed noise swell 0.9 s, filter 1500→450 Hz glide, Q .9, peak gain .06,
    //   plus a faint sine 180→138 Hz engine hum (lowpass 500 Hz, gain .025).
    'passer': function (a) {
      noise(a, 0.9, { type: 'bandpass', f: 1500, f2: 450, q: 0.9, vol: 0.06, attack: 0.40 });
      tone(a, 180, 138, 0.9, { vol: 0.025, attack: 0.35, cutoff: 500 });
    },

    // stepLeaf — intent: soft dry crunch for walking on leaf drifts — rustle, never a snap.
    //   highpass noise burst 0.14 s @ 3200 Hz (attack 6 ms, gain .05) plus a smaller
    //   second scrape 0.1 s @ 4800 Hz (gain .035) 0.04 s later, for texture.
    'stepLeaf': function (a) {
      noise(a, 0.14, { type: 'highpass', f: 3200, vol: 0.05, attack: 0.006 });
      noise(a, 0.10, { type: 'highpass', f: 4800, vol: 0.035, attack: 0.006, at: 0.04 });
    },

    /* --------------------- theatre: setup / 8 tricks / laugh ---------------- */

    // theatre-setup — intent: curtain-up shimmer as the spotlight dims and the props scale up
    //   (§8 show is ~2.4 s staged). Invites "watch this!", no anticipation sting.
    //   sine bells 1047 / 1319 / 1568 Hz, 0.3 s each, 0.07 s stagger, attack 20 ms,
    //   peak gains .065 / .055 / .05.
    'theatre-setup': function (a) {
      tone(a, 1047, null, 0.30, { vol: 0.065, attack: 0.02 });
      tone(a, 1319, null, 0.30, { vol: 0.055, attack: 0.02, at: 0.07 });
      tone(a, 1568, null, 0.30, { vol: 0.050, attack: 0.02, at: 0.14 });
    },

    // fire:boo — intent: the ghost's proper hollow "boooo" for the ghost-face trick — a voice
    //   with character, spooky-cute, never a roar or a beep. ~0.65 s.
    //   two slightly detuned voices (triangle 330→210 Hz and +1.4 % partner 334.6→212.9 Hz)
    //   through ONE lowpass that sweeps down 1400→580 Hz as the pitch dips, so the sound closes
    //   in on itself like a real "boo". 7 Hz vibrato (±18 decaying to ±8).
    //   "b" transient: 12 ms bandpassed noise thump at 300 Hz, gain .0525, right at the onset.
    //   LEVEL: owner-requested ~50 % louder than the pass-#2 build — every gain below is the
    //   original ×1.5 (.085→.1275, .045→.0675, .035→.0525, and the quieter contour points
    //   .06→.09, .03→.045, .02→.03, .008→.012). Measured peak 0.108→0.162, inside the
    //   0.18 pack ceiling (verified from silence in isolation).
    'fire:boo': function (a) {
      var contour = [[298, 0.06], [232, 0.35], [210, 0.65]];
      var env = [[0.03, 0], [0.1275, 0.09], [0.09, 0.40], [0.0001, 0.65]];
      noise(a, 0.012, { type: 'bandpass', f: 300, q: 1.6, vol: 0.0525, attack: 0.002 });
      tone(a, 330, null, 0.65, {
        type: 'triangle', env: env, cutoff: 1400, cutoff2: 580,
        points: contour, lfo: { rate: 7, depth: 18 }, lfo2: 8
      });
      tone(a, 334.6, null, 0.65, {
        type: 'triangle', cutoff: 1400, cutoff2: 580,
        env: [[0.012, 0], [0.0675, 0.09], [0.045, 0.40], [0.0001, 0.65]],
        points: [[302, 0.06], [235, 0.35], [212.9, 0.65]], lfo: { rate: 7, depth: 20 }, lfo2: 9
      });
    },

    // fire:ragnetto — intent: the rubber spider's tiny ticks and skitter as it lowers onto the
    //   doorknob and dances (§9) — light and busy, never clicky-harsh.
    //   six square ticks 2600–3400 Hz, 0.025 s each, irregular 0.045–0.075 s spacing,
    //   lowpass 3500 Hz, peak gain .045 + a faint bandpassed-noise skitter (0.2 s, gain .03).
    'fire:ragnetto': function (a) {
      var at = [0, 0.045, 0.11, 0.16, 0.235, 0.31];
      var fq = [3200, 2600, 3400, 2900, 3300, 2700];
      for (var i = 0; i < at.length; i++)
        tone(a, fq[i], null, 0.025, { type: 'square', vol: 0.045, attack: 0.003, cutoff: 3500, at: at[i] });
      noise(a, 0.20, { type: 'bandpass', f: 3000, q: 1.2, vol: 0.03, attack: 0.05 });
    },

    // fire:serpente — intent: the spring snake boing — pitch JUMPS UP out of the can, then the
    //   wobble settles (§9). Peak energy on the way up reads "surprise!", not "alarm".
    //   triangle 190→900 Hz in 0.12 s, then 900→420→300 Hz fall over 0.48 s with a 13 Hz
    //   vibrato (±90 decaying to ±20), lowpass 2.6 kHz, peak gain .13.
    'fire:serpente': function (a) {
      tone(a, 190, null, 0.48, {
        type: 'triangle', vol: 0.13, attack: 0.006, cutoff: 2600,
        points: [[900, 0.12], [420, 0.30], [300, 0.48]],
        lfo: { rate: 13, depth: 90 }, lfo2: 20
      });
    },

    // fire:cuscino — intent: the noisy pillow's "prrrt" raspberry from under the mat (§9) —
    //   FUNNY, not gross: a buzzy saw body that visibly sputters, then a tiny embarrassed
    //   squeak as it runs out of air. ~0.55 s.
    //   body: sawtooth 95→70 Hz over 0.42 s, lowpass 650 Hz, 24 Hz wobble (±42)
    //   sputter gate: `env` carves 5 rapid gain dips into the body at 0.055 / 0.12 / 0.185 /
    //     0.25 / 0.315 s (peak .10, dipping to .012–.03) — the cushion "putt-putt-ing"
    //   squeak: triangle 900→1500 Hz, 0.11 s, gain .075, lowpass 2.5 kHz, at 0.44 s
    'fire:cuscino': function (a) {
      tone(a, 95, null, 0.42, {
        type: 'sawtooth', cutoff: 650, points: [[70, 0.42]],
        lfo: { rate: 24, depth: 42 },
        env: [
          [0.015, 0], [0.10, 0.014], [0.030, 0.055], [0.10, 0.078], [0.025, 0.12],
          [0.095, 0.145], [0.020, 0.185], [0.085, 0.210], [0.015, 0.250],
          [0.070, 0.275], [0.012, 0.315], [0.050, 0.340], [0.0001, 0.420]
        ]
      });
      tone(a, 900, 1500, 0.11, { type: 'triangle', vol: 0.075, attack: 0.008, cutoff: 2500, at: 0.44 });
    },

    // fire:maschera — intent: jump-scare-LITE mask sting — a soft blare that startles gently and
    //   resolves instantly. Deliberately moderate: no volume spike, no sharp edge (§4.7 / §10).
    //   square dyad 210→196 Hz + 280→262 Hz struck together, 0.35 s, attack 15 ms,
    //   lowpass 900 Hz, peak gains .092 / .073 (measured worst case .17 after the
    //   lowpass's slight resonant bump — kept under the 0.18 ceiling).
    'fire:maschera': function (a) {
      tone(a, 210, 196, 0.35, { type: 'square', vol: 0.092, attack: 0.015, cutoff: 900 });
      tone(a, 280, 262, 0.35, { type: 'square', vol: 0.073, attack: 0.015, cutoff: 900 });
    },

    // fire:topolino — intent: the wind-up mouse zipping across the floor (§9) — zippy toy energy.
    //   five triangle squeaks alternating 1250 / 1650 Hz, each a 0.05 s up-chirp (×1.3),
    //   0.07 s apart, lowpass 3 kHz, peak gain .06 — kept rounded, never shrill.
    'fire:topolino': function (a) {
      for (var i = 0; i < 5; i++) {
        var f = (i % 2) ? 1650 : 1250;
        tone(a, f, f * 1.3, 0.05, { type: 'triangle', vol: 0.06, attack: 0.005, cutoff: 3000, at: i * 0.07 });
      }
    },

    // fire:fantasmino — intent: the puppet ghost's airy whistle as it rises out of the bucket and
    //   bows (§9) — breathy and friendly, ends soft.
    //   sine 760→1150→820 Hz glide over 0.7 s with 5.5 Hz vibrato (±20), peak gain .07,
    //   plus a breath of bandpassed noise (0.6 s, 900→1400 Hz, gain .02).
    'fire:fantasmino': function (a) {
      tone(a, 760, null, 0.70, {
        vol: 0.07, attack: 0.05, points: [[1150, 0.35], [820, 0.70]], lfo: { rate: 5.5, depth: 20 }
      });
      noise(a, 0.60, { type: 'bandpass', f: 900, f2: 1400, q: 1.4, vol: 0.02, attack: 0.2 });
    },

    // fire:mano — intent: the fuller furry-hand gag (§9) — slide out, TWO cheeky waves, a clap
    //   and a friendly "boop", finishing on a sparkle. The gag, not the grab. ~0.9 s.
    //   whoosh: bandpassed noise slide 400→1600 Hz over 0.3 s, gain .055, attack .12
    //   boings ×2: triangle 300→520→380 Hz bounce (0.18 s) with a 13 Hz wobble (±26 decaying),
    //     gain .09 at t=0.22 s and .075 at t=0.40 s — the hand waving twice
    //   slap: 40 ms bandpassed noise at 900 Hz, gain .05, at 0.58 s
    //   boop: sine 660→990 Hz, 0.13 s, gain .085, at 0.62 s
    //   sparkle: sine bells 1568 / 2093 Hz, 0.18 / 0.15 s, gains .045 / .032, at 0.76 / 0.82 s
    'fire:mano': function (a) {
      noise(a, 0.30, { type: 'bandpass', f: 400, f2: 1600, q: 1.1, vol: 0.055, attack: 0.12 });
      var bounce = [[520, 0.06], [380, 0.16]];
      tone(a, 300, null, 0.18, {
        type: 'triangle', vol: 0.09, attack: 0.006, cutoff: 2600, at: 0.22,
        points: bounce, lfo: { rate: 13, depth: 26 }, lfo2: 8
      });
      tone(a, 300, null, 0.18, {
        type: 'triangle', vol: 0.075, attack: 0.006, cutoff: 2600, at: 0.40,
        points: bounce, lfo: { rate: 13, depth: 26 }, lfo2: 8
      });
      noise(a, 0.040, { type: 'bandpass', f: 900, q: 1.2, vol: 0.05, attack: 0.003, at: 0.58 });
      tone(a, 660, 990, 0.13, { vol: 0.085, attack: 0.008, at: 0.62 });
      tone(a, 1568, null, 0.18, { vol: 0.045, attack: 0.012, at: 0.76 });
      tone(a, 2093, null, 0.15, { vol: 0.032, attack: 0.012, at: 0.82 });
    },

    // theatre-laugh — intent: a warm little AUDIENCE chuckle after the gag (§9), not a row of
    //   beeps — two layers going "huh-huh-huh": a low soft "huh" and a higher giggle on top,
    //   both arcing slightly then fading DOWN so the room calms. ~0.8 s.
    //   7 pulses at 0/.115/.225/.335/.44/.545/.645 s, each 0.085 s, pitch arching up then
    //   dipping (×1.10 → ×0.82), lowpassed 1.8 kHz, with a gentle 9 Hz wobble (±14).
    //   low "huh": sine, bases 265→215 Hz falling across the laugh, gains .060 fading to .028
    //   high giggle: triangle, bases 700→560 Hz, gains .048 fading to .022
    //   stacked peak ≤ .108.
    'theatre-laugh': function (a) {
      var at = [0, 0.115, 0.225, 0.335, 0.44, 0.545, 0.645];
      var lo = [265, 258, 250, 242, 234, 224, 215];
      var hi = [700, 682, 662, 640, 618, 590, 560];
      for (var i = 0; i < at.length; i++) {
        var fade = 1 - i * 0.10;
        tone(a, lo[i], null, 0.085, {
          vol: 0.060 * fade, attack: 0.010, cutoff: 1800, at: at[i],
          points: [[lo[i] * 1.10, 0.03], [lo[i] * 0.82, 0.085]], lfo: { rate: 9, depth: 14 }
        });
        tone(a, hi[i], null, 0.085, {
          type: 'triangle', vol: 0.048 * fade, attack: 0.008, cutoff: 1800, at: at[i],
          points: [[hi[i] * 1.10, 0.03], [hi[i] * 0.82, 0.085]], lfo: { rate: 9, depth: 18 }
        });
      }
    },

    /* ------------------------------- scares (§10) --------------------------- */

    // scare:witch — intent: an EVIL cartoon witch laugh in two rounds — literally "hahaha
    //   hahaha", delightfully mean so a 7-year-old grins instead of flinching (§10). ~1.30 s.
    //   phrase 1: five staccato "ha" pulses at 0/.11/.22/.33/.44 s, bases DESCENDING
    //     760→740→720→700→680 Hz; each "ha" is a FAST high→low bend (×0.68 in the first
    //     28 ms, settling ×0.62) — the classic cackle scoop
    //   120 ms of silence between rounds, then phrase 2: four staccato "ha" at
    //     .64/.74/.84/.94 s (bases 735→720→705→690 Hz, same bend, slightly quicker spacing)
    //   finale: a HELD "haaah" from 1.06 s — pitch RISING 680→840 Hz then FALLING to 545 Hz
    //     over 0.24 s, with an 8 Hz vibrato (±26 decaying to ±10); attack 35 ms, hold, release
    //   body: sawtooth main + a faint TRIANGLE layer detuned +9 cents for chorus-y
    //     wickedness, both through a 2.2 kHz lowpass so it stays rounded, never harsh
    //   per-pulse envelope (`env`): 30 ms attack, quick decay to silence by 80 ms
    //   gains: main .110 + layer .035 = nominal stack .145 (held uses the same pair)
    'scare:witch': function (a) {
      var at = [0, 0.11, 0.22, 0.33, 0.44, 0.64, 0.74, 0.84, 0.94];
      var fq = [760, 740, 720, 700, 680, 735, 720, 705, 690];
      var det = Math.pow(2, 9 / 1200);           // +9 cents — the faint chorus layer
      for (var i = 0; i < at.length; i++) {
        var f = fq[i], fd = f * det;
        tone(a, f, null, 0.08, {
          type: 'sawtooth', cutoff: 2200, at: at[i],
          points: [[f * 0.68, 0.028], [f * 0.62, 0.080]],
          env: [[0, 0], [0.110, 0.030], [0.050, 0.058], [0.0001, 0.080]]
        });
        tone(a, fd, null, 0.08, {
          type: 'triangle', cutoff: 2200, at: at[i],
          points: [[fd * 0.68, 0.028], [fd * 0.62, 0.080]],
          env: [[0, 0], [0.035, 0.030], [0.016, 0.058], [0.0001, 0.080]]
        });
      }
      // the held "haaah" — rises then falls, with a 7–9 Hz vibrato on top
      tone(a, 680, null, 0.24, {
        type: 'sawtooth', cutoff: 2200, at: 1.06,
        points: [[840, 0.10], [545, 0.24]],
        lfo: { rate: 8, depth: 26 }, lfo2: 10,
        env: [[0, 0], [0.110, 0.035], [0.110, 0.145], [0.055, 0.200], [0.0001, 0.240]]
      });
      tone(a, 680 * det, null, 0.24, {
        type: 'triangle', cutoff: 2200, at: 1.06,
        points: [[840 * det, 0.10], [545 * det, 0.24]],
        lfo: { rate: 8, depth: 27 }, lfo2: 11,
        env: [[0, 0], [0.035, 0.035], [0.035, 0.145], [0.017, 0.200], [0.0001, 0.240]]
      });
    },

    // scare:wolf — intent: a real cartoon howl across the yard — a friendly dog, not a beast (§10).
    //   Three-part contour ooo–ooo–WAAA on a triangle body: 220→300→480→260 Hz over 1.2 s, with a
    //   5 Hz vibrato (±12) and an amplitude SWELL into the WAAA at t=0.75 s, then a decaying tail.
    //   Lowpass 1.6 kHz so it reads distant and gentle.
    //   breath: bandpassed noise onset 80 ms, 300→900 Hz, gain .03 — the intake before the howl
    //   partner: detuned sine (+7 cents) at 0.3× level, lowpass 1.4 kHz — faint chorus, no beating
    //   total 1.2 s, worst-case stacked peak .115 + .035 = .15
    'scare:wolf': function (a) {
      noise(a, 0.08, { type: 'bandpass', f: 300, f2: 900, q: 1.0, vol: 0.03, attack: 0.03 });
      var env = [[0.01, 0], [0.055, 0.30], [0.115, 0.75], [0.045, 1.00], [0.0001, 1.20]];
      tone(a, 220, null, 1.20, {
        type: 'triangle', env: env, cutoff: 1600,
        points: [[300, 0.35], [480, 0.75], [260, 1.20]], lfo: { rate: 5, depth: 12 }
      });
      tone(a, 221.5, null, 1.20, {
        type: 'sine', env: [[0.003, 0], [0.017, 0.30], [0.035, 0.75], [0.013, 1.00], [0.0001, 1.20]],
        cutoff: 1400, points: [[302, 0.35], [483, 0.75], [262, 1.20]], lfo: { rate: 5, depth: 10 }
      });
    },

    // scare:vampire — intent: polite Conte Vlad's mellow pipe-organ sting — a solemn curtsy,
    //   round and slightly grand, zero shriek (§10 ceiling). One held chord, no trill.
    //   four stacked partials 98 (tri) + 147 (sq) + 196 (tri) + 294 (sq) Hz, each slightly
    //   detuned (98.4 / 146.5 / 196.6 / 293.3) for a soft organ chorus, all lowpassed 900 Hz,
    //   plus a very quiet 60.5 Hz sine sub. Envelope: 40 ms attack → hold to 1.24 s →
    //   long 0.8 s release, total ~2.0 s. Gains .062 + .042 + .036 + .024 (+.014 sub) = .178.
    'scare:vampire': function (a) {
      var partials = [
        [98.4, 'triangle', 0.062], [146.5, 'square', 0.042],
        [196.6, 'triangle', 0.036], [293.3, 'square', 0.024]
      ];
      for (var i = 0; i < partials.length; i++) {
        var p = partials[i];
        tone(a, p[0], null, 2.0, {
          type: p[1], cutoff: 900,
          env: [[0, 0], [p[2], 0.04], [p[2], 1.24], [0, 2.0]]
        });
      }
      tone(a, 60.5, null, 2.0, { type: 'sine', cutoff: 200, env: [[0, 0], [0.014, 0.04], [0.014, 1.24], [0, 2.0]] });
    },

    // scare:skeleton — intent: a nervous bone-rattle cameo (§10) — the skeleton shivers itself
    //   awake, then gives a little settling shiver. Woody and busy, never clattery-loud. ~0.6 s.
    //   11 short bandpassed-noise tick bursts (wood-y, 750–1150 Hz, Q 2, 20 ms, attack 2 ms)
    //   in an irregular shivering rhythm 0/.035/.07/.095/.14/.175/.21/.26/.30/.335/.39 s,
    //   gains .065–.095 (loudest mid-rattle), each with a faint 190 Hz triangle knock under it
    //   (gain .025) so it reads BONE not static. NOTE: filtered-noise peaks are stochastic —
    //   measured peak wanders ~.03–.10 per play; worst case ≤ .12.
    //   shiver tail: bandpassed noise 0.16 s at 700 Hz with a 22 Hz wobble, gain .04, at 0.42 s
    'scare:skeleton': function (a) {
      var at = [0, 0.035, 0.07, 0.095, 0.14, 0.175, 0.21, 0.26, 0.30, 0.335, 0.39];
      var fq = [820, 1050, 900, 1150, 860, 1000, 780, 1080, 940, 1120, 880];
      var lv = [0.065, 0.081, 0.072, 0.095, 0.076, 0.088, 0.068, 0.091, 0.078, 0.086, 0.065];
      for (var i = 0; i < at.length; i++) {
        noise(a, 0.020, { type: 'bandpass', f: fq[i], q: 2.0, vol: lv[i], attack: 0.002, at: at[i] });
        tone(a, 190, null, 0.035, { type: 'triangle', vol: 0.025, attack: 0.002, cutoff: 900, at: at[i] });
      }
      noise(a, 0.16, { type: 'bandpass', f: 700, q: 1.1, vol: 0.04, attack: 0.02, at: 0.42 });
      tone(a, 165, 140, 0.14, { type: 'triangle', vol: 0.022, attack: 0.01, cutoff: 700, at: 0.42 });
    },

    // scare:mummy — intent: a soft muffled moan cameo (§10) — bandaged, drowsy, a bit comic;
    //   gentle and slightly bored rather than spooky. ~0.9 s.
    //   low triangle 180→145 Hz through a HEAVY 400 Hz lowpass, slow 4.5 Hz vibrato (±9),
    //   amplitude swelling in and out via `env` (peak .075 at 0.35 s, decaying to 0 at 0.9 s)
    //   plus a quieter 2× partial (360→290 Hz, gain .022) for a little nasal voice
    //   breath bed: lowpassed noise 0.9 s, 900→500 Hz, gain .03, attack .25 — the wrappings sigh
    'scare:mummy': function (a) {
      noise(a, 0.9, { type: 'lowpass', f: 900, f2: 500, vol: 0.03, attack: 0.25 });
      tone(a, 180, 145, 0.9, {
        type: 'triangle', cutoff: 400, lfo: { rate: 4.5, depth: 9 },
        env: [[0.012, 0], [0.075, 0.35], [0.05, 0.62], [0.0001, 0.90]]
      });
      tone(a, 360, 290, 0.9, {
        type: 'triangle', cutoff: 500, lfo: { rate: 4.5, depth: 16 },
        env: [[0.004, 0], [0.022, 0.35], [0.015, 0.62], [0.0001, 0.90]]
      });
    },

    // scare:thunder — intent: the storm cameo that accompanies a single soft lightning flash
    //   (§10) — distant and rounded, the kind of thunder that makes you look up, never a jolt.
    //   ~1.8 s.
    //   crack: quiet bandpassed noise burst at 1200 Hz (Q 1.5, 0.12 s, attack 8 ms, gain .08)
    //     at t=0.02 s — soft and far away, plus a 500 Hz body at gain .045
    //   rumble: three overlapping lowpassed-noise swells (200→150 Hz) with SLOW attacks, at
    //     0.08 / 0.55 / 1.05 s, gains .15 / .10 / .06 — each quieter than the last, decaying
    //     out to ~1.6 s so it rolls away into the night
    //   mids: a matching three-swell layer an octave up (lowpass 400→300 Hz, gains .07/.045/.028)
    //     — a 200 Hz-only rumble is inaudible on laptop speakers, so the thunder needs a chest
    //   felt body: sine 60→48 Hz, gain .05, attack .30 — the rumble you feel, not hear
    'scare:thunder': function (a) {
      noise(a, 0.12, { type: 'bandpass', f: 1200, q: 1.5, vol: 0.08, attack: 0.008, at: 0.02 });
      noise(a, 0.20, { type: 'bandpass', f: 500, q: 1.2, vol: 0.045, attack: 0.012, at: 0.02 });
      noise(a, 0.90, { type: 'lowpass', f: 200, f2: 150, vol: 0.15, attack: 0.35, at: 0.08 });
      noise(a, 0.70, { type: 'lowpass', f: 190, f2: 145, vol: 0.10, attack: 0.25, at: 0.55 });
      noise(a, 0.50, { type: 'lowpass', f: 180, f2: 140, vol: 0.06, attack: 0.18, at: 1.05 });
      noise(a, 0.85, { type: 'lowpass', f: 400, f2: 300, vol: 0.07, attack: 0.32, at: 0.10 });
      noise(a, 0.65, { type: 'lowpass', f: 380, f2: 290, vol: 0.045, attack: 0.24, at: 0.57 });
      noise(a, 0.45, { type: 'lowpass', f: 360, f2: 280, vol: 0.028, attack: 0.16, at: 1.07 });
      tone(a, 60, 48, 1.5, { vol: 0.05, attack: 0.30, cutoff: 220 });
    }
  };

  /* grouped listing — the preview page builds its buttons straight from this */
  var GROUPS = {
    ui: ['knock', 'pop', 'coin', 'twinkle', 'refuse', 'seen', 'buy', 'giggle', 'passer', 'stepLeaf'],
    theatre: ['theatre-setup', 'fire:boo', 'fire:ragnetto', 'fire:serpente', 'fire:cuscino',
      'fire:maschera', 'fire:topolino', 'fire:fantasmino', 'fire:mano', 'theatre-laugh'],
    scares: ['scare:witch', 'scare:wolf', 'scare:vampire', 'scare:skeleton', 'scare:mummy', 'scare:thunder']
  };

  /* ------------------------------------------------------------------ *
   * public API
   * ------------------------------------------------------------------ */

  // Call from a user gesture. Idempotent; never throws.
  function init() {
    try {
      var a = ac();
      if (a) resume(a);
      return !!a;
    } catch (e) { return false; }
  }

  // Play a cue by name. Self-initializes if init() was never called.
  // Returns true only if a cue was actually scheduled. Never throws.
  function play(name) {
    try {
      if (!enabled) return false;
      var cue = CUES[name];
      if (!cue) return false;
      var a = ac();
      if (!a) return false;
      resume(a);
      cue(a);
      return true;
    } catch (e) { return false; }
  }

  function setEnabled(v) {
    enabled = !!v;
    try { if (master) master.gain.value = enabled ? volume : 0; } catch (e) {}
    if (!hasAccessor) SFX.enabled = enabled;   // pre-defineProperty fallback only
    return enabled;
  }

  // Set the 0..1 master level (menu slider). Never throws; clamps.
  function setVolume(v) {
    var n = Number(v);
    volume = isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
    try { if (master) master.gain.value = enabled ? volume : 0; } catch (e) {}
    return volume;
  }

  var SFX = {
    init: init,
    play: play,
    setEnabled: setEnabled,
    setVolume: setVolume,
    cueGroups: GROUPS
  };

  var hasAccessor = false;
  try {
    Object.defineProperty(SFX, 'enabled', {
      get: function () { return enabled; },
      set: function (v) { setEnabled(v); },
      enumerable: true,
      configurable: true
    });
    hasAccessor = true;
  } catch (e) { SFX.enabled = enabled; }

  window.SFX = SFX;
})();
