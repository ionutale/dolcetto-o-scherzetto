/**
 * T6 — the three boss bodies and the fight's IT/EN copy.
 *
 * The fight itself is a DOM overlay (`Boss.svelte`) that swaps one of these
 * three static `<svg>` strings in; nothing here knows about timers, the
 * wallet or the stage. The strings are full, standalone SVGs at the overlay's
 * one size (`260 × 280`, the `.boss-art` box in the task-7 layout), so a
 * shower or a second boss can hold two of them without sharing anything.
 *
 * ## Drawing rules
 *
 * The cast answers to `ART-STYLE.md` §3–§4: rounded shapes, no hard outlines,
 * depth from darker-shade fills, palette tokens only. There is also a hard
 * mechanical rule: **no `id` attributes, no `<defs>`** — the overlay may render
 * the same boss twice (a reward shower reusing the art), and duplicate ids
 * would make one copy's fills point at the other's shapes. Gradients are
 * therefore stacked shapes, exactly like `sprites/candleLantern`.
 *
 * The class hooks are the seam the task-7 CSS animates:
 * `boss-body` (idle breath / hit squash), `boss-eye`, `boss-mouth`,
 * `boss-crown` (the win spin), `boss-arm-l` / `boss-arm-r` (the happy wave).
 * The arms keep an inline `transform-origin` at the shoulder, like the sprite
 * pack's `.arm` elements, so a CSS rotation swings from the body and not from
 * the middle of the limb. `Mostro` has no literal crown: its horns are the
 * headgear and carry the same `boss-crown` hook, so the win spin exists on
 * every boss and task-7's CSS needs no per-boss branch.
 *
 * ## The cast
 *
 * - `zucca` — a wide jack-o'-lantern: orange lobes, green stem and vine,
 *   amber crown, glowing carved eyes, a huge toothy grin and little purple
 *   shoes. Round and squat: the silhouette is a pumpkin.
 * - `mostro` — a lavender fur egg: pale belly, cream horns, big friendly eyes
 *   and a long pink tongue lolling over the belly. Tall and fluffy: the
 *   silhouette is a monster.
 * - `recaramella` — a small berry king: wrapper-cut cape, lollipop epaulettes,
 *   cream face and an amber candy crown. Wide at the shoulders: the silhouette
 *   is royalty.
 */
import type { BossId } from './boss-model';
import type { Lang } from '$lib/sim/loop';

/** The fight's chrome strings, one object per language. */
export interface BossCopy {
	hint: string;
	win: string;
	reward: string;
	throwLabel: string;
}

/** Display names, keyed like the cast. */
export const BOSS_META: Record<BossId, { id: BossId; name: Record<Lang, string> }> = {
	zucca: { id: 'zucca', name: { it: 'Grande Zucca', en: 'Great Pumpkin' } },
	mostro: { id: 'mostro', name: { it: 'Mostro Goloso', en: 'Sweet-Tooth Monster' } },
	recaramella: { id: 'recaramella', name: { it: 'Re Caramella', en: 'Candy King' } }
};

/** The overlay's four strings per language. */
export const BOSS_COPY: Record<Lang, BossCopy> = {
	it: {
		hint: 'Tocca per lanciare caramelle',
		win: 'Bravissimo!',
		reward: '+60 caramelle',
		throwLabel: 'Lancia una caramella'
	},
	en: {
		hint: 'Tap to throw candy',
		win: 'You did it!',
		reward: '+60 candies',
		throwLabel: 'Throw a candy'
	}
};

/* palette — the world pack's tokens, plus two dark berry shades for the king */
const P = {
	ink: '#3a2f4e',
	shadow: '#0a061e',
	amber: '#ffd166',
	amberDeep: '#e8a93a',
	amberLite: '#ffe08a',
	moon: '#fff6dd',
	moonSoft: '#ffeccf',
	glow: '#ffd9a0',
	pumpkin: '#ff9e57',
	pumpkinDeep: '#e8874a',
	pumpkinLite: '#ffb27a',
	stem: '#7fb069',
	stemLite: '#95c47d',
	stemDeep: '#5f8a55',
	plum: '#59406b',
	plumLite: '#6b5785',
	fur: '#9a8fc0',
	furDeep: '#887bb0',
	furLite: '#cbbfdd',
	belly: '#e4dbf2',
	bellyDeep: '#d3c7ea',
	skin: '#ffd9b8',
	skinDeep: '#e8c49f',
	cream: '#ffeccf',
	creamDeep: '#f6d3b4',
	pink: '#ff9ec7',
	pinkDeep: '#e87ba8',
	berry: '#a34d76',
	berryLite: '#c46b93',
	berryDeep: '#7e3a5c',
	berryDark: '#6d3253',
	sky: '#7fd7ff',
	blush: '#ffb8a8'
} as const;

