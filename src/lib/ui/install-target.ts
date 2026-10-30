/**
 * "Is this already the installed web app?" (T45, 2026-10-30).
 *
 * The home card hides its install pill once the game is running from the Home
 * Screen: the instructions would be noise for a player who already followed
 * them. Two signals, both cheap and both read-only:
 *
 * - `(display-mode: standalone)` — the standard media query, true in an
 *   installed PWA on every platform that supports it;
 * - `navigator.standalone` — iOS Safari's own boolean, still the only signal
 *   the iPhone honours in some standalone modes.
 *
 * Never throws: a locked-down browser with no `matchMedia` answers "not
 * installed", which only means the pill stays visible.
 */
export function isInstalled(): boolean {
	if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
	try {
		const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
		const displayMode =
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(display-mode: standalone)').matches;
		return iosStandalone || displayMode;
	} catch {
		/* no media queries, no standalone flag: treat it as a normal browser tab */
		return false;
	}
}
