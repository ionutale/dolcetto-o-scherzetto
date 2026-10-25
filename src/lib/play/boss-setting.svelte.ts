/**
 * The candy boss switch — the parent-facing preference the page and the
 * Settings card share (spec: "a friendly challenge, no fail").
 *
 * The setting itself lives in the device's one settings envelope
 * (`dos.settings.v1`, optional `bosses`, missing means on), exactly as
 * `rotation` and the volume pair do. This module is the *state seam* on top of
 * it, like `volumes.svelte.ts`: a component reads {@link bossesEnabled} in a
 * template and tracks it, while the page's frame loop reads it once per tick.
 *
 * **Why both a plain and a runes API.** `bossEnabled`/`setBossEnabled` are the
 * plain store functions (testable with any `SettingsStore`, including a memory
 * one); `bossesEnabled`/`setBosses`/`loadBosses` are the reactive wrapper the
 * UI uses. A write always goes through the envelope first, so the preference
 * survives the reload even when the reactive copy is stale.
 */
import { settings } from '$lib/persist/settings';
import type { SettingsStore } from '$lib/persist/settings';

/** The stored switch, with a missing field (a pre-boss envelope) meaning on. */
export function bossEnabled(store: SettingsStore = settings): boolean {
	return store.read().bosses ?? true;
}

/**
 * Persist the switch without clobbering its neighbours: the stored settings are
 * spread back with only `bosses` replaced (the same rule the volume sliders
 * follow, so a language or mute choice can never be lost here).
 */
export function setBossEnabled(on: boolean, store: SettingsStore = settings): void {
	store.write({ ...store.read(), bosses: on });
}

/** The live value, seeded from the envelope at import (defaults on). */
let state = $state(bossEnabled());

/** The live switch — reading this in a template tracks changes. */
export function bossesEnabled(): boolean {
	return state;
}

/** Apply + persist the switch from the Settings row. */
export function setBosses(on: boolean, store: SettingsStore = settings): void {
	state = on;
	setBossEnabled(on, store);
}

/** Re-read the switch from the store (boot, or after an external write). */
export function loadBosses(store: SettingsStore = settings): void {
	state = bossEnabled(store);
}
