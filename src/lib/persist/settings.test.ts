import { describe, expect, it } from 'vitest';
import type { Settings } from './settings';
import { DEFAULT_SETTINGS, SETTINGS_KEY, createSettings, isSettings } from './settings';

/**
 * Settings are a preference, not a save: the contract is still "never throws",
 * because the mute/language path is on the boot path and a hostile storage
 * must not turn a reload into a red screen. Every hostile storage here (a
 * throwing one, a corrupt payload, a foreign version) has to end in
 * "defaults": Italian voice, sound on (spec §13).
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

describe('defaults', () => {
	it('is Italian voice with sound on (spec: IT default)', () => {
		expect(DEFAULT_SETTINGS).toEqual({ version: 1, lang: 'it', sound: true });
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

		store.write({ version: 1, lang: 'en', sound: true });

		expect(store.read()).toEqual({ version: 1, lang: 'en', sound: true });
	});

	it('remembers the sound toggle, including muting', () => {
		const store = createSettings(memoryStorage());

		store.write({ version: 1, lang: 'it', sound: false });

		expect(store.read().sound).toBe(false);
	});

	it('writes under the one versioned key', () => {
		const storage = memoryStorage();
		const written: Settings = { version: 1, lang: 'en', sound: false };
		createSettings(storage).write(written);

		expect(JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null')).toEqual(written);
	});

	it('last write wins', () => {
		const store = createSettings(memoryStorage());
		store.write({ version: 1, lang: 'en', sound: true });
		store.write({ version: 1, lang: 'it', sound: false });

		expect(store.read()).toEqual({ version: 1, lang: 'it', sound: false });
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

		store.write({ version: 1, lang: 'en', sound: true });

		expect(store.read()).toEqual({ version: 1, lang: 'en', sound: true });
	});

	it('accepts exactly the settings it writes', () => {
		expect(isSettings({ version: 1, lang: 'it', sound: true })).toBe(true);
		expect(isSettings({ version: 1, lang: 'en', sound: false })).toBe(true);
		expect(isSettings({ version: 1, lang: 'fr', sound: true })).toBe(false);
		expect(isSettings({ version: 2, lang: 'it', sound: true })).toBe(false);
		expect(isSettings({ version: 1, lang: 'it' })).toBe(false);
		expect(isSettings(null)).toBe(false);
		expect(isSettings('{"version":1}')).toBe(false);
	});
});

describe('a hostile storage never breaks the boot', () => {
	it('reads the defaults and no-ops on write', () => {
		const store = createSettings(throwingStorage());

		expect(store.read()).toEqual(DEFAULT_SETTINGS);
		expect(() => store.write({ version: 1, lang: 'en', sound: false })).not.toThrow();
	});

	it('reads the defaults with no storage at all (SSR)', () => {
		const store = createSettings(null);

		expect(store.read()).toEqual(DEFAULT_SETTINGS);
		expect(() => store.write({ version: 1, lang: 'en', sound: false })).not.toThrow();
	});

	it('swallows a quota failure on write', () => {
		const store = createSettings(quotaFullStorage(memoryStorage()));

		expect(() => store.write({ version: 1, lang: 'en', sound: false })).not.toThrow();
		expect(store.read()).toEqual(DEFAULT_SETTINGS);
	});
});
