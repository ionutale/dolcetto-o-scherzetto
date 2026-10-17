/*!
 * ============================================================================
 *  Dolcetto o Scherzetto — SKY GHOST SPRITES (typed port)
 *
 *  1:1 port of the two ghost drawings the validated prototype host keeps for
 *  the ambient sky (spec §4.4):
 *
 *    - `SKY_GHOST`  — the 54×72 wavy sheet ghost: the three drifting figures
 *                     behind the rooflines (`FB.skyGhost()`, host line ~684;
 *                     `initNpcs()`, ~1179, `spSR('skyGhost') || FB.skyGhost()`).
 *    - `CAMEO_GHOST`— the 34×44 peeking head built inline in `cameoTick()`
 *                     (~1578): the shy one that rises out of a trash can.
 *
 *  Nothing is redesigned: the path data, the `#f6f0ff` sheet fill, the
 *  `#3a2f4e` ink, the ##e7c6e0 blush and every coordinate are the prototype's.
 *  The only change is the wrapper — ES-module exported strings instead of the
 *  host's `FB` fallback map and the inline literal.
 *
 *  USAGE
 *    {@html SKY_GHOST}      // trusted static SVG inside a component
 *                           // (the {@html} content carries no scope tag, so
 *                           //  the host sizes/anims it through `:global(svg)`)
 * ============================================================================
 */

/** The drifting sky ghost (54×72) — the prototype host's `FB.skyGhost`. */
export const SKY_GHOST =
	'<svg width="54" height="72" viewBox="0 0 54 72">' +
	'<path d="M8 68 Q8 24 27 13 Q46 24 46 68 Q40 63 36 68 Q31 73 27 68 Q23 73 18 68 Q14 63 8 68 Z" fill="#f6f0ff"/>' +
	'<ellipse cx="19" cy="34" rx="5.4" ry="4.6" fill="#3a2f4e"/>' +
	'<ellipse cx="35" cy="34" rx="5.4" ry="4.6" fill="#3a2f4e"/>' +
	'<circle cx="20.5" cy="32.6" r="1.7" fill="#fff"/>' +
	'<circle cx="36.5" cy="32.6" r="1.7" fill="#fff"/>' +
	'<circle cx="14" cy="44" r="2.6" fill="#e7c6e0"/>' +
	'<circle cx="40" cy="44" r="2.6" fill="#e7c6e0"/>' +
	'<path d="M23 47 Q27 50.5 31 47" stroke="#3a2f4e" stroke-width="1.5" fill="none" stroke-linecap="round"/>' +
	'</svg>';

/** The shy cameo head (34×44) that peeks out of a trash can. */
export const CAMEO_GHOST =
	'<svg width="34" height="44" viewBox="0 0 34 44">' +
	'<path d="M6 42 Q6 16 17 9 Q28 16 28 42 Q24 39 22 42 Q19 45 17 42 Q15 45 12 42 Q10 39 6 42 Z" fill="#f6f0ff"/>' +
	'<ellipse cx="12.5" cy="22" rx="3" ry="2.6" fill="#3a2f4e"/>' +
	'<ellipse cx="21.5" cy="22" rx="3" ry="2.6" fill="#3a2f4e"/>' +
	'<circle cx="10" cy="28" r="1.8" fill="#e7c6e0"/>' +
	'<circle cx="24" cy="28" r="1.8" fill="#e7c6e0"/>' +
	'</svg>';
