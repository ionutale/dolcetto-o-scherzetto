/**
 * The presentation rotation and its mode (T4b 2026-10-19, revised 2026-10-24
 * and 2026-10-29).
 *
 * Two independent things live here:
 *
 * - **The angle** (`rotation()`): how far the stage is turned, in degrees
 *   clockwise. The player turns the world by hand — **every press rotates the
 *   stage a quarter turn to the left** (0° → 270° → 180° → 90° → 0°) — so any
 *   hold — upright, on the side, upside down on a pillow — can be made to read
 *   correctly with at most three taps. It drives the stage in both modes.
 *
 * - **The mode** (`rotationMode()`, T43): `'auto'` (default) lets the pure-CSS
 *   `@media (orientation: portrait)` prompt ask the child to turn the phone;
 *   `'manual'` suppresses the prompt. There is still **no sensor** anywhere:
 *   nothing reads `DeviceOrientationEvent`, and no orientation listener makes
 *   presentation decisions (resize/orientationchange only re-measure). "Auto"
 *   means the CSS media feature, nothing more — see ADR-0007.
 *
 * Both persist in the settings envelope (`dos.settings.v1`: optional
 * `rotation`, default 0; optional `rotationMode`, default `'auto'`), are read
 * by `Stage` (which reserves the rotated footprint and transforms the stage)
 * and `RotatePrompt` (which decides whether the portrait overlay may show),
 * and are written by the HUD's rotate button, the Settings card and the
 * prompt's "Gioca così" escape.
 */
import { settings } from '$lib/persist/settings';
import type { Rotation, RotationMode } from '$lib/persist/settings';

/** The live rotation, seeded from the settings envelope (defaults upright). */
let current = $state<Rotation>(settings.read().rotation ?? 0);

/** The live mode, seeded from the settings envelope (defaults to auto). */
let mode = $state<RotationMode>(settings.read().rotationMode ?? 'auto');

/** The live rotation, in degrees clockwise. */
export function rotation(): Rotation {
	return current;
}

/** The live rotation mode (T43): `'auto'` may show the portrait prompt. */
export function rotationMode(): RotationMode {
	return mode;
}

/** Set + persist the rotation (never throws; a hostile storage just forgets it). */
export function setRotation(next: Rotation): void {
	current = next;
	settings.write({ ...settings.read(), rotation: next });
}

/**
 * Set + persist the rotation mode (T43). `'manual'` is durable on purpose: the
 * portrait prompt's escape writes it once and the device stops asking — the
 * Settings card's `Schermo` row is the way back to `'auto'`.
 */
export function setRotationMode(next: RotationMode): void {
	mode = next;
	settings.write({ ...settings.read(), rotationMode: next });
}

/** The button's verb: turn the world a quarter turn to the LEFT, remembered. */
export function rotateLeft(): void {
	const next = (((current - 90) % 360) + 360) % 360;
	setRotation(next as Rotation);
}
