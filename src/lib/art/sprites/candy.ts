/*!
 * ============================================================================
 *  Dolcetto o Scherzetto — CANDY SPRITE PACK (typed port of the validated pack)
 *
 *  1:1 port of the `candies` map and the `candyColor` table from
 *  `prototypes/scene-prototype.html` (lines ~999-1007), plus the `bucketIcon`
 *  helper (~1018) that draws the bag the candies fly into. Same six `<svg>`
 *  strings, same path data, same hex values, same `<svg viewBox="0 0 34 34">`
 *  wrapper (no width/height — the host sizes the box) — nothing redesigned.
 *
 *  The only change is the wrapper: an ES module with type annotations instead
 *  of a classic-script `const candies = { lolli: c => ... }` object literal, so
 *  `candy-motion.ts` and the layers can import by name.
 *
 *  Shape and colour are **cosmetic only** — a drop's value is rolled by the sim
 *  (`rollValue`), never carried by its hue (spec §8, ART-STYLE §6). The six
 *  pastels are the app's `--candy-1..6` tokens in `app.css` (same hex values).
 *
 *  USAGE
 *    candleColor['lolli']            // '#ff9ec7'
 *    candySvg('lolli')               // full <svg> string in the lolli pastel
 *    candySvg('star', '#7fd7ff')     // same shape, explicit colour
 *    bucketIcon(24)                  // the bag-chip icon (HUD)
 * ============================================================================
 */

import type { CandyType } from '$lib/sim/loop';

/** The six candy pastels — `--candy-1..6`, in `candyColor` order. */
export const candyColor: Record<CandyType, string> = {
	lolli: '#ff9ec7',
	gummy: '#ff7a59',
	choco: '#c98a4b',
	toffee: '#ffd166',
	corn: '#ffb347',
	star: '#7fd7ff'
};

/** Lollipop: stick, ball, the white sugar swirl. */
export function lolli(c: string): string {
	return `<svg viewBox="0 0 34 34"><rect x="15.6" y="16" width="2.8" height="15" rx="1.4" fill="#e8d9c0"/><circle cx="17" cy="13" r="10" fill="${c}"/><path d="M17 6.5 A6.5 6.5 0 0 1 23.5 13 A4.6 4.6 0 0 0 17 9.4 A3.2 3.2 0 0 1 20.2 13" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" opacity=".85"/></svg>`;
}

/** Gummy bear: two ears, a round body, two eye specks. */
export function gummy(c: string): string {
	return `<svg viewBox="0 0 34 34"><circle cx="12" cy="10" r="4.6" fill="${c}"/><circle cx="22" cy="10" r="4.6" fill="${c}"/><ellipse cx="17" cy="20" rx="9.5" ry="8.5" fill="${c}"/><circle cx="14.5" cy="19" r="1" fill="#fff" opacity=".9"/><circle cx="19.5" cy="19" r="1" fill="#fff" opacity=".9"/></svg>`;
}

/** Chocolate square: the embossed grid and a lighter top bevel. */
export function choco(c: string): string {
	return `<svg viewBox="0 0 34 34"><rect x="6" y="7" width="22" height="21" rx="4" fill="${c}"/><path d="M13.5 9 V26 M20.5 9 V26 M8 15 H26 M8 21 H26" stroke="#00000022" stroke-width="1.6"/><rect x="6" y="7" width="22" height="6" rx="3" fill="#ffffff30"/></svg>`;
}

/** Toffee: the two twisted wrappers and the satin centre. */
export function toffee(c: string): string {
	return `<svg viewBox="0 0 34 34"><path d="M2 14 L9 11 V23 L2 20 Z" fill="#ffd166"/><path d="M32 14 L25 11 V23 L32 20 Z" fill="#ffd166"/><rect x="8" y="9" width="18" height="17" rx="6" fill="${c}"/><path d="M13 12 Q17 15 13 22" stroke="#ffffff55" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
}

/** Candy corn: the three stacked bands. */
export function corn(c: string): string {
	return `<svg viewBox="0 0 34 34"><path d="M17 4 L27 28 L7 28 Z" fill="${c}"/><path d="M17 4 L21.5 14.5 L12.5 14.5 Z" fill="#fff3d6"/><path d="M12.5 14.5 L21.5 14.5 L24.5 21.5 L9.5 21.5 Z" fill="#ffb347"/></svg>`;
}

/** Star candy: the five-point star and one sugar glint. */
export function star(c: string): string {
	return `<svg viewBox="0 0 34 34"><path d="M17 3 l4 9.4 10 .9 -7.6 6.7 2.3 9.8 -8.7 -5.2 -8.7 5.2 2.3 -9.8 -7.6 -6.7 10 -.9 Z" fill="${c}"/><circle cx="14" cy="14" r="1.2" fill="#fff" opacity=".85"/></svg>`;
}

/** The six shapes by id — the prototype's `candies` map, typed. */
export const candyShapes: Record<CandyType, (c: string) => string> = {
	lolli,
	gummy,
	choco,
	toffee,
	corn,
	star
};

/** The full `<svg>` for a candy skin, defaulting to its own pastel. */
export function candySvg(type: CandyType, color: string = candyColor[type]): string {
	return candyShapes[type](color);
}

/**
 * The bag-chip icon — the jack-o'-lantern bucket the candies fly into
 * (`bucketIcon` in the prototype, ~1018). Ported verbatim; `size` is the
 * square edge in px (24 in the HUD chip).
 */
export function bucketIcon(size = 24): string {
	return `<svg width="${size}" height="${size}" viewBox="0 0 28 28"><path d="M6 8 H22 L20.4 24 Q14 26 7.6 24 Z" fill="#ff9e57"/><path d="M6 8 H22 L21.6 11 H6.4 Z" fill="#e8874a"/><path d="M9.5 5.5 Q14 .5 18.5 5.5" stroke="#e8874a" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M10 14.5 L12 16.5 L10.5 18.5 M14 14.5 L16 16.5 L14.5 18.5" stroke="#5c3a22" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
}
