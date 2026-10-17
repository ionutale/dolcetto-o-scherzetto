import { describe, expect, it } from 'vitest';
import { TRICK_ORDER } from '../sim/economy';
import { fanList, showFan, showScherzoButton, tierDots } from './fan-model';
import type { Phase } from '../sim/loop';

/**
 * Pinning suite for the T13 fan model (`fan-model.ts`) — the three decisions
 * `renderHUD()` used to make inline (~1362-1391 of the prototype):
 *
 *   1. the fan lists **owned** tricks, in **catalogue** order, nothing else;
 *   2. each card lights `Math.ceil((idx + 1) / 2)` of the four tier dots;
 *   3. the button and the fan are the two halves of one moment — `refuse`,
 *      closed vs open — and no other phase ever shows either.
 *
 * No randomness, no DOM, no store: every row feeds the helpers plain values.
 */

describe('fanList', () => {
	it('returns the owned tricks in TRICK_ORDER order, whatever order they arrive in', () => {
		// The sim appends tricks as they are bought — the fan never does.
		expect(fanList(['mano', 'boo', 'serpente'])).toEqual(['boo', 'serpente', 'mano']);
		expect(fanList(['topolino', 'maschera', 'cuscino', 'boo'])).toEqual([
			'boo',
			'cuscino',
			'maschera',
			'topolino'
		]);
		// The full catalogue comes back as the catalogue itself.
		expect(fanList([...TRICK_ORDER])).toEqual([...TRICK_ORDER]);
	});

	it('never lists a trick that is not owned', () => {
		const owned = ['boo', 'cuscino'];
		const list = fanList(owned);
		expect(list).toEqual(['boo', 'cuscino']);
		for (const id of TRICK_ORDER) {
			if (!owned.includes(id)) expect(list).not.toContain(id);
		}
		// A single free trick is still a one-card fan, in place.
		expect(fanList(['boo'])).toEqual(['boo']);
	});

	it('filters out ids that are not tricks at all', () => {
		expect(fanList([])).toEqual([]);
		expect(fanList(['ghost', 'boo', 'BOO', '', 'ragnetto-v2'])).toEqual(['boo']);
		// Duplicates collapse: the fan draws each owned trick once.
		expect(fanList(['boo', 'boo', 'mano'])).toEqual(['boo', 'mano']);
	});
});

describe('tierDots', () => {
	// Two tricks per dot across the four gentle power tiers of spec §7.
	const ROWS: Array<[string, number]> = [
		['boo', 1],
		['ragnetto', 1],
		['serpente', 2],
		['cuscino', 2],
		['maschera', 3],
		['topolino', 3],
		['fantasmino', 4],
		['mano', 4]
	];

	it.each(ROWS)('%s lights %i of the four dots', (id, dots) => {
		expect(tierDots(id)).toBe(dots);
		expect(tierDots(id)).toBeGreaterThanOrEqual(1);
		expect(tierDots(id)).toBeLessThanOrEqual(4);
	});

	it('lights nothing for an id outside the ladder', () => {
		expect(tierDots('')).toBe(0);
		expect(tierDots('ghost')).toBe(0);
	});
});

describe('visibility', () => {
	// phase × fanOpen → [button, fan]: refuse+closed is the invitation,
	// refuse+open is the fan, every other cell is neither.
	const MATRIX: Array<[Phase, boolean, boolean, boolean]> = [
		['roam', false, false, false],
		['roam', true, false, false],
		['door', false, false, false],
		['door', true, false, false],
		['collect', false, false, false],
		['collect', true, false, false],
		['refuse', false, true, false],
		['refuse', true, false, true],
		['trick', false, false, false],
		['trick', true, false, false]
	];

	it.each(MATRIX)('phase=%s fanOpen=%s → button=%s fan=%s', (phase, open, button, fan) => {
		expect(showScherzoButton(phase, open)).toBe(button);
		expect(showFan(phase, open)).toBe(fan);
		// The two halves never show at once — the fan replaces its button.
		expect(button && fan).toBe(false);
	});

	it('shows exactly one half somewhere only in the refuse phase', () => {
		const phases: Phase[] = ['roam', 'door', 'collect', 'refuse', 'trick'];
		for (const phase of phases) {
			for (const open of [false, true]) {
				const seen = Number(showScherzoButton(phase, open)) + Number(showFan(phase, open));
				expect(seen).toBe(phase === 'refuse' ? 1 : 0);
			}
		}
	});
});
