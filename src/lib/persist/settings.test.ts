import { describe, expect, it } from 'vitest';
import type { Settings } from './settings';
import { DEFAULT_SETTINGS, SETTINGS_KEY, createSettings, isSettings } from './settings';

/**
 * Settings are a preference, not a save: the contract is still "never throws",
 * because the mute/language path is on the boot path and a hostile storage
 * must not turn a reload into a red screen. Every hostile storage here (a
 * throwing one, a corrupt payload, a foreign version) has to end in
 * "defaults": Italian voice, sound on, both volume sliders at full (spec §13).
 *
 * T17 rows add the volume pair: `musicVolume`/`sfxVolume` are finite numbers
 * that `read()` **clamps** into 0..1 — out-of-band is repaired, missing or
 * mistyped still refuses the whole payload like every other field.
 */

/** A minimal in-memory `Storage`, which is all the store touches. */
function memoryStorage(seed: Record<string, string> = {}): Storage {
	const map = new Map(Object.entries(seed));
	return {
		get length() {
			return map.size;
		},
		key: (i: number) => [...map.keys()][i] ?? null,
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, v),
		removeItem: (k: string) => void map.delete(k),
		clear: () => map.clear()
	} as Storage;
}

/** Safari private mode: the very access throws, on every method. */
function throwingStorage(): Storage {
	const boom = (): never => {
		throw new DOMException('QuotaExceededError');
	};
	return {
		get length(): number {
			return boom();
		},
		key: boom,
		getItem: boom,
		setItem: boom,
		removeItem: boom,
		clear: boom
	} as unknown as Storage;
}

/** Storage that reads fine but refuses every write: the full-quota case. */
function quotaFullStorage(storage: Storage): Storage {
	return {
		get length(): number {
			return storage.length;
		},
		key: storage.key,
		getItem: storage.getItem,
		setItem: (): void => {
			throw new DOMException('QuotaExceededError');
		},
		removeItem: storage.removeItem,
		clear: storage.clear
	} as Storage;
}

/** Writes a payload straight into the key, bypassing the store. */
function poison(storage: Storage, raw: string): void {
	storage.setItem(SETTINGS_KEY, raw);
}

/** A full settings payload; each row tweaks only what it is about. */
function settingsWith(overrides: Partial<Settings> = {}): Settings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

describe('defaults', () => {
	it('is Italian voice with sound on and both sliders at full (spec: IT default)', () => {
		expect(DEFAULT_SETTINGS).toEqual({
			version: 1,
			lang: 'it',
			sound: true,
			musicVolume: 1,
			sfxVolume: 1
		});
	});

	it('read() answers with the defaults when storage is empty', () => {
		expect(createSettings(memoryStorage()).read()).toEqual(DEFAULT_SETTINGS);
	});

	it('read() hands back a fresh copy, so a mutating caller cannot poison the defaults', () => {
		const store = createSettings(null);

		store.read().lang = 'en';

		expect(store.read().lang).toBe('it');
	});
});

