import { describe, expect, it } from 'vitest';
import { SETTINGS_KEY, createSettings } from '$lib/persist/settings';
import { bossEnabled, setBossEnabled } from './boss-setting.svelte';

/**
 * The switch is a preference, so its contract is the settings envelope's, one
 * level up: a device that never saw the boss reads it as on, and a write
 * replaces only `bosses` — the parent's language and volume choices survive.
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

describe('boss setting', () => {
	it('defaults on and writes the toggle without clobbering other fields', () => {
		// Non-default values on purpose: a spread that dropped everything but
		// `bosses` would still pass against a fresh envelope's defaults.
		const storage = memoryStorage({
			[SETTINGS_KEY]: JSON.stringify({
				version: 1,
				lang: 'en',
				sound: false,
				musicVolume: 0.4,
				sfxVolume: 0.7,
				rotation: 90
			})
		});
		const store = createSettings(storage);
		expect(bossEnabled(store)).toBe(true);
		setBossEnabled(false, store);
		const saved = JSON.parse(storage.getItem(SETTINGS_KEY) ?? '{}');
		expect(saved.bosses).toBe(false);
		expect(saved.lang).toBe('en');
		expect(saved.sound).toBe(false);
		expect(saved.musicVolume).toBe(0.4);
		expect(saved.sfxVolume).toBe(0.7);
		expect(saved.rotation).toBe(90);
		expect(bossEnabled(store)).toBe(false);
	});
});
