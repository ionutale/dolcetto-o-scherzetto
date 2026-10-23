/**
 * T16 — the Bottega panel's pure shape: what the shop lists and how each row
 * reads, lifted out of the DOM so it can be pinned without mounting anything.
 *
 * The prototype decided every row inline in `renderShop()`
 * (`prototypes/scene-prototype.html`, ~1411-1431): it walked `TRICK_ORDER`,
 * looked up the name and the flavour text, then chose one of three shapes —
 * an **owned** row (the `Tuo!` chip, no button), an **affordable** row (price
 * chip + a live buy button), or a **poor** row (greyed price chip + a disabled
 * button). This module is that decision, and only that decision:
 *
 * - `bottegaRows(lang, bag, owned)` — one `BottegaRow` per catalogue id, always
 *   in `TRICK_ORDER` (cheapest first, the same order the fan lists), computed
 *   from the three things the panel can know: the player's language, the bag
 *   and the owned ids. Nothing here reads the store; `Bottega.svelte` passes
 *   what it read through the `shopOpen()`/`bag()`/`tricks()` seams.
 * - the row's `state` mirrors the prototype's own branch exactly, and its
 *   "affordable" half is decided by the **same guard the `BUY` reducer uses**
 *   (`canBuy`), so a row can never offer a purchase the sim would throw away.
 *   The free default `boo` is always the player's (`id === 'boo' || owned`, the
 *   prototype's own condition), so the first trick never shows a buy button.
 *
 * **The copy.** The task owns no i18n file (`src/lib/i18n/lines.ts` was not in
 * its file set), so the shop's strings — the title, the subtitle, the two
 * labels and the seven flavour lines — live here, ported verbatim from the
 * prototype's `L`/`trickDesc` (`~698-726`). They are pure data: no logic reads
 * them at runtime except this module's own `shopCopy`/`trickDesc`, and a later
 * task can lift them into `lines.ts` without touching a caller.
 */
import { TRICK_ORDER, TRICKS, canBuy, priceFor } from '../sim/economy';
import type { TrickId } from '../sim/economy';
import type { Lang } from '../sim/loop';

/** The three shapes a shop row can take (the prototype's three branches). */
export type RowState = 'owned' | 'affordable' | 'poor';

/** One catalogue row, ready to render — the prototype's `renderShop` body. */
export interface BottegaRow {
	id: TrickId;
	/** `TRICKS[id].name` in the player's language (never retyped here). */
	name: string;
	/** The one-line flavour text under the name. */
	desc: string;
	/** Candy price, from `priceFor(id)` (the reducer's own ladder). */
	price: number;
	/** Which of the three shapes this row draws. */
	state: RowState;
}

/** The panel's chrome strings, ported from the prototype's `L` (~698-712). */
export interface ShopCopy {
	title: string;
	sub: string;
	owned: string;
	buy: string;
}

/** The `Tuo!` chip, the buy label and the two headings, per language. */
export const SHOP_COPY: Record<Lang, ShopCopy> = {
	it: {
		title: 'La Bottega della Strega',
		sub: 'Compra trucchi col sacchetto di caramelle.',
		owned: 'Tuo!',
		buy: 'Compra'
	},
	en: {
		title: 'The Witch’s Shop',
		sub: 'Buy tricks with your candy bag.',
		owned: 'Yours!',
		buy: 'Buy'
	}
};

/** The shop's strings in one language — the panel's one copy seam. */
export function shopCopy(lang: Lang): ShopCopy {
	return SHOP_COPY[lang];
}

/**
 * The seven purchasable tricks' flavour lines, ported verbatim from the
 * prototype's `trickDesc` (~716-726). `boo` is not here — it gets its own
 * "always with you" line below.
 */
const TRICK_DESC: Record<Lang, Record<Exclude<TrickId, 'boo'>, string>> = {
	it: {
		ragnetto: 'Un ragnetto di gomma sul pomello',
		serpente: 'Un serpente a molla dalla scatola',
		cuscino: 'Prrrrrt! sotto lo zerbino',
		maschera: 'Una faccia buffa a sorpresa',
		topolino: 'Un topolino a molla che sfreccia',
		fantasmino: 'Un burlone che sale dal secchio',
		mano: 'Una mano pelosa che saluta'
	},
	en: {
		ragnetto: 'A rubber spider on the doorknob',
		serpente: 'A spring snake from a can',
		cuscino: 'Prrrrrt! under the doormat',
		maschera: 'A silly face surprise',
		topolino: 'A wind-up mouse zooming by',
		fantasmino: 'A prankster rising from the bucket',
		mano: 'A furry hand waving hello'
	}
};

/** The free first trick's line — the prototype's special case for `boo`. */
const FREE_DESC: Record<Lang, string> = {
	it: 'Il tuo primo scherzo, sempre con te',
	en: 'Your first trick, always with you'
};

/** The flavour line for one trick, `boo` included. */
export function trickDesc(id: TrickId, lang: Lang): string {
	if (id === 'boo') return FREE_DESC[lang];
	return TRICK_DESC[lang][id];
}

/**
 * The eight shop rows for one (language, bag, owned) — always the full
 * catalogue, always in `TRICK_ORDER`. A row is `owned` when the player already
 * has the trick (or it is the free `boo`); otherwise it is `affordable` exactly
 * when `canBuy` would let the `BUY` reducer through, and `poor` otherwise.
 */
export function bottegaRows(lang: Lang, bag: number, owned: string[]): BottegaRow[] {
	const ownedSet = new Set(owned);
	return TRICK_ORDER.map((id) => {
		const isOwned = id === 'boo' || ownedSet.has(id);
		const state: RowState = isOwned ? 'owned' : canBuy(bag, owned, id) ? 'affordable' : 'poor';
		return {
			id,
			name: TRICKS[id].name[lang] ?? TRICKS[id].name.it,
			desc: trickDesc(id, lang),
			price: priceFor(id),
			state
		};
	});
}

/**
 * Whether the shop is worth opening **right now** (owner feedback): true exactly
 * while at least one trick is unowned and the bag can afford it, false when the
 * bag is short of every unowned price or everything is owned already. Built on
 * the same `canBuy`/`TRICK_ORDER` pair the rows and the `BUY` reducer use, so
 * the beckon can never drift from the purchase guard.
 */
export function inviteToShop(bag: number, owned: string[]): boolean {
	return TRICK_ORDER.some((id) => canBuy(bag, owned, id));
}