/** Wrap the parts in the overlay's one root shape. No ids, no defs. */
function svg(id: BossId, parts: string[]): string {
	return (
		'<svg xmlns="http://www.w3.org/2000/svg" width="260" height="280" viewBox="0 0 260 280" data-boss="' +
		id +
		'" aria-hidden="true">' +
		parts.join('') +
		'</svg>'
	);
}

/** The soft contact shadow under every boss (the overlay sits on the night stage). */
function ground(): string {
	return '<ellipse cx="130" cy="265" rx="72" ry="12" fill="' + P.shadow + '" opacity=".32"/>';
}

/* ========================================================================
 * ZUCCA — Grande Zucca
 * ===================================================================== */
function zucca(): string {
	const parts: string[] = [];

	parts.push(ground());
	/* shoes peek out from under the pumpkin */
	parts.push(
		'<ellipse cx="98" cy="262" rx="22" ry="11" fill="' +
			P.plum +
			'"/>' +
			'<ellipse cx="162" cy="262" rx="22" ry="11" fill="' +
			P.plum +
			'"/>' +
			'<ellipse cx="94" cy="259" rx="9" ry="4.5" fill="' +
			P.plumLite +
			'" opacity=".7"/>' +
			'<ellipse cx="158" cy="259" rx="9" ry="4.5" fill="' +
			P.plumLite +
			'" opacity=".7"/>'
	);

	/* stem + leaf, drawn before the body so their bases tuck behind it */
	parts.push(
		'<path d="M136 112 C132 86 137 60 150 44 C156 37 164 40 162 50 C158 72 153 92 153 112 Z" fill="' +
			P.stem +
			'"/>' +
			'<path d="M143 108 C142 86 146 66 154 52" stroke="' +
			P.stemLite +
			'" stroke-width="5" fill="none" stroke-linecap="round" opacity=".85"/>' +
			'<path d="M158 52 C171 39 187 43 191 56 C179 65 164 63 158 52 Z" fill="' +
			P.stemLite +
			'"/>' +
			'<path d="M162 55 C171 51 180 52 186 56" stroke="' +
			P.stemDeep +
			'" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>'
	);

	/* the pumpkin: one round body, lobes shaded with darker curved shapes */
	parts.push(
		'<ellipse class="boss-body" cx="130" cy="178" rx="92" ry="82" fill="' +
			P.pumpkin +
			'"/>' +
			'<path d="M130 98 C112 132 112 226 130 258" stroke="' +
			P.pumpkinDeep +
			'" stroke-width="4" fill="none" stroke-linecap="round" opacity=".38"/>' +
			'<path d="M130 98 C148 132 148 226 130 258" stroke="' +
			P.pumpkinDeep +
			'" stroke-width="4" fill="none" stroke-linecap="round" opacity=".38"/>' +
			'<path d="M94 106 C76 140 76 220 96 250" stroke="' +
			P.pumpkinDeep +
			'" stroke-width="3" fill="none" stroke-linecap="round" opacity=".22"/>' +
			'<path d="M166 106 C184 140 184 220 164 250" stroke="' +
			P.pumpkinDeep +
			'" stroke-width="3" fill="none" stroke-linecap="round" opacity=".22"/>' +
			'<ellipse cx="84" cy="148" rx="18" ry="28" fill="' +
			P.pumpkinLite +
			'" opacity=".32" transform="rotate(-22 84 148)"/>' +
			'<ellipse cx="130" cy="250" rx="74" ry="20" fill="' +
			P.pumpkinDeep +
			'" opacity=".22"/>'
	);

	/* amber crown, tilted a touch so it reads as worn, not glued on */
	parts.push(
		'<g class="boss-crown" transform="rotate(-3 124 100)">' +
			'<path d="M84 112 L90 72 L108 90 L124 64 L140 90 L158 72 L164 112 Z" fill="' +
			P.amber +
			'"/>' +
			'<path d="M124 64 L140 90 L158 72 L164 112 L124 112 Z" fill="' +
			P.amberDeep +
			'" opacity=".38"/>' +
			'<circle cx="90" cy="68" r="5" fill="' +
			P.amberLite +
			'"/><circle cx="124" cy="60" r="5.5" fill="' +
			P.amberLite +
			'"/><circle cx="158" cy="68" r="5" fill="' +
			P.amberLite +
			'"/>' +
			'<rect x="80" y="106" width="88" height="18" rx="9" fill="' +
			P.amber +
			'"/>' +
			'<rect x="84" y="116" width="80" height="8" rx="4" fill="' +
			P.amberDeep +
			'" opacity=".45"/>' +
			'<circle cx="124" cy="115" r="6" fill="' +
			P.pink +
			'"/>' +
			'<circle cx="122" cy="113" r="2" fill="#fff" opacity=".8"/>' +
			'</g>'
	);

	/* face: glowing carved sockets, a button nose, a huge grin */
	parts.push(
		'<g class="boss-eye">' +
			'<ellipse cx="98" cy="158" rx="23" ry="21" fill="' +
			P.amberLite +
			'"/>' +
			'<ellipse cx="162" cy="158" rx="23" ry="21" fill="' +
			P.amberLite +
			'"/>' +
			'<ellipse cx="98" cy="159" rx="11" ry="12" fill="' +
			P.ink +
			'"/>' +
			'<ellipse cx="162" cy="159" rx="11" ry="12" fill="' +
			P.ink +
			'"/>' +
			'<circle cx="93" cy="153" r="4.4" fill="#fff"/>' +
			'<circle cx="157" cy="153" r="4.4" fill="#fff"/>' +
			'<circle cx="103" cy="165" r="2" fill="#fff" opacity=".65"/>' +
			'<circle cx="167" cy="165" r="2" fill="#fff" opacity=".65"/>' +
			'</g>' +
			'<ellipse cx="74" cy="188" rx="14" ry="8" fill="' +
			P.blush +
			'" opacity=".7"/>' +
			'<ellipse cx="186" cy="188" rx="14" ry="8" fill="' +
			P.blush +
			'" opacity=".7"/>' +
			'<ellipse cx="130" cy="184" rx="7" ry="5" fill="' +
			P.pumpkinDeep +
			'" opacity=".85"/>'
	);
	parts.push(
		'<g class="boss-mouth">' +
			'<path d="M82 194 C100 204 160 204 178 194 C174 226 152 240 130 240 C108 240 86 226 82 194 Z" fill="' +
			P.ink +
			'"/>' +
			'<ellipse cx="130" cy="228" rx="25" ry="9" fill="' +
			P.pink +
			'"/>' +
			'<path d="M116 229 C122 233 138 233 144 229" stroke="' +
			P.pinkDeep +
			'" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>' +
			'<path d="M94 200 L110 204 L106 218 L92 212 Z" fill="' +
			P.moon +
			'"/>' +
			'<path d="M166 200 L150 204 L154 218 L168 212 Z" fill="' +
			P.moon +
			'"/>' +
			'<path d="M120 205 L140 205 L136 219 L124 219 Z" fill="' +
			P.moon +
			'"/>' +
			'<path d="M95 203 L107 206" stroke="' +
			P.moonSoft +
			'" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>' +
			'</g>'
	);

	/* stubby arms, pivoting at the shoulder */
	parts.push(
		'<g class="boss-arm-l" style="transform-origin:44px 178px">' +
			'<ellipse cx="34" cy="198" rx="15" ry="25" fill="' +
			P.pumpkin +
			'" transform="rotate(24 34 198)"/>' +
			'<ellipse cx="30" cy="194" rx="6" ry="12" fill="' +
			P.pumpkinLite +
			'" opacity=".4" transform="rotate(24 30 194)"/>' +
			'<circle cx="20" cy="214" r="11" fill="' +
			P.pumpkinLite +
			'"/>' +
			'</g>' +
			'<g class="boss-arm-r" style="transform-origin:216px 178px">' +
			'<ellipse cx="226" cy="198" rx="15" ry="25" fill="' +
			P.pumpkin +
			'" transform="rotate(-24 226 198)"/>' +
			'<ellipse cx="230" cy="194" rx="6" ry="12" fill="' +
			P.pumpkinLite +
			'" opacity=".4" transform="rotate(-24 230 194)"/>' +
			'<circle cx="240" cy="214" r="11" fill="' +
			P.pumpkinLite +
			'"/>' +
			'</g>'
	);

	return svg('zucca', parts);
}

