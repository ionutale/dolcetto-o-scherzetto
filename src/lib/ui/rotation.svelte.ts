/**
 * The manual presentation rotation (T4b, revised 2026-10-24).
 *
 * The game never asks the device which way it is held — the accelerometer was
 * the dependency the owner asked us to drop: the installed PWA was locked to
 * landscape (manifest `orientation`) and showed a "turn the phone" prompt
 * whenever the viewport reported portrait. Instead the player turns the world
 * by hand: **every press rotates the stage a quarter turn to the left**
 * (0° → 270° → 180° → 90° → 0°), so any hold — upright, on the side, upside
 * down on a pillow — can be made to read correctly with at most three taps.
 *
 * The angle persists in the settings envelope (`dos.settings.v1`, optional
 * `rotation`, default 0) and is read by `Stage` (which reserves the rotated
 * footprint and transforms the stage) and written by the HUD's rotate button
 * and the Settings card. No orientation listeners make presentation decisions
 * anywhere: resize/orientationchange only re-measure.
 */
import { settings } from '$lib/persist/settings';
import type { Rotation } from '$lib/persist/settings';

/** The live rotation, seeded from the settings envelope (defaults upright). */
let current = $state<Rotation>(settings.read().rotation ?? 0);

/** The live rotation, in degrees clockwise. */
export function rotation(): Rotation {
	return current;
}

/** Set + persist the rotation (never throws; a hostile storage just forgets it). */
export function setRotation(next: Rotation): void {
	current = next;
	settings.write({ ...settings.read(), rotation: next });
}

/** The button's verb: turn the world a quarter turn to the LEFT, remembered. */
export function rotateLeft(): void {
	const next = (((current - 90) % 360) + 360) % 360;
	setRotation(next as Rotation);
}
