/**
 * The player's Music/SFX gains (T17) — one deeply-reactive runes store that
 * the title menu's two sliders write and the audio engine (T23/T25/T27) reads.
 *
 * Port of the prototype's `vols` object (`prototypes/scene-prototype.html`,
 * ~877-912): the same two independent 0..1 gains, the same "clamp on the way
 * in" repair and the same "corrupted value → defaults" fallback — but the
 * prototype persisted a private `{ music, sfx }` blob under `dos.proto.settings`
 * while here the pair is a first-class part of the device's settings envelope
 * (`dos.settings.v1`, spec §13: `{ lang, sound, musicVolume, sfxVolume }`). So
 * there is exactly one settings key on the device, `lang`/`sound` keep their
 * own meanings, and this module never invents a second.
 *
 * **No audio here.** Nothing in this file touches an `AudioContext`, an
 * `<audio>` element or a gain node — it is the *state* seam the audio tasks
 * consume, exactly as `bubble.svelte.ts` is the state seam the knock chain
 * consumes. T23 (ambience), T25 (music) and T27 (SFX) read `volumes()` in their
 * own frames and scale their `MUSIC_MAX` / SFX ceilings by it.
 *
 * **Why the settings envelope and not its own key.** The volumes belong to the
 * *device*, not the run: a preference like "quieter music" holds across a fresh
 * run and a restored one alike, which is the same argument `settings.ts` makes
 * for `lang`/`sound` (they are preferences, `persist.ts` mirrors the run). One
 * key also means the hidden parent reset clears a single slot, not two.
 *
 * **Never throws, never goes non-finite.** `settings.read()` already refuses a
 * corrupt payload back to the defaults and clamps out-of-band volumes, so
 * `load()` inherits that repair; `setMusic`/`setSfx` additionally ignore a
 * non-finite argument (a `NaN` from a hostile caller would otherwise poison
 * every gain downstream). Writes ride `settings.write`, which is silent on a
 * full quota and on hostile private modes — the preference then applies for the
 * session and simply does not survive the reload.
 */
import { settings } from '../persist/settings';
import type { SettingsStore } from '../persist/settings';

/** The two independent gains the sliders own, each a linear 0..1 scalar. */
export interface Volumes {
	/** Music + ambience-bed gain; `1` is the owner-authored mix (spec §13). */
	music: number;
	/** Synth SFX gain; `1` is the authored peak. */
	sfx: number;
}

/** Clamp a slider value into the 0..1 band the gains live in. */
function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

/** The gains a settings store currently holds, repaired into 0..1. */
function fromSettings(store: SettingsStore): Volumes {
	const stored = store.read();
	return { music: clamp01(stored.musicVolume), sfx: clamp01(stored.sfxVolume) };
}

/**
 * The live pair, deeply reactive. Initialised from the real settings singleton
 * at import (in SSR/private mode that singleton answers with the defaults, so
 * this is `{ music: 1, sfx: 1 }` there too).
 */
let state = $state<Volumes>(fromSettings(settings));

/**
 * The current gains — the read seam. A component reads `volumes().music` in a
 * template to track the slider live; an audio frame reads it once per tick.
 */
export function volumes(): Volumes {
	return state;
}

/**
 * Re-reads both gains from the settings store. Called at boot (after a
 * hydration that could not run the import-time read) or after any external
 * write to the envelope. Clamps, and falls back to the defaults through
 * `settings.read()` when the stored payload is unusable.
 */
export function load(store: SettingsStore = settings): void {
	state = fromSettings(store);
}

/**
 * Writes both gains back through the settings envelope, preserving `lang` and
 * `sound`: the current stored preferences are read and re-written with only the
 * volume pair replaced, so an unrelated write can never clobber them.
 */
export function save(store: SettingsStore = settings): void {
	const stored = store.read();
	store.write({ ...stored, musicVolume: state.music, sfxVolume: state.sfx });
}

/**
 * The Music slider. A non-finite argument is ignored (the gains must stay
 * representable); a finite one is clamped into 0..1, applied and persisted.
 */
export function setMusic(value: number, store: SettingsStore = settings): void {
	if (!Number.isFinite(value)) return;
	state = { ...state, music: clamp01(value) };
	save(store);
}

/** The SFX slider, exactly as {@link setMusic} but for the `sfx` gain. */
export function setSfx(value: number, store: SettingsStore = settings): void {
	if (!Number.isFinite(value)) return;
	state = { ...state, sfx: clamp01(value) };
	save(store);
}
