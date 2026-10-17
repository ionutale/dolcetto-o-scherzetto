/*!
 * ============================================================================
 *  Dolcetto o Scherzetto — NEIGHBOUR SPRITES (typed port of the validated pack)
 *
 *  1:1 port of the three neighbour SVGs the prototype ships
 *  (`prototypes/scene-prototype.html`, the `SVG` map, lines ~965-997): the
 *  ghost, the nonna and the strega, each wrapped in the width-carrying `<div>`
 *  the door reveal slot flex-centres. Every path, fill and coordinate is the
 *  prototype's — this module only lifts the markup out of a classic-script
 *  string map into a typed ES module.
 *
 *  USAGE
 *    neighborFor(k);          // ready-to-`{@html}` markup for house k
 *    NEIGHBORS[archOf(k)];    // the same, keyed by archetype
 *
 *  CONTRACT — exact, the host depends on it
 *    - `archOf(k) = ['ghost','nonna','strega'][((k % 3) + 3) % 3]` — the
 *      prototype's own k→archetype map (line 1030): houses cycle the three
 *      neighbours and a negative house index wraps instead of exploding.
 *    - Each entry is a `<div style="width:Npx">` around one `<svg>` — no ids,
 *      no defs, no external refs (ART-STYLE §3/§4) — so it can be spliced
 *      into any doorway with `{@html}` (the markup is static and trusted,
 *      the same licence `houses.ts` gets).
 *    - The widths (66 / 70 / 74) are the prototype's: `HouseSlot`'s reveal
 *      slot is 72 px wide and flex-centres whatever it is given.
 *
 *  T24b grows the cast to six archetypes; the k-map and the string keys are
 *  the seam it plugs into (it edits this file, not its callers).
 * ============================================================================
 */

/** The archetypes the prototype ships. T24b widens the map, not its shape. */
export type NeighborArch = 'ghost' | 'nonna' | 'strega';

/** Archetype order — the array `archOf` indexes into. */
export const NEIGHBOR_ARCHES = ['ghost', 'nonna', 'strega'] as const;

/** `{@html}` markup per archetype — the prototype's `SVG` map, verbatim. */
export const NEIGHBORS: Record<NeighborArch, string> = {
	ghost: `<div style="width:66px"><svg width="66" height="88" viewBox="0 0 66 88">
    <path d="M10 84 Q10 30 33 16 Q56 30 56 84 Q49 78 44 84 Q38 90 33 84 Q28 90 22 84 Q17 78 10 84 Z" fill="#f6f0ff"/>
    <path d="M33 16 Q30 40 32 84 L33 84 L34 84 Q36 40 33 16 Z" fill="#e9def7" opacity=".7"/>
    <ellipse cx="24" cy="42" rx="7.5" ry="6.2" fill="#3a2f4e"/><ellipse cx="42" cy="42" rx="7.5" ry="6.2" fill="#3a2f4e"/>
    <circle cx="26" cy="40" r="2.4" fill="#fff"/><circle cx="44" cy="40" r="2.4" fill="#fff"/>
    <circle cx="19" cy="54" r="3.4" fill="#e7c6e0" opacity=".9"/><circle cx="47" cy="54" r="3.4" fill="#e7c6e0" opacity=".9"/>
    <path d="M29 58 Q33 62 37 58" stroke="#3a2f4e" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  </svg></div>`,
	nonna: `<div style="width:70px"><svg width="70" height="88" viewBox="0 0 70 88">
    <path d="M8 86 Q8 54 35 50 Q62 54 62 86 Z" fill="#c98ab5"/>
    <circle cx="35" cy="36" r="17" fill="#ffd9b8"/>
    <path d="M14 34 Q12 8 35 8 Q58 8 56 34 Q52 22 35 21 Q18 22 14 34 Z" fill="#bcaee8"/>
    <path d="M52 22 Q62 26 60 36 Q56 32 52 30 Z" fill="#a596e0"/>
    <circle cx="28.5" cy="38" r="2.1" fill="#3a2f4e"/><circle cx="41.5" cy="38" r="2.1" fill="#3a2f4e"/>
    <circle cx="28.5" cy="38" r="5.6" fill="none" stroke="#3a2f4e" stroke-width="1.3"/>
    <circle cx="41.5" cy="38" r="5.6" fill="none" stroke="#3a2f4e" stroke-width="1.3"/>
    <path d="M33.5 38 L36.5 38" stroke="#3a2f4e" stroke-width="1.3"/>
    <circle cx="22" cy="44" r="3" fill="#ffb8a8" opacity=".85"/><circle cx="48" cy="44" r="3" fill="#ffb8a8" opacity=".85"/>
    <path d="M30 46.5 Q35 50.5 40 46.5" stroke="#3a2f4e" stroke-width="1.7" fill="none" stroke-linecap="round"/>
  </svg></div>`,
	strega: `<div style="width:74px"><svg width="74" height="92" viewBox="0 0 74 92">
    <path d="M8 90 Q8 52 37 48 Q66 52 66 90 Z" fill="#5d4a86"/>
    <circle cx="37" cy="36" r="16.5" fill="#cfe8d2"/>
    <path d="M14 30 Q30 18 60 30 Q58 24 50 20 Q34 12 20 22 Q16 26 14 30 Z" fill="#7a5cff"/>
    <path d="M20 24 Q37 -8 54 24 Q46 20 37 19 Q28 20 20 24 Z" fill="#43326b"/>
    <rect x="17" y="22" width="40" height="6" rx="3" fill="#43326b"/>
    <rect x="31" y="22.5" width="12" height="5" rx="1.5" fill="#ffd166"/>
    <circle cx="31" cy="38" r="2.1" fill="#3a2f4e"/><circle cx="43" cy="38" r="2.1" fill="#3a2f4e"/>
    <circle cx="31.6" cy="37.4" r=".7" fill="#fff"/><circle cx="43.6" cy="37.4" r=".7" fill="#fff"/>
    <circle cx="25.5" cy="43" r="2.8" fill="#ffb8a8" opacity=".8"/><circle cx="48.5" cy="43" r="2.8" fill="#ffb8a8" opacity=".8"/>
    <path d="M32 46 Q37 49.6 42 46" stroke="#3a2f4e" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M55 60 l1.6 3.4 3.4 1.6 -3.4 1.6 -1.6 3.4 -1.6 -3.4 -3.4 -1.6 3.4 -1.6 Z" fill="#ffd166"/>
  </svg></div>`
};

/** The prototype's k→archetype map (line 1030); negative k wraps, never throws. */
export function archOf(k: number): NeighborArch {
	return NEIGHBOR_ARCHES[((k % 3) + 3) % 3];
}

/** The markup for house `k` — what `HouseSlot` splices into its reveal slot. */
export function neighborFor(k: number): string {
	return NEIGHBORS[archOf(k)];
}
