/*!
 * ============================================================================
 *  Dolcetto o Scherzetto — TRICK ICON SPRITES (typed port of the validated pack)
 *
 *  1:1 port of the `trickIcons` map from `prototypes/scene-prototype.html`
 *  (lines ~1008-1017): the same eight `<svg viewBox="0 0 40 40">` strings, the
 *  same path data and the same hex values — nothing redesigned, nothing
 *  retyped from scratch. Each icon is the little prop a trick show stages
 *  (spec §7), and it is the same drawing the Bottega (T16) and the theatre
 *  (T14) will show for that id.
 *
 *  The only change is the wrapper: an ES module with a type annotation instead
 *  of a classic-script `const trickIcons = { boo: ` + "`...`" + ` }` object
 *  literal, keyed by `TrickId` so a missing id is a type error rather than an
 *  empty cell in the fan.
 *
 *  **Names live elsewhere.** This module draws; it never labels. The card's
 *  text comes from `TRICKS[id].name` in `sim/economy.ts`, in the player's
 *  language (the prototype's `trickName()`, ~715).
 *
 *  USAGE
 *    trickIcons['boo']            // full <svg> string for the ghost face
 *    {@html trickIcons[id]}       // trusted static SVG inside a component
 *                                 // (host styles it with `:global(svg)`,
 *                                 //  the {@html} content carries no scope tag)
 * ============================================================================
 */

import type { TrickId } from '$lib/sim/economy';

/** The eight trick props by id — the prototype's `trickIcons` map, typed. */
export const trickIcons: Record<TrickId, string> = {
	boo: `<svg viewBox="0 0 40 40"><path d="M7 36 Q7 12 20 6 Q33 12 33 36 Q28 32 25 36 Q21 40 20 36 Q19 40 15 36 Q12 32 7 36 Z" fill="#f6f0ff"/><ellipse cx="15.5" cy="20" rx="3.6" ry="3" fill="#3a2f4e"/><ellipse cx="24.5" cy="20" rx="3.6" ry="3" fill="#3a2f4e"/><path d="M17 27 Q20 29.5 23 27" stroke="#3a2f4e" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>`,
	ragnetto: `<svg viewBox="0 0 40 40"><path d="M20 2 V12" stroke="#c9b6ff" stroke-width="1.6"/><circle cx="20" cy="21" r="8" fill="#3a2f5e"/><circle cx="17.4" cy="19.5" r="1.5" fill="#fff"/><circle cx="22.6" cy="19.5" r="1.5" fill="#fff"/><path d="M12 15 L4 8 M28 15 L36 8 M11 21 L3 20 M29 21 L37 20 M12 27 L5 33 M28 27 L35 33" stroke="#3a2f5e" stroke-width="2.2" stroke-linecap="round"/></svg>`,
	serpente: `<svg viewBox="0 0 40 40"><rect x="6" y="24" width="28" height="12" rx="5" fill="#c98a4b"/><rect x="6" y="24" width="28" height="4" rx="2" fill="#e0aa74"/><path d="M20 26 C10 26 30 20 20 16 C12 13 26 9 20 6" stroke="#95c47d" stroke-width="4.4" fill="none" stroke-linecap="round"/><circle cx="20.5" cy="5.6" r="4" fill="#95c47d"/><circle cx="19" cy="4.6" r="1.1" fill="#2e2751"/></svg>`,
	cuscino: `<svg viewBox="0 0 40 40"><ellipse cx="20" cy="24" rx="16" ry="11" fill="#e7c6e0"/><ellipse cx="20" cy="21" rx="14" ry="8" fill="#f2dbee"/><path d="M14 22 Q20 26 26 22" stroke="#c9a4c0" stroke-width="1.6" fill="none"/></svg>`,
	maschera: `<svg viewBox="0 0 40 40"><path d="M6 14 Q20 2 34 14 Q36 30 20 38 Q4 30 6 14 Z" fill="#c9e6a1"/><ellipse cx="14.5" cy="19" rx="4" ry="4.6" fill="#2e2751"/><ellipse cx="25.5" cy="19" rx="4" ry="4.6" fill="#2e2751"/><path d="M13 29 Q20 34 27 29" stroke="#2e2751" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
	topolino: `<svg viewBox="0 0 40 40"><ellipse cx="24" cy="24" rx="12" ry="8" fill="#8c8c94"/><circle cx="13" cy="19" r="6" fill="#9a9aa2"/><circle cx="10.4" cy="15.4" r="3.6" fill="#8c8c94"/><circle cx="16.4" cy="13.6" r="3.6" fill="#8c8c94"/><circle cx="11.5" cy="18" r="1.3" fill="#2e2751"/><circle cx="34" cy="17" r="5.4" fill="#8c3550"/><circle cx="26" cy="30" r="3" fill="#6f6f78"/></svg>`,
	fantasmino: `<svg viewBox="0 0 40 40"><rect x="12" y="28" width="16" height="10" rx="4" fill="#ff9e57"/><path d="M10 30 Q10 12 20 6 Q30 12 30 30 Q26 27 24 30 Q21 33 20 30 Q19 33 16 30 Q14 27 10 30 Z" fill="#f6f0ff"/><ellipse cx="16.6" cy="17.5" rx="2.4" ry="2" fill="#3a2f4e"/><ellipse cx="23.4" cy="17.5" rx="2.4" ry="2" fill="#3a2f4e"/><path d="M17.6 23 Q20 25 22.4 23" stroke="#3a2f4e" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>`,
	mano: `<svg viewBox="0 0 40 40"><path d="M12 36 Q8 20 14 10 Q16 6 19 9 L19 16 Q20 12 23 12 Q26 12 26 16 L26 18 Q28 15 31 17 Q33 19 31 23 L30 28 Q28 36 22 38 Q16 39 12 36 Z" fill="#9a8fc0"/><path d="M14 32 Q20 34 26 30" stroke="#8a7fb0" stroke-width="2" fill="none"/></svg>`
};
