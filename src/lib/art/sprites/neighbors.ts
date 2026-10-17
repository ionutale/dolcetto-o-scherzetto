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
 *    - `archOf(k) = NEIGHBOR_ARCHES[((k % 6) + 6) % 6]` — the prototype's own
 *      k→archetype map (line 1030), widened by T24b: houses cycle the six
 *      neighbours and a negative house index wraps instead of exploding.
 *    - Each entry is a `<div style="width:Npx">` around one `<svg>` — no ids,
 *      no defs, no external refs (ART-STYLE §3/§4) — so it can be spliced
 *      into any doorway with `{@html}` (the markup is static and trusted,
 *      the same licence `houses.ts` gets).
 *    - The trio's widths (66 / 70 / 74) are the prototype's; the three T24b
 *      sprites keep the same band (72 / 70 / 74). `HouseSlot`'s reveal slot is
 *      72 px wide and flex-centres whatever it is given.
 *
 *  T24b grows the cast to six archetypes (spec §4.3): the original trio keeps
 *  its byte-identical markup, and three door sprites join them — **Lupo
 *  Gentile**, **Conte Vlad** and **Spaventapasseri** — drawn to the same
 *  construction as the trio (same portrait scale, one main mass + darker-shade
 *  overlays, ink `#3a2f4e` face, blush `#ffb8a8`, palette tokens only, no
 *  outlines, ART-STYLE §3/§4). The k-map and the string keys are the seam the
 *  trio plugs into: they widen here, their callers do not change.
 * ============================================================================
 */

/**
 * The archetypes the door cycle speaks: the prototype's trio, then the three
 * spec §4.3 neighbours. Order is deliberate — the trio keeps the first three
 * slots so `archOf(0..2)` still lands on ghost/nonna/strega, and every added
 * archetype takes a fresh slot after them.
 */
export type NeighborArch = 'ghost' | 'nonna' | 'strega' | 'wolf' | 'vlad' | 'scarecrow';

