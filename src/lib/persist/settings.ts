/**
 * The player's settings in localStorage — the IT/EN language choice, the
 * sound toggle and (T17) the separate Music/SFX volume sliders
 * (spec §4/§6/§13: "IT default + EN toggle, settings persisted").
 *
 * Settings are **not run state**: `persist.ts` mirrors the run, while a
 * preference like "this child plays without sound" belongs on the device and
 * should hold in every context — fresh run or restored run alike. So this is
 * its own key (`dos.settings.v1`), read straight from storage.
 *
 * **Nothing here ever throws**, for the same reasons `persist.ts` gives:
 * Safari private mode throws on the very access, a full quota throws on write,
 * a half-written or hand-edited value throws on parse. Every one of those paths
 * degrades to defaults — `read()` returns `DEFAULT_SETTINGS` and `write()`
 * stays silent. A game that cannot remember its settings must still be
 * playable.
 *
 * Validation is minimal on purpose: version + the type of every field. A
 * future setting joins `Settings` as an optional field with a default at the
 * call site rather than a new key, so an envelope written before it existed
 * still loads — the one exception being **T17's volume pair**, which was added
 * as *required* fields on purpose: the sliders are a whole feature (spec §6/§13)
 * and a half-remembered volume is worse than the default. A pre-T17 envelope
 * without them is therefore refused as a whole and the device falls back to
 * defaults — there is no shipped player data to lose yet.
 *
 * **T17 (volumes):** `musicVolume` and `sfxVolume` are two independent 0..1
 * gains (the title menu's Music/SFX sliders). `read()` **clamps** any
 * in-range-violating finite number back into 0..1 (a hand-edited `"2"` in the
 * JSON becomes full volume rather than nuking every other preference);
 * missing, mistyped or non-finite values still refuse the whole payload, as
 * every other field does. The store itself (the runes-side `volumes` seam the
 * audio tasks consume) lives in `src/lib/audio/volumes.svelte.ts`.
 */

import { readLocalStorage } from './persist.js';

/** The one key settings own in localStorage, alongside `dos.run.v1`. */
export const SETTINGS_KEY = 'dos.settings.v1';

/** Bumped whenever `Settings` changes shape; older payloads are dropped. */
const SETTINGS_VERSION = 1;

/** The two languages the game ships in (spec §13; IT is the default). */
export type Lang = 'it' | 'en';

/**
 * The game's presentation rotation (T4b, revised 2026-10-24): how far the
 * stage is turned, in degrees clockwise. The player's button steps it 90° to
 * the LEFT on every press (0 → 270 → 180 → 90 → 0); the accelerometer never
 * decides the presentation.
 */
export type Rotation = 0 | 90 | 180 | 270;

/** Everything this game remembers about how it should behave. */
export interface Settings {
	version: 1;
	/** Voice + copy language. */
	lang: Lang;
	/** The master mute: false keeps the AudioContext out of the page. */
	sound: boolean;
	/** Music (ambience + street loop) gain, 0..1 — T17's Music slider (spec §6). */
	musicVolume: number;
	/** Synth SFX gain, 0..1 — T17's SFX slider (spec §6). */
	sfxVolume: number;
	/**
	 * The manual screen rotation (T4b) — OPTIONAL on purpose: an envelope
	 * without it (every build before 2026-10-19) loads fine and defaults to 0
	 * (this module's rule for new settings; no envelope bump, no reset). The
	 * first T4b build stored a two-state `flip`; `read()` maps its 'portrait'
	 * to 90° so an existing choice survives.
	 */
	rotation?: Rotation;
}

/**
 * First-run defaults: Italian voice, sound on, both volume sliders at full.
 * The 1.0 here is a *linear gain*, not a peak: the owner-tuned `MUSIC_MAX`
 * (0.143) and the SFX peak ceilings (≤0.18) scale with it in the audio
 * modules (T23/T25/T27), so "full" is as loud as the mix was authored.
 */
export const DEFAULT_SETTINGS: Settings = {
	version: 1,
	lang: 'it',
	sound: true,
	musicVolume: 1,
	sfxVolume: 1,
	rotation: 0
};

