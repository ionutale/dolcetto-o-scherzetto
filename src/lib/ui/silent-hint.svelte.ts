/**
 * The one-time iOS silent-switch tip (T44, 2026-10-29).
 *
 * iOS gives a web page **no way** to read the ringer/silent switch or the
 * output route: no event, no property, no permission. `AudioContext.state`
 * stays `running` while the phone is silent, so "is it muted?" cannot be
 * detected — and there is no headphone API either.
 *
 * What exists is a fix: since iOS 17, `navigator.audioSession.type = 'playback'`
 * routes Web Audio as media playback and ignores the silent switch. The page
 * sets it on the first gesture (`unlockAudio()`). Builds without that API
 * (iOS 16 and older) stay silent with no way to tell, so this tip exists as the
 * honest fallback: it says what to do instead of pretending to detect anything.
 *
 * It is shown at most once per device — `audioHintSeen` in the settings
 * envelope — and only on iOS without the Audio Session API, so a modern iPhone
 * never sees it. Desktop browsers and Android are never targeted.
 */
import { settings } from '$lib/persist/settings';

/** True while the tip is on screen. */
let open = $state(false);

/** True while the tip is on screen. */
export function silentHintOpen(): boolean {
	return open;
}

/** True when the browser can route audio around the silent switch (iOS 17+). */
export function canBypassSilentSwitch(): boolean {
	return typeof navigator !== 'undefined' && 'audioSession' in navigator;
}

/** True on iPhone/iPad, including iPadOS's desktop ("MacIntel") user agent. */
export function isIOS(): boolean {
	if (typeof navigator === 'undefined') return false;
	if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
	return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

/**
 * Called on every Gioca. Shows the tip once, on an iOS build that cannot route
 * playback around the switch and has not seen it yet. Never shows when the
 * player has muted the game in Settings — there is nothing to hear.
 */
export function maybeShowSilentHint(): void {
	if (open) return;
	if (!isIOS() || canBypassSilentSwitch()) return;
	const stored = settings.read();
	if (!stored.sound || stored.audioHintSeen) return;
	open = true;
}

/** Hide + remember (never throws; a hostile storage just shows it again next boot). */
export function dismissSilentHint(): void {
	if (!open) return;
	open = false;
	settings.write({ ...settings.read(), audioHintSeen: true });
}
