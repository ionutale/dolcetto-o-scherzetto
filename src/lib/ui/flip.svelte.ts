/**
 * The manual presentation flip (T4b, 2026-10-19).
 *
 * The game never asks the device which way it is held — the accelerometer was
 * the dependency the owner asked us to drop: the installed PWA was locked to
 * landscape (manifest `orientation`) and showed a "turn the phone" prompt
 * whenever the viewport reported portrait. Instead the player chooses:
 *
 *   - `landscape` — the world's native facing (the 852×393 stage as designed);
 *   - `portrait`  — the same stage turned a quarter turn, for a tall viewport.
 *
 * The choice persists in the settings envelope (`dos.settings.v1`, optional
 * `flip`, default landscape) and is read by `Stage` (which reserves the
 * rotated footprint and transforms the stage) and written by the HUD's flip
 * button and the Settings card's segmented row. No orientation listeners make
 * presentation decisions anywhere: resize/orientationchange only re-measure.
 */
import { settings } from '$lib/persist/settings';
import type { Flip } from '$lib/persist/settings';

/** The live flip, seeded from the settings envelope (defaults to landscape). */
let current = $state<Flip>(settings.read().flip ?? 'landscape');

/** The live flip. */
export function flip(): Flip {
	return current;
}

/** Set + persist the flip (never throws; a hostile storage just forgets it). */
export function setFlip(next: Flip): void {
	current = next;
	settings.write({ ...settings.read(), flip: next });
}

/** The button's verb: turn the world a quarter turn, remembered. */
export function toggleFlip(): void {
	setFlip(current === 'landscape' ? 'portrait' : 'landscape');
}
