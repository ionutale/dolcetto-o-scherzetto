import { describe, expect, it } from 'vitest';
import { TRICK_ORDER, TRICKS, canBuy, priceFor } from '../sim/economy';
import type { TrickId } from '../sim/economy';
import { SHOP_COPY, bottegaRows, inviteToShop, shopCopy, trickDesc } from './bottega-model';

/**
 * Pinning suite for the T16 Bottega model (`bottega-model.ts`) — the row
 * decision `renderShop()` used to make inline (~1411-1431 of the prototype):
 *
 *   1. the panel lists **all eight** catalogue ids, in `TRICK_ORDER`;
 *   2. a row is `owned` when the trick is the player's (**owned wins over
 *      poor**, however expensive it is) and `boo` is always the player's;
 *   3. otherwise it is `affordable` exactly at the price boundary the `BUY`
 *      reducer would accept (`canBuy`), and `poor` just below it.
 *
 * No DOM, no store, no randomness: every row feeds the builder plain values.
 */

/** The eight rows for a bag, at the default owned set (just the free `boo`). */
const fresh = (bag: number) => bottegaRows('it', bag, ['boo']);

describe('inviteToShop — the 🏪 beckon rule (owner feedback)', () => {
	it('is quiet with an empty bag', () => {
		expect(inviteToShop(0, ['boo'])).toBe(false);
	});

	it('wakes at the cheapest unowned boundary (14 / 15 / 16 for ragnetto)', () => {
		expect(inviteToShop(14, ['boo'])).toBe(false);
		expect(inviteToShop(15, ['boo'])).toBe(true);
		expect(inviteToShop(16, ['boo'])).toBe(true);
	});

	it('ignores tricks the player already owns', () => {
		// A bag that could only afford ragnetto, and ragnetto is owned → quiet.
		expect(inviteToShop(15, ['boo', 'ragnetto'])).toBe(false);
	});

	it('is quiet once everything is bought, however rich', () => {
		expect(inviteToShop(9999, [...TRICK_ORDER])).toBe(false);
	});

	it('agrees with canBuy on every catalogue prefix and bag size', () => {
		for (let n = 1; n <= 8; n++) {
			const owned = ['boo', ...TRICK_ORDER.slice(1, n)];
			for (const bag of [0, 14, 15, 16, 44, 45, 110, 200]) {
				expect(inviteToShop(bag, owned)).toBe(TRICK_ORDER.some((id) => canBuy(bag, owned, id)));
			}
		}
	});
});

describe('bottegaRows — order and shape', () => {
	it('pins the catalogue order — all eight ids, TRICK_ORDER verbatim', () => {
		const rows = fresh(0);
		expect(rows.map((r) => r.id)).toEqual([...TRICK_ORDER]);
		expect(rows).toHaveLength(8);
	});

	it('builds one complete row per catalogue trick (the "all 8 rows" pin)', () => {
		const rows = fresh(1000);
		expect(rows).toHaveLength(TRICK_ORDER.length);
		for (const row of rows) {
			// The name is the catalogue's own, never a retyped copy.
			expect(row.name).toBe(TRICKS[row.id].name.it);
			// The price is the reducer's own ladder.
			expect(row.price).toBe(priceFor(row.id));
			// Every row carries a non-empty flavour line.
			expect(row.desc).toBeTruthy();
			expect(['owned', 'affordable', 'poor']).toContain(row.state);
		}
	});

	it('takes the name and description from the requested language', () => {
		const it = fresh(1000);
		const en = bottegaRows('en', 1000, ['boo']);
		const itRag = it.find((r) => r.id === 'ragnetto');
		const enRag = en.find((r) => r.id === 'ragnetto');
		expect(itRag?.name).toBe('Ragnetto');
		expect(enRag?.name).toBe('Rubber Spider');
		expect(itRag?.desc).toBe('Un ragnetto di gomma sul pomello');
		expect(enRag?.desc).toBe('A rubber spider on the doorknob');
	});
});

