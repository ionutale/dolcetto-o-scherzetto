import { describe, expect, it } from 'vitest';
import { BOSS_COPY, BOSS_META, bossArt } from './boss-art';
import { BOSS_ORDER } from './boss-model';

describe('boss art', () => {
	it('builds a standalone svg for every boss', () => {
		for (const id of BOSS_ORDER) {
			const svg = bossArt(id);
			expect(svg.startsWith('<svg')).toBe(true);
			expect(svg.endsWith('</svg>')).toBe(true);
			expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
			expect(svg).toContain('viewBox="0 0 260 280"');
			expect(svg).toContain(`data-boss="${id}"`);
		}
	});

	it('gives every boss a distinct body and both names', () => {
		const arts = BOSS_ORDER.map((id) => bossArt(id));
		expect(new Set(arts).size).toBe(3);
		for (const id of BOSS_ORDER) {
			expect(BOSS_META[id].name.it.length).toBeGreaterThan(0);
			expect(BOSS_META[id].name.en.length).toBeGreaterThan(0);
			expect(BOSS_META[id].id).toBe(id);
		}
	});

	it('ships the IT/EN fight copy', () => {
		expect(BOSS_COPY.it.hint).toBe('Tocca per lanciare caramelle');
		expect(BOSS_COPY.en.hint).toBe('Tap to throw candy');
		expect(BOSS_COPY.it.win.length).toBeGreaterThan(0);
		expect(BOSS_COPY.en.win.length).toBeGreaterThan(0);
	});
});