describe('round-trip', () => {
	it('remembers the language toggle', () => {
		const storage = memoryStorage();
		const store = createSettings(storage);

		store.write(settingsWith({ lang: 'en' }));

		expect(store.read()).toEqual(settingsWith({ lang: 'en' }));
	});

	it('remembers the sound toggle, including muting', () => {
		const store = createSettings(memoryStorage());

		store.write(settingsWith({ sound: false }));

		expect(store.read().sound).toBe(false);
	});

	it('remembers both volume sliders (T17)', () => {
		const store = createSettings(memoryStorage());

		store.write(settingsWith({ musicVolume: 0.35, sfxVolume: 0.8 }));

		expect(store.read().musicVolume).toBe(0.35);
		expect(store.read().sfxVolume).toBe(0.8);
	});

	it('writes under the one versioned key', () => {
		const storage = memoryStorage();
		const written: Settings = settingsWith({ lang: 'en', sound: false });
		createSettings(storage).write(written);

		expect(JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null')).toEqual(written);
	});

	it('last write wins', () => {
		const store = createSettings(memoryStorage());
		store.write(settingsWith({ lang: 'en', sound: true }));
		store.write(settingsWith({ lang: 'it', sound: false }));

		expect(store.read()).toEqual(settingsWith({ lang: 'it', sound: false }));
	});
});

describe('volume boundaries (T17): clamp out-of-band, refuse mistyped', () => {
	it('clamps each volume into 0..1 on read', () => {
		const storage = memoryStorage();
		const store = createSettings(storage);
		for (const [musicVolume, sfxVolume] of [
			[5, 0.5],
			[0.5, 1e6],
			[-2, -0.0001],
			[1.0001, 0]
		] as const) {
			poison(storage, JSON.stringify(settingsWith({ musicVolume, sfxVolume })));
			expect(store.read().musicVolume).toBe(Math.max(0, Math.min(1, musicVolume)));
			expect(store.read().sfxVolume).toBe(Math.max(0, Math.min(1, sfxVolume)));
		}
	});

	it('keeps the exact band edges 0 and 1 untouched', () => {
		const storage = memoryStorage();
		poison(storage, JSON.stringify(settingsWith({ musicVolume: 0, sfxVolume: 1 })));

		expect(createSettings(storage).read()).toEqual(settingsWith({ musicVolume: 0, sfxVolume: 1 }));
	});

	it('repairs the volumes without touching the other preferences', () => {
		const storage = memoryStorage();
		poison(storage, JSON.stringify(settingsWith({ lang: 'en', sound: false, musicVolume: 9 })));

		expect(createSettings(storage).read()).toEqual(
			settingsWith({ lang: 'en', sound: false, musicVolume: 1, sfxVolume: 1 })
		);
	});

	it('refuses a missing or mistyped volume with the rest of the payload', () => {
		const storage = memoryStorage();
		const store = createSettings(storage);
		// Hostile payloads are deliberately mistyped, so they are built as
		// `unknown` rather than through the typed `settingsWith` helper.
		const hostile: unknown[] = [
			{ version: 1, lang: 'it', sound: true }, // the pre-T17 envelope
			{ ...DEFAULT_SETTINGS, musicVolume: undefined },
			{ ...DEFAULT_SETTINGS, sfxVolume: undefined },
			{ ...DEFAULT_SETTINGS, musicVolume: 'loud' },
			{ ...DEFAULT_SETTINGS, sfxVolume: true },
			{ ...DEFAULT_SETTINGS, musicVolume: Number.NaN },
			{ ...DEFAULT_SETTINGS, sfxVolume: Infinity },
			{ ...DEFAULT_SETTINGS, musicVolume: -Infinity }
		];
		for (const state of hostile) {
			poison(storage, JSON.stringify(state));
			expect(store.read()).toEqual(DEFAULT_SETTINGS);
		}
	});
});

describe('read falls back to defaults on anything unusable', () => {
	it('returns the defaults for a truncated or hand-edited payload', () => {
		const storage = memoryStorage();
		const store = createSettings(storage);
		for (const raw of ['{', 'not json at all', '', '[1,2,3]', 'null']) {
			poison(storage, raw);
			expect(store.read()).toEqual(DEFAULT_SETTINGS);
		}
	});

	it('returns the defaults for another schema version', () => {
		const storage = memoryStorage();
		poison(storage, JSON.stringify({ version: 2, lang: 'en', sound: false }));

		expect(createSettings(storage).read()).toEqual(DEFAULT_SETTINGS);
	});

	it('returns the defaults when a field is missing or mistyped', () => {
		const storage = memoryStorage();
		const store = createSettings(storage);
		for (const state of [
			{}, // no fields at all
			{ version: 1 }, // only the version
			{ version: 1, lang: 'en' }, // sound missing
			{ version: 1, sound: true }, // lang missing
			{ version: 1, lang: 'fr', sound: true }, // a language we do not ship
			{ version: 1, lang: 'it', sound: 'yes' }, // sound as text
			{ version: 1, lang: 'it', sound: 1 },
			{ version: '1', lang: 'it', sound: true } // version as text
		]) {
			poison(storage, JSON.stringify(state));
			expect(store.read()).toEqual(DEFAULT_SETTINGS);
		}
	});

	it('recovers from a corrupted payload: defaults now, clean save after (Review Focus #4)', () => {
		const storage = memoryStorage();
		const store = createSettings(storage);
		poison(storage, '{"version":1,"lang":"e'); // a half-written save

		expect(store.read()).toEqual(DEFAULT_SETTINGS);

		const repaired = settingsWith({ lang: 'en', sound: true, musicVolume: 0.4 });
		store.write(repaired);

		expect(store.read()).toEqual(repaired);
	});

	it('accepts exactly the settings it writes', () => {
		expect(isSettings(settingsWith())).toBe(true);
		expect(isSettings(settingsWith({ lang: 'en', sound: false }))).toBe(true);
		expect(isSettings(settingsWith({ musicVolume: 0, sfxVolume: 0.5 }))).toBe(true);
		expect(isSettings(settingsWith({ musicVolume: 5 }))).toBe(true); // out-of-band: clamped, not refused
		expect(isSettings({ ...settingsWith(), lang: 'fr' })).toBe(false);
		expect(isSettings({ ...settingsWith(), version: 2 })).toBe(false);
		expect(isSettings({ version: 1, lang: 'it', sound: true })).toBe(false); // no volumes
		expect(isSettings(null)).toBe(false);
		expect(isSettings('{"version":1}')).toBe(false);
	});
});

describe('a hostile storage never breaks the boot', () => {
	it('reads the defaults and no-ops on write', () => {
		const store = createSettings(throwingStorage());

		expect(store.read()).toEqual(DEFAULT_SETTINGS);
		expect(() => store.write(settingsWith({ lang: 'en', sound: false }))).not.toThrow();
	});

	it('reads the defaults with no storage at all (SSR)', () => {
		const store = createSettings(null);

		expect(store.read()).toEqual(DEFAULT_SETTINGS);
		expect(() => store.write(settingsWith({ lang: 'en', sound: false }))).not.toThrow();
	});

	it('swallows a quota failure on write', () => {
		const store = createSettings(quotaFullStorage(memoryStorage()));

		expect(() => store.write(settingsWith({ lang: 'en', sound: false }))).not.toThrow();
		expect(store.read()).toEqual(DEFAULT_SETTINGS);
	});
});