describe('bottegaRows — owned wins over poor', () => {
	/** A trick whose price dwarfs the bag, but which the player already owns. */
	const PRICEY: TrickId = 'mano';

	it('marks an owned trick `owned` even when the bag could never afford it', () => {
		const bag = 0;
		const rows = bottegaRows('it', bag, ['boo', PRICEY]);
		const row = rows.find((r) => r.id === PRICEY);
		expect(priceFor(PRICEY)).toBeGreaterThan(bag); // it really is unaffordable…
		expect(row?.state).toBe('owned'); // …and still owned.
	});

	it('always treats the free `boo` as owned, whatever bag or owned list says', () => {
		for (const owned of [[], ['boo'], ['mano']]) {
			for (const bag of [0, 18, 500]) {
				const row = bottegaRows('it', bag, owned).find((r) => r.id === 'boo');
				expect(row?.state).toBe('owned');
				expect(row?.price).toBe(0);
			}
		}
	});

	it('never offers a buy for a row the player owns', () => {
		const owned = ['boo', 'ragnetto', 'serpente'];
		for (const row of bottegaRows('it', 500, owned)) {
			if (owned.includes(row.id)) expect(row.state).toBe('owned');
		}
	});
});

describe('bottegaRows — affordability boundary (ragnetto, price 15)', () => {
	// The reducer's guard is `bag >= price`; the panel must agree exactly.
	const CASES: Array<[number, 'poor' | 'affordable']> = [
		[14, 'poor'],
		[15, 'affordable'],
		[16, 'affordable']
	];

	it.each(CASES)('bag %i → ragnetto %s', (bag, state) => {
		const row = bottegaRows('it', bag, ['boo']).find((r) => r.id === 'ragnetto');
		expect(row?.state).toBe(state);
	});

	it('agrees with canBuy for the whole catalogue at a codifying bag', () => {
		const bag = 45; // exactly cuscino's price, below maschera's
		const owned = ['boo'];
		for (const row of bottegaRows('it', bag, owned)) {
			if (row.id === 'boo') continue;
			const expected = bag >= row.price ? 'affordable' : 'poor';
			expect(row.state).toBe(expected);
		}
	});
});

describe('shop copy', () => {
	it('ships the panel chrome in both languages, IT default', () => {
		expect(shopCopy('it')).toBe(SHOP_COPY.it);
		expect(shopCopy('en')).toBe(SHOP_COPY.en);
		expect(SHOP_COPY.it.title).toBe('La Bottega della Strega');
		expect(SHOP_COPY.en.title).toBe('The Witch’s Shop');
		expect(SHOP_COPY.it.owned).toBe('Tuo!');
		expect(SHOP_COPY.en.owned).toBe('Yours!');
		expect(SHOP_COPY.it.buy).toBe('Compra');
		expect(SHOP_COPY.en.buy).toBe('Buy');
		expect(SHOP_COPY.it.sub).toBe('Compra trucchi col sacchetto di caramelle.');
		expect(SHOP_COPY.en.sub).toBe('Buy tricks with your candy bag.');
		expect(SHOP_COPY.it.sub).not.toMatch(/BALANCE|provvisor/i);
		expect(SHOP_COPY.en.sub).not.toMatch(/BALANCE|provisional/i);
		for (const lang of ['it', 'en'] as const) {
			const c = shopCopy(lang);
			for (const text of [c.title, c.sub, c.owned, c.buy]) expect(text).toBeTruthy();
		}
	});

	it('has a flavour line for every trick in both languages', () => {
		for (const lang of ['it', 'en'] as const) {
			for (const id of TRICK_ORDER) expect(trickDesc(id, lang)).toBeTruthy();
		}
		// `boo` carries its own "always with you" line, not the purchasable table.
		expect(trickDesc('boo', 'it')).toBe('Il tuo primo scherzo, sempre con te');
		expect(trickDesc('boo', 'en')).toBe('Your first trick, always with you');
	});
});