/* ========================================================================
 * MOSTRO — Mostro Goloso
 * ===================================================================== */
function mostro(): string {
	const parts: string[] = [];

	parts.push(ground());

	/* feet under the fur */
	parts.push(
		'<ellipse cx="94" cy="258" rx="25" ry="14" fill="' +
			P.furDeep +
			'"/>' +
			'<ellipse cx="166" cy="258" rx="25" ry="14" fill="' +
			P.furDeep +
			'"/>' +
			'<ellipse cx="94" cy="261" rx="13" ry="6" fill="' +
			P.furLite +
			'" opacity=".8"/>' +
			'<ellipse cx="166" cy="261" rx="13" ry="6" fill="' +
			P.furLite +
			'" opacity=".8"/>'
	);

	/* horns first, wrapping the head like a spiky crown: their bases hide under
	   the fur tufts. `boss-crown` on the group keeps the win-spin hook total. */
	parts.push(
		'<g class="boss-crown">' +
			'<path d="M96 94 C87 74 89 48 100 36 C107 53 111 73 113 92 Z" fill="' +
			P.skin +
			'"/>' +
			'<path d="M100 36 C107 53 111 73 113 92 L105 92 C103 72 100 53 96 42 Z" fill="' +
			P.skinDeep +
			'" opacity=".55"/>' +
			'<path d="M164 94 C173 74 171 48 160 36 C153 53 149 73 147 92 Z" fill="' +
			P.skin +
			'"/>' +
			'<path d="M160 36 C153 53 149 73 147 92 L155 92 C157 72 160 53 164 42 Z" fill="' +
			P.skinDeep +
			'" opacity=".55"/>' +
			'</g>'
	);

	/* body + fur tufts: separate same-fill shapes merge into one fluffy edge */
	parts.push(
		'<g class="boss-body">' +
			'<path d="M130 256 C96 256 72 240 66 208 C60 176 60 142 70 118 C80 94 100 80 130 80 C160 80 180 94 190 118 C200 142 200 176 194 208 C188 240 164 256 130 256 Z" fill="' +
			P.fur +
			'"/>' +
			'<circle cx="88" cy="88" r="15" fill="' +
			P.fur +
			'"/><circle cx="108" cy="77" r="17" fill="' +
			P.fur +
			'"/><circle cx="130" cy="72" r="17" fill="' +
			P.fur +
			'"/><circle cx="152" cy="77" r="17" fill="' +
			P.fur +
			'"/><circle cx="172" cy="88" r="15" fill="' +
			P.fur +
			'"/>' +
			'<circle cx="68" cy="130" r="11" fill="' +
			P.fur +
			'"/><circle cx="192" cy="130" r="11" fill="' +
			P.fur +
			'"/><circle cx="64" cy="160" r="9" fill="' +
			P.fur +
			'"/><circle cx="196" cy="160" r="9" fill="' +
			P.fur +
			'"/>' +
			/* right-side fur shading */
			'<path d="M160 86 C180 98 190 128 192 160 C194 188 186 216 168 238 C184 218 194 188 192 160 C190 128 180 100 160 86 Z" fill="' +
			P.furDeep +
			'" opacity=".35"/>' +
			/* pale belly */
			'<ellipse cx="130" cy="208" rx="50" ry="44" fill="' +
			P.belly +
			'"/>' +
			'<ellipse cx="130" cy="220" rx="36" ry="27" fill="' +
			P.bellyDeep +
			'" opacity=".7"/>' +
			'<path d="M96 176 C106 184 154 184 164 176" stroke="' +
			P.bellyDeep +
			'" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".55"/>' +
			'</g>'
	);

	/* face */
	parts.push(
		'<g class="boss-eye">' +
			'<ellipse cx="104" cy="130" rx="17" ry="18" fill="' +
			P.moon +
			'"/>' +
			'<ellipse cx="156" cy="130" rx="17" ry="18" fill="' +
			P.moon +
			'"/>' +
			'<ellipse cx="104" cy="132" rx="9" ry="10" fill="' +
			P.ink +
			'"/>' +
			'<ellipse cx="156" cy="132" rx="9" ry="10" fill="' +
			P.ink +
			'"/>' +
			'<circle cx="100" cy="127" r="4" fill="#fff"/>' +
			'<circle cx="152" cy="127" r="4" fill="#fff"/>' +
			'<circle cx="108" cy="136" r="1.8" fill="#fff" opacity=".7"/>' +
			'<circle cx="160" cy="136" r="1.8" fill="#fff" opacity=".7"/>' +
			'</g>' +
			'<ellipse cx="80" cy="152" rx="12" ry="7" fill="' +
			P.blush +
			'" opacity=".65"/>' +
			'<ellipse cx="180" cy="152" rx="12" ry="7" fill="' +
			P.blush +
			'" opacity=".65"/>'
	);

	/* the grin and the long tongue — the boss's whole personality */
	parts.push(
		'<g class="boss-mouth">' +
			'<path d="M96 162 C108 156 152 156 164 162 C160 184 148 193 130 193 C112 193 100 184 96 162 Z" fill="' +
			P.ink +
			'"/>' +
			'<path d="M116 180 C112 198 113 216 123 226 C130 233 140 231 142 222 C145 210 139 196 144 180 Z" fill="' +
			P.pink +
			'"/>' +
			'<path d="M130 184 C128 198 128 214 132 225" stroke="' +
			P.pinkDeep +
			'" stroke-width="3" fill="none" stroke-linecap="round" opacity=".75"/>' +
			'<ellipse cx="123" cy="201" rx="3.6" ry="8" fill="#ffc4dd" opacity=".7"/>' +
			'<path d="M104 164 L112 164 L108 174 Z" fill="' +
			P.moon +
			'"/>' +
			'<path d="M156 164 L148 164 L152 174 Z" fill="' +
			P.moon +
			'"/>' +
			'</g>'
	);

	/* stubby arms with pale paws */
	parts.push(
		'<g class="boss-arm-l" style="transform-origin:76px 180px">' +
			'<ellipse cx="55" cy="200" rx="16" ry="27" fill="' +
			P.fur +
			'" transform="rotate(18 55 200)"/>' +
			'<circle cx="46" cy="224" r="13" fill="' +
			P.furLite +
			'"/>' +
			'<circle cx="46" cy="226" r="7" fill="' +
			P.furDeep +
			'" opacity=".35"/>' +
			'</g>' +
			'<g class="boss-arm-r" style="transform-origin:184px 180px">' +
			'<ellipse cx="205" cy="200" rx="16" ry="27" fill="' +
			P.fur +
			'" transform="rotate(-18 205 200)"/>' +
			'<circle cx="214" cy="224" r="13" fill="' +
			P.furLite +
			'"/>' +
			'<circle cx="214" cy="226" r="7" fill="' +
			P.furDeep +
			'" opacity=".35"/>' +
			'</g>'
	);

	return svg('mostro', parts);
}

