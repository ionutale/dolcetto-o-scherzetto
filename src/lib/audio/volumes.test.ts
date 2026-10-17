import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_KEY, createSettings } from '../persist/settings';
import type { Settings } from '../persist/settings';
import { load, save, setMusic, setSfx, volumes } from './volumes.svelte';

/**
 * The volumes store is the seam T23/T25/T27 consume, so its contract is the
 * ones the settings test pins, one level up: a value is always a finite 0..1
 * gain, a corrupted envelope reads back as the two defaults (both full), and a
 * write never disturbs `lang`/`sound`.
 *
 * The store is a module singleton, so every test seeds it explicitly with
 * `load(store)` rather than trusting the import-time value.
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

/** Writes a payload straight into the key, bypassing the store. */
function poison(storage: Storage, raw: string): void {
	storage.setItem(SETTINGS_KEY, raw);
}

/** A full settings payload; each row tweaks only what it is about. */
function settingsWith(overrides: Partial<Settings> = {}): Settings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

describe('defaults', () => {
	it('starts both gains at full when nothing is stored', () => {
		load(createSettings(memoryStorage()));

		expect(volumes()).toEqual({ music: 1, sfx: 1 });
	});

	it('reads the two gains the envelope already holds', () => {
		const storage = memoryStorage();
		createSettings(storage).write(settingsWith({ musicVolume: 0.35, sfxVolume: 0.8 }));

		load(createSettings(storage));

		expect(volumes()).toEqual({ music: 0.35, sfx: 0.8 });
	});
});

describe('clamping: the store only ever holds 0..1', () => {
	it('clamps each setter into the band', () => {
		const store = createSettings(memoryStorage());

		setMusic(2, store);
		expect(volumes().music).toBe(1);
		setMusic(-3, store);
		expect(volumes().music).toBe(0);
		setSfx(1.5, store);
		expect(volumes().sfx).toBe(1);
		setSfx(-0.2, store);
		expect(volumes().sfx).toBe(0);
	});

	it('keeps the exact band edges untouched', () => {
		const store = createSettings(memoryStorage());

		setMusic(1, store);
		setSfx(0, store);

		expect(volumes()).toEqual({ music: 1, sfx: 0 });
	});

	it('ignores a non-finite argument rather than storing NaN/Infinity', () => {
		const store = createSettings(memoryStorage());
		load(store);
		setMusic(0.5, store);

		setMusic(Number.NaN, store);
		setSfx(Infinity, store);
		setMusic(-Infinity, store);

		expect(volumes()).toEqual({ music: 0.5, sfx: 1 });
		expect(Number.isFinite(volumes().music)).toBe(true);
		expect(Number.isFinite(volumes().sfx)).toBe(true);
	});
});

describe('persist / restore through dos.settings.v1', () => {
	it('writes both gains into the one settings key', () => {
		const storage = memoryStorage();
		const store = createSettings(storage);

		setMusic(0.25, store);
		setSfx(0.5, store);

		expect(store.read().musicVolume).toBe(0.25);
		expect(store.read().sfxVolume).toBe(0.5);
		const raw = JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null');
		expect(raw.musicVolume).toBe(0.25);
		expect(raw.sfxVolume).toBe(0.5);
	});

	it('restores the persisted gains on a fresh load', () => {
		const storage = memoryStorage();
		const writer = createSettings(storage);
		setMusic(0.4, writer);
		setSfx(0.2, writer);

		// A fresh boot: a new store over the same storage, then load().
		load(createSettings(storage));

		expect(volumes()).toEqual({ music: 0.4, sfx: 0.2 });
	});

	it('preserves lang and sound when a slider writes', () => {
		const storage = memoryStorage();
		const store = createSettings(storage);
		store.write(settingsWith({ lang: 'en', sound: false }));
		load(store);

		setMusic(0.4, store);

		const stored = store.read();
		expect(stored.lang).toBe('en');
		expect(stored.sound).toBe(false);
		expect(stored.musicVolume).toBe(0.4);
		expect(stored.sfxVolume).toBe(1);
	});

	it('save() re-writes the whole envelope with the live pair, last write wins', () => {
		const storage = memoryStorage();
		const store = createSettings(storage);
		load(store);

		setSfx(0.1, store);
		setMusic(0.9, store);
		save(store);

		expect(store.read()).toEqual(settingsWith({ musicVolume: 0.9, sfxVolume: 0.1 }));
	});
});

describe('a corrupted envelope never breaks the sliders', () => {
	it('falls back to the two defaults and repairs on the next write', () => {
		const storage = memoryStorage();
		const store = createSettings(storage);
		poison(storage, '{"version":1,"musicVolume":0.'); // a half-written save

		load(store);
		expect(volumes()).toEqual({ music: 1, sfx: 1 });

		setMusic(0.3, store);
		expect(store.read()).toEqual(settingsWith({ musicVolume: 0.3, sfxVolume: 1 }));
	});

	it('falls back to the defaults for a pre-T17 envelope with no volume pair', () => {
		const storage = memoryStorage();
		poison(storage, JSON.stringify({ version: 1, lang: 'en', sound: true }));

		load(createSettings(storage));

		expect(volumes()).toEqual({ music: 1, sfx: 1 });
	});

	it('clamps an out-of-band stored volume on the way in', () => {
		const storage = memoryStorage();
		poison(storage, JSON.stringify(settingsWith({ musicVolume: 9, sfxVolume: -4 })));

		load(createSettings(storage));

		expect(volumes()).toEqual({ music: 1, sfx: 0 });
	});
});