/** Archetype order — the array `archOf` indexes into (six, cycling). */
export const NEIGHBOR_ARCHES = ['ghost', 'nonna', 'strega', 'wolf', 'vlad', 'scarecrow'] as const;

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
  </svg></div>`,
	// T24b — Lupo Gentile: gentle grey-lavender werewolf, friendly-puppy energy.
	wolf: `<div style="width:72px"><svg width="72" height="92" viewBox="0 0 72 92">
    <path d="M15 90 Q15 60 36 52 Q57 60 57 90 Q48 86 36 90 Q24 86 15 90 Z" fill="#9a8fc0"/>
    <path d="M36 52 Q25 60 24 90 L15 90 Q15 60 36 52 Z" fill="#7b71a2" opacity=".4"/>
    <ellipse cx="36" cy="74" rx="15" ry="12.6" fill="#cbbfdd"/>
    <ellipse cx="36" cy="72" rx="9.6" ry="8" fill="#e2d9ee" opacity=".45"/>
    <ellipse cx="14.5" cy="70" rx="6.2" ry="9.4" fill="#8a7fb0"/>
    <ellipse cx="57.5" cy="70" rx="6.2" ry="9.4" fill="#8a7fb0"/>
    <path d="M24 20 L20 5 L32 15 Z" fill="#9a8fc0"/>
    <path d="M48 20 L52 5 L40 15 Z" fill="#9a8fc0"/>
    <path d="M25.3 17.6 L23 9.6 L29.4 15.4 Z" fill="#cbbfdd"/>
    <path d="M46.7 17.6 L49 9.6 L42.6 15.4 Z" fill="#cbbfdd"/>
    <path d="M20 35 C15.4 34 13.4 37 14.6 40 C17.4 38.8 19.2 37.4 20 36 Z" fill="#9a8fc0"/>
    <path d="M52 35 C56.6 34 58.6 37 57.4 40 C54.6 38.8 52.8 37.4 52 36 Z" fill="#9a8fc0"/>
    <circle cx="36" cy="34" r="17" fill="#9a8fc0"/>
    <path d="M36 17 C28 17 20 24 19 34 C19 43 26 51 36 51 Z" fill="#8a7fb0" opacity=".28"/>
    <ellipse cx="36" cy="43" rx="9.6" ry="7.8" fill="#ded4ec"/>
    <ellipse cx="36" cy="39.4" rx="3.2" ry="2.4" fill="#3a2f4e"/>
    <path d="M36 41.8 L36 44.4 M32.4 45.6 Q36 48.6 39.6 45.6" stroke="#3a2f4e" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M34 47.4 Q36 50.6 38 47.4 Z" fill="#e7c6e0"/>
    <ellipse cx="28.6" cy="33" rx="2.6" ry="2.9" fill="#3a2f4e"/><ellipse cx="43.4" cy="33" rx="2.6" ry="2.9" fill="#3a2f4e"/>
    <circle cx="29.4" cy="32.1" r=".9" fill="#fff"/><circle cx="44.2" cy="32.1" r=".9" fill="#fff"/>
    <path d="M24.4 28.4 Q28.6 26.4 32.8 28.4" stroke="#7b71a2" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M47.6 28.4 Q43.4 26.4 39.2 28.4" stroke="#7b71a2" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="23.6" cy="40" rx="3.1" ry="2.1" fill="#ffb8a8" opacity=".55"/>
    <ellipse cx="48.4" cy="40" rx="3.1" ry="2.1" fill="#ffb8a8" opacity=".55"/>
  </svg></div>`,
	// T24b — Conte Vlad: polite plum-cape vampire, pale, dressed for the evening.
	vlad: `<div style="width:70px"><svg width="70" height="90" viewBox="0 0 70 90">
    <path d="M35 24 C17 28 7 47 5 89 L65 89 C63 47 53 28 35 24 Z" fill="#6d3a5e"/>
    <path d="M35 24 C48 28 58 47 60 89 L65 89 C63 47 53 28 35 24 Z" fill="#5a2f4f" opacity=".55"/>
    <path d="M35 24 C22 28 12 47 10 89 L5 89 C7 47 17 28 35 24 Z" fill="#7b4468" opacity=".4"/>
    <path d="M35 42 C26 46 23 58 24 78 L46 78 C47 58 44 46 35 42 Z" fill="#2e2751"/>
    <path d="M35 42 C42 46 45 58 44 78 L46 78 C47 58 44 46 35 42 Z" fill="#241d45" opacity=".5"/>
    <path d="M28 40 L19 50 L31 45 Z" fill="#5a2f4f"/>
    <path d="M42 40 L51 50 L39 45 Z" fill="#5a2f4f"/>
    <path d="M29 39 L35 46 L41 39 L38 36 L35 41 L32 36 Z" fill="#efe6f7"/>
    <path d="M31 45 Q35 43 39 45 L38.4 50.6 Q35 52.6 31.6 50.6 Z" fill="#ffd166"/>
    <path d="M31 45 Q35 43 39 45 L38.8 46.6 Q35 44.8 31.2 46.6 Z" fill="#e8a93a" opacity=".7"/>
    <path d="M21 28 L12 24 L22 33 Z" fill="#efe6f7"/>
    <path d="M49 28 L58 24 L48 33 Z" fill="#efe6f7"/>
    <circle cx="35" cy="31" r="16" fill="#efe6f7"/>
    <path d="M19 28 C19 15 27 11 35 11 C43 11 51 15 51 28 C47 20 43 20 39 24 C38 18.6 32 18.6 31 24 C27 20 23 20 19 28 Z" fill="#2e2751"/>
    <ellipse cx="29" cy="31.5" rx="2.3" ry="2.7" fill="#3a2f4e"/><ellipse cx="41" cy="31.5" rx="2.3" ry="2.7" fill="#3a2f4e"/>
    <circle cx="29.7" cy="30.6" r=".8" fill="#fff"/><circle cx="41.7" cy="30.6" r=".8" fill="#fff"/>
    <path d="M25 26.6 Q29 24.8 33 26.6" stroke="#2e2751" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <path d="M45 26.6 Q41 24.8 37 26.6" stroke="#2e2751" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <path d="M30 38.6 Q35 42.6 40 38.6" stroke="#3a2f4e" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M31.4 40 L32.5 43.8 L33.6 40 Z" fill="#fff"/>
    <path d="M36.4 40 L37.5 43.8 L38.6 40 Z" fill="#fff"/>
    <ellipse cx="24" cy="36" rx="2.4" ry="1.6" fill="#e7c6e0" opacity=".85"/>
    <ellipse cx="46" cy="36" rx="2.4" ry="1.6" fill="#e7c6e0" opacity=".85"/>
  </svg></div>`,
	// T24b — Spaventapasseri: goofy straw-brain scarecrow, stitched grin, crooked hat.
	scarecrow: `<div style="width:74px"><svg width="74" height="92" viewBox="0 0 74 92">
    <rect x="35.2" y="33" width="3.6" height="57" rx="1.8" fill="#5b4a71"/>
    <rect x="6" y="51" width="62" height="3.4" rx="1.7" fill="#5b4a71"/>
    <path d="M8 50 C3.4 47.6 0.8 48.6 0.8 51.4 C3.6 52 6.2 52.8 9.6 53.8 Z" fill="#e8a93a"/>
    <path d="M8.6 55 C4.4 56.4 2.4 58.6 1.6 61 C4.4 59.8 6.8 58 9 56.4 Z" fill="#e8a93a" opacity=".8"/>
    <path d="M66 50 C70.6 47.6 73.2 48.6 73.2 51.4 C70.4 52 67.8 52.8 64.4 53.8 Z" fill="#e8a93a"/>
    <path d="M65.4 55 C69.6 56.4 71.6 58.6 72.4 61 C69.6 59.8 67.2 58 65 56.4 Z" fill="#e8a93a" opacity=".8"/>
    <path d="M7.6 51.2 L3 51.6 M6.4 53 L2.4 54 M9 53.6 L4.8 55.6 M8.4 55.6 L4.6 58.4" stroke="#c98a4b" stroke-width=".6" fill="none" stroke-linecap="round" opacity=".7"/>
    <path d="M66.4 51.2 L71 51.6 M67.6 53 L71.6 54 M65 53.6 L69.2 55.6 M65.6 55.6 L69.4 58.4" stroke="#c98a4b" stroke-width=".6" fill="none" stroke-linecap="round" opacity=".7"/>
    <path d="M20 50 C16.4 60 15.8 74 17.6 86 C28 89 46 89 56.4 86 C58.2 74 57.6 60 54 50 Z" fill="#7a5166"/>
    <path d="M20 50 C16.4 60 15.8 74 17.6 86 C21 87 25.5 87.7 31 88.2 C26.5 76 26.5 61 30 50 Z" fill="#6b4760" opacity=".45"/>
    <rect x="39" y="63" width="9.4" height="8.6" rx="2.2" fill="#8a6f9e" transform="rotate(6 43.7 67.3)"/>
    <rect x="39" y="63" width="9.4" height="8.6" rx="2.2" fill="none" stroke="#f0e7fb" stroke-width=".6" stroke-dasharray="1 1.3" opacity=".5" transform="rotate(6 43.7 67.3)"/>
    <rect x="21" y="72" width="8.4" height="7.2" rx="2" fill="#6672df" opacity=".85"/>
    <path d="M22 88.6 L21 85.6 M28 89.4 L27.4 86.2 M34 89.8 L33.8 86.6 M46 86.6 L46.4 89.8" stroke="#e8a93a" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    <circle cx="37" cy="30" r="15" fill="#f2d0a0"/>
    <path d="M37 15 C44 15 50 21 50.6 30 C50.6 36 45 42 37 42 Z" fill="#e0b985" opacity=".5"/>
    <path d="M24 20 C21.4 15 22.4 11 25.4 13 C26.4 15 26 17.6 24 20 Z" fill="#e8a93a"/>
    <path d="M50 20 C52.6 15 51.6 11 48.6 13 C47.6 15 48 17.6 50 20 Z" fill="#e8a93a"/>
    <circle cx="31.4" cy="28.4" r="2.5" fill="#3a2f4e"/>
    <circle cx="30.7" cy="27.8" r=".55" fill="#8d76a8"/><circle cx="32.2" cy="28.9" r=".55" fill="#8d76a8"/>
    <path d="M31.4 26 V26.8 M31.4 30 V30.8 M28.9 28.4 H29.7 M33.1 28.4 H33.9" stroke="#8d76a8" stroke-width=".6" fill="none" stroke-linecap="round"/>
    <circle cx="42.6" cy="28.4" r="1.9" fill="#3a2f4e"/>
    <circle cx="43.2" cy="27.7" r=".6" fill="#fff"/>
    <path d="M37 30.6 L38.4 34 L35.6 34 Z" fill="#c98a4b"/>
    <path d="M37 30.6 L37 33.4" stroke="#e0aa74" stroke-width=".6" fill="none" stroke-linecap="round" opacity=".7"/>
    <path d="M31 36 Q37 40.6 43 36" stroke="#3a2f4e" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M33 37.4 V39.4 M35.6 38.8 V40.8 M39 38.8 V40.8 M41.6 37.4 V39.4" stroke="#3a2f4e" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".85"/>
    <g transform="rotate(-4 37 15)">
    <ellipse cx="37" cy="17" rx="18" ry="5" fill="#ffd166"/>
    <path d="M37 22.4 C28.6 22.4 25.6 19.8 25.6 16.6 C25.6 10 32.6 2 37 2 C41.4 2 48.4 10 48.4 16.6 C48.4 19.8 45.4 22.4 37 22.4 Z" fill="#ffd166"/>
    <path d="M37 2 C41.4 2 48.4 10 48.4 16.6 C48.4 19.8 45.4 22.4 37 22.4 Z" fill="#e8a93a" opacity=".45"/>
    <rect x="25.4" y="13.6" width="23.2" height="4" rx="2" fill="#a86f3a"/>
    </g>
  </svg></div>`
};

/**
 * The prototype's k→archetype map (line 1030), widened to the six-archetype
 * cast (T24b). Positive modulo over `NEIGHBOR_ARCHES.length`, so a negative
 * house index wraps instead of exploding and the street cycles all six.
 */
export function archOf(k: number): NeighborArch {
	return NEIGHBOR_ARCHES[
		((k % NEIGHBOR_ARCHES.length) + NEIGHBOR_ARCHES.length) % NEIGHBOR_ARCHES.length
	];
}

/** The markup for house `k` — what `HouseSlot` splices into its reveal slot. */
export function neighborFor(k: number): string {
	return NEIGHBORS[archOf(k)];
}