/* ========================================================================
 * RECARAMELLA — Re Caramella
 * ===================================================================== */
function recaramella(): string {
	const parts: string[] = [];

	parts.push(ground());

	/* little berry shoes under the robe */
	parts.push(
		'<ellipse cx="110" cy="258" rx="19" ry="10" fill="' +
			P.berryDark +
			'"/>' +
			'<ellipse cx="150" cy="258" rx="19" ry="10" fill="' +
			P.berryDark +
			'"/>' +
			'<rect x="103" y="251" width="14" height="5" rx="2.5" fill="' +
			P.amber +
			'" opacity=".85"/>' +
			'<rect x="143" y="251" width="14" height="5" rx="2.5" fill="' +
			P.amber +
			'" opacity=".85"/>'
	);

	/* berry wrapper cape: wide flare, zigzag hem, twisted ends at both sides */
	parts.push(
		'<path d="M100 120 C82 150 66 190 58 228 L82 216 L100 242 L130 226 L160 242 L178 216 L202 228 C194 190 178 150 160 120 Z" fill="' +
			P.berry +
			'"/>' +
			'<path d="M160 120 C178 150 194 190 202 228 L178 216 L160 242 L130 226 L130 126 Z" fill="' +
			P.berryDeep +
			'" opacity=".35"/>' +
			'<path d="M64 206 C50 198 38 204 32 216 C44 224 58 222 68 214 Z" fill="' +
			P.berryLite +
			'"/>' +
			'<path d="M196 206 C210 198 222 204 228 216 C216 224 202 222 192 214 Z" fill="' +
			P.berryLite +
			'"/>' +
			'<path d="M48 208 C41 210 35 213 32 216 M212 208 C219 210 225 213 228 216" stroke="' +
			P.berryDeep +
			'" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".55"/>' +
			'<path d="M80 218 C88 228 96 232 104 234 M180 218 C172 228 164 232 156 234" stroke="' +
			P.berryDark +
			'" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".45"/>'
	);

	/* lollipop epaulettes: the sticks angle out past the robe so they read */
	parts.push(
		'<rect x="66" y="158" width="7" height="42" rx="3.5" fill="#e8d9c0" transform="rotate(28 69 162)"/>' +
			'<rect x="187" y="158" width="7" height="42" rx="3.5" fill="#e8d9c0" transform="rotate(-28 191 162)"/>' +
			'<circle cx="72" cy="140" r="22" fill="' +
			P.pink +
			'"/>' +
			'<path d="M72 118 A22 22 0 0 1 94 140 A22 22 0 0 0 72 118 Z" fill="' +
			P.pinkDeep +
			'" opacity=".4"/>' +
			'<path d="M72 122 A18 18 0 0 1 90 140 A12 12 0 0 0 72 128 A6.5 6.5 0 0 1 79 140" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"/>' +
			'<circle cx="188" cy="140" r="22" fill="' +
			P.sky +
			'"/>' +
			'<path d="M188 118 A22 22 0 0 1 210 140 A22 22 0 0 0 188 118 Z" fill="' +
			P.ink +
			'" opacity=".16"/>' +
			'<path d="M188 122 A18 18 0 0 1 206 140 A12 12 0 0 0 188 128 A6.5 6.5 0 0 1 195 140" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"/>'
	);

	/* robe body: a rounded bell with a gold hem and candy buttons */
	parts.push(
		'<g class="boss-body">' +
			'<path d="M130 132 C112 132 96 150 90 176 C86 198 86 222 90 244 C104 252 156 252 170 244 C174 222 174 198 170 176 C164 150 148 132 130 132 Z" fill="' +
			P.berryDeep +
			'"/>' +
			'<path d="M130 132 C112 132 96 150 90 176 C86 198 86 222 90 244 C102 250 120 252 130 252 L130 132 Z" fill="' +
			P.berry +
			'" opacity=".55"/>' +
			'<path d="M108 138 C116 148 144 148 152 138 C150 128 110 128 108 138 Z" fill="' +
			P.cream +
			'"/>' +
			'<circle cx="130" cy="143" r="5" fill="' +
			P.amber +
			'"/>' +
			'<circle cx="128.4" cy="141.4" r="1.7" fill="#fff" opacity=".8"/>' +
			'<rect x="94" y="198" width="72" height="9" rx="4.5" fill="' +
			P.berryDark +
			'"/>' +
			'<rect x="121" y="194" width="18" height="17" rx="4" fill="' +
			P.amber +
			'"/>' +
			'<rect x="126" y="198" width="8" height="9" rx="2" fill="' +
			P.berryDark +
			'"/>' +
			'<rect x="90" y="236" width="80" height="10" rx="5" fill="' +
			P.amber +
			'"/>' +
			'<rect x="94" y="240" width="72" height="4" rx="2" fill="' +
			P.amberDeep +
			'" opacity=".5"/>' +
			'<circle cx="130" cy="216" r="6" fill="' +
			P.pink +
			'"/>' +
			'<circle cx="130" cy="230" r="5" fill="' +
			P.sky +
			'"/>' +
			'</g>'
	);

	/* face: cream, round, pleased */
	parts.push(
		'<circle cx="130" cy="104" r="42" fill="' +
			P.cream +
			'"/>' +
			'<path d="M130 62 A42 42 0 0 1 172 104 C172 127 154 146 130 146 Z" fill="' +
			P.creamDeep +
			'" opacity=".45"/>' +
			'<g class="boss-eye">' +
			'<ellipse cx="112" cy="100" rx="10" ry="12" fill="' +
			P.ink +
			'"/>' +
			'<ellipse cx="148" cy="100" rx="10" ry="12" fill="' +
			P.ink +
			'"/>' +
			'<circle cx="108.5" cy="95.5" r="3.4" fill="#fff"/>' +
			'<circle cx="144.5" cy="95.5" r="3.4" fill="#fff"/>' +
			'<circle cx="115" cy="104" r="1.6" fill="#fff" opacity=".65"/>' +
			'<circle cx="151" cy="104" r="1.6" fill="#fff" opacity=".65"/>' +
			'</g>' +
			'<ellipse cx="94" cy="118" rx="10" ry="6" fill="' +
			P.blush +
			'" opacity=".7"/>' +
			'<ellipse cx="166" cy="118" rx="10" ry="6" fill="' +
			P.blush +
			'" opacity=".7"/>' +
			'<ellipse cx="130" cy="112" rx="5" ry="3.6" fill="' +
			P.skinDeep +
			'" opacity=".6"/>' +
			'<g class="boss-mouth">' +
			'<path d="M116 122 Q130 136 144 122" stroke="' +
			P.ink +
			'" stroke-width="4" fill="none" stroke-linecap="round"/>' +
			'<path d="M123 125 Q130 132 137 125" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".5"/>' +
			'</g>'
	);

	/* amber candy crown on the cream head */
	parts.push(
		'<g class="boss-crown" transform="rotate(-2 130 54)">' +
			'<path d="M100 56 L104 26 L118 40 L130 20 L142 40 L156 26 L160 56 Z" fill="' +
			P.amber +
			'"/>' +
			'<path d="M130 20 L142 40 L156 26 L160 56 L130 56 Z" fill="' +
			P.amberDeep +
			'" opacity=".38"/>' +
			'<circle cx="104" cy="22" r="5" fill="' +
			P.pink +
			'"/>' +
			'<circle cx="130" cy="16" r="5.5" fill="' +
			P.sky +
			'"/>' +
			'<circle cx="156" cy="22" r="5" fill="' +
			P.pink +
			'"/>' +
			'<rect x="98" y="52" width="64" height="16" rx="8" fill="' +
			P.amber +
			'"/>' +
			'<rect x="101" y="61" width="58" height="6" rx="3" fill="' +
			P.amberDeep +
			'" opacity=".45"/>' +
			'<circle cx="112" cy="60" r="3" fill="' +
			P.cream +
			'" opacity=".9"/>' +
			'<circle cx="130" cy="60" r="3.4" fill="' +
			P.cream +
			'"/>' +
			'<circle cx="148" cy="60" r="3" fill="' +
			P.cream +
			'" opacity=".9"/>' +
			'</g>'
	);

	/* small sleeves + cream hands */
	parts.push(
		'<g class="boss-arm-l" style="transform-origin:96px 166px">' +
			'<ellipse cx="88" cy="188" rx="12" ry="19" fill="' +
			P.berryDeep +
			'" transform="rotate(12 88 188)"/>' +
			'<circle cx="82" cy="207" r="9" fill="' +
			P.cream +
			'"/>' +
			'</g>' +
			'<g class="boss-arm-r" style="transform-origin:164px 166px">' +
			'<ellipse cx="172" cy="188" rx="12" ry="19" fill="' +
			P.berryDeep +
			'" transform="rotate(-12 172 188)"/>' +
			'<circle cx="178" cy="207" r="9" fill="' +
			P.cream +
			'"/>' +
			'</g>'
	);

	return svg('recaramella', parts);
}

const BUILDERS: Record<BossId, () => string> = { zucca, mostro, recaramella };

/** The full standalone `<svg>` for one boss, at the overlay's 260 × 280 box. */
export function bossArt(id: BossId): string {
	return BUILDERS[id]();
}
