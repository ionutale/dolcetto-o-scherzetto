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
		const storage = memoryStorage();
		const store = createSettings(storage);
		expect(bossEnabled(store)).toBe(true);
		setBossEnabled(false, store);
		const saved = JSON.parse(storage.getItem(SETTINGS_KEY) ?? '{}');
		expect(saved.bosses).toBe(false);
		expect(saved.lang).toBe('it');
		expect(saved.musicVolume).toBe(1);
		expect(bossEnabled(store)).toBe(false);
	});
});