/**
 * Clamps a volume into the 0..1 band the sliders own. Values outside the band
 * are clamped rather than refused: a hand-edited `"musicVolume": 5` should cost
 * the player the edit, not their language and mute preferences.
 */
function clampVolume(volume: number): number {
	return Math.max(0, Math.min(1, volume));
}

/**
 * True for a v1 settings payload holding every setting, correctly typed.
 * Anything else — a future schema, a truncated write, a hand-edited value, a
 * pre-T17 envelope with no volume pair — is refused and the game falls back to
 * defaults instead of booting into a broken preference. Volumes must be
 * *finite* numbers (`1e999` parses to `Infinity` and a hand edit can hold
 * `NaN`, either of which would poison every gain downstream of a slider).
 */
export function isSettings(value: unknown): value is Settings {
	if (typeof value !== 'object' || value === null) return false;
	const settings = value as Partial<Settings>;
	if (settings.version !== SETTINGS_VERSION) return false;
	if (settings.lang !== 'it' && settings.lang !== 'en') return false;
	if (typeof settings.sound !== 'boolean') return false;
	if (typeof settings.musicVolume !== 'number' || !Number.isFinite(settings.musicVolume))
		return false;
	if (typeof settings.sfxVolume !== 'number' || !Number.isFinite(settings.sfxVolume)) return false;
	// `rotation` is optional (older envelopes lack it), but a present value must
	// be one of the four quarter turns. Unknown extra keys (the retired `flip`
	// of the first T4b build) are ignored, so those envelopes still load.
	return (
		settings.rotation === undefined ||
		settings.rotation === 0 ||
		settings.rotation === 90 ||
		settings.rotation === 180 ||
		settings.rotation === 270
	);
}

export interface SettingsStore {
	/** The stored settings, or the defaults when there is nothing usable. */
	read(): Settings;
	/** Writes the settings (last write wins). Never throws. */
	write(settings: Settings): void;
}

/**
 * Binds the store to a `Storage`. Pass `null` where there is none (SSR, or a
 * browser that refuses to expose localStorage) and both methods degrade to the
 * defaults.
 */
export function createSettings(storage: Storage | null): SettingsStore {
	/** The stored settings, parsed and shape-checked, or `null`. */
	function readStored(): Settings | null {
		if (!storage) return null;
		let raw: string | null;
		try {
			raw = storage.getItem(SETTINGS_KEY);
		} catch {
			// Private mode, blocked cookies, a revoked quota: no settings, no crash.
			return null;
		}
		if (raw === null) return null;
		try {
			const settings: unknown = JSON.parse(raw);
			return isSettings(settings) ? settings : null;
		} catch {
			// Truncated or hand-edited payload: treat as no settings at all.
			return null;
		}
	}

	return {
		read(): Settings {
			// A fresh copy, so a caller that mutates what it read cannot poison
			// the defaults for the rest of the session. The volume pair is
			// clamped on the way out (T17): an out-of-band finite value costs
			// the edit, not the whole payload.
			const stored = readStored();
			if (!stored) return { ...DEFAULT_SETTINGS };
			// T4b, revised 2026-10-24: `rotation` is the live field; the first
			// T4b build's two-state `flip` maps across ('portrait' was its 90°
			// clockwise quarter turn), and anything unusable reads as upright.
			const legacy = (stored as { flip?: unknown }).flip;
			const rotation: Rotation =
				stored.rotation === 90 || stored.rotation === 180 || stored.rotation === 270
					? stored.rotation
					: legacy === 'portrait'
						? 90
						: 0;
			return {
				...stored,
				musicVolume: clampVolume(stored.musicVolume),
				sfxVolume: clampVolume(stored.sfxVolume),
				rotation
			};
		},

		write(settings: Settings): void {
			if (!storage) return;
			try {
				storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
			} catch {
				// Quota exceeded or a serialisation refusal: the preference applies
				// for this session and simply does not survive the reload.
			}
		}
	};
}

/**
 * The store this page uses. `window.localStorage` is read once, defensively,
 * through `readLocalStorage()` — SSR and hostile privacy modes get a store
 * that always answers with the defaults.
 */
export const settings: SettingsStore = createSettings(readLocalStorage());
