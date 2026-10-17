/**
 * The player's settings in localStorage — the IT/EN language choice and the
 * sound toggle (spec §4/§13: "IT default + EN toggle, settings persisted").
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
 * still loads.
 */

import { readLocalStorage } from './persist.js';

/** The one key settings own in localStorage, alongside `dos.run.v1`. */
export const SETTINGS_KEY = 'dos.settings.v1';

/** Bumped whenever `Settings` changes shape; older payloads are dropped. */
const SETTINGS_VERSION = 1;

/** The two languages the game ships in (spec §13; IT is the default). */
export type Lang = 'it' | 'en';

/** Everything this game remembers about how it should behave. */
export interface Settings {
	version: 1;
	/** Voice + copy language. */
	lang: Lang;
	/** The master mute: false keeps the AudioContext out of the page. */
	sound: boolean;
}

/** First-run defaults: Italian voice, sound on. */
export const DEFAULT_SETTINGS: Settings = { version: 1, lang: 'it', sound: true };

/**
 * True for a v1 settings payload holding every setting, correctly typed.
 * Anything else — a future schema, a truncated write, a hand-edited value —
 * is refused and the game falls back to defaults instead of booting into a
 * broken preference.
 */
export function isSettings(value: unknown): value is Settings {
	if (typeof value !== 'object' || value === null) return false;
	const settings = value as Partial<Settings>;
	if (settings.version !== SETTINGS_VERSION) return false;
	if (settings.lang !== 'it' && settings.lang !== 'en') return false;
	return typeof settings.sound === 'boolean';
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
			// the defaults for the rest of the session.
			return readStored() ?? { ...DEFAULT_SETTINGS };
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
