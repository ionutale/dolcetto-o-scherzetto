import { describe, expect, it } from 'vitest';
import {
	BOSS_FIRST,
	BOSS_COST,
	BOSS_HP,
	BOSS_REWARD,
	BOSS_STEP,
	bossDue,
	bossFor,
	bossMayStart,
	nextBossAtAbove,
	nextBossAtAfterWin,
	normalizeBossProgress
} from './boss-model';

describe('thresholds', () => {
	it('starts at 1000 and walks the 500 grid strictly above the bag', () => {
		expect(nextBossAtAbove(0)).toBe(1000);
		expect(nextBossAtAbove(999)).toBe(1000);
		expect(nextBossAtAbove(1000)).toBe(1500);
		expect(nextBossAtAbove(1060)).toBe(1500);
		expect(nextBossAtAbove(1500)).toBe(2000);
		expect(nextBossAtAbove(5476)).toBe(5500);
	});

	it('floors the post-win threshold at 1500', () => {
		expect(nextBossAtAfterWin(500)).toBe(1500);
		expect(nextBossAtAfterWin(1030)).toBe(1500);
		expect(nextBossAtAfterWin(1530)).toBe(2000);
		expect(nextBossAtAfterWin(5446)).toBe(5500);
	});

	it('is due only when enabled and the bag is at or above the threshold', () => {
		expect(bossDue(999, 1000, true)).toBe(false);
		expect(bossDue(1000, 1000, true)).toBe(true);
		expect(bossDue(1200, 1000, false)).toBe(false);
	});
});

describe('rotation', () => {
	it('cycles zucca, mostro, recaramella and wraps negatives', () => {
		expect(bossFor(0)).toBe('zucca');
		expect(bossFor(1)).toBe('mostro');
		expect(bossFor(2)).toBe('recaramella');
		expect(bossFor(3)).toBe('zucca');
		expect(bossFor(-1)).toBe('recaramella');
	});
});

describe('normalisation', () => {
	it('fills missing fields with the welcome defaults', () => {
		expect(normalizeBossProgress(5416, undefined, undefined)).toEqual({
			nextBossAt: 1000,
			bossWins: 0
		});
	});

	it('keeps a valid threshold and win count', () => {
		expect(normalizeBossProgress(1000, 1500, 2)).toEqual({ nextBossAt: 1500, bossWins: 2 });
	});

	it('repairs a present malformed threshold above the bag, and bad wins to 0', () => {
		expect(normalizeBossProgress(5416, 'soon', 3)).toEqual({ nextBossAt: 5500, bossWins: 3 });
		expect(normalizeBossProgress(0, 1234, -2)).toEqual({ nextBossAt: 1000, bossWins: 0 });
		expect(normalizeBossProgress(0, 1000, 1.5)).toEqual({ nextBossAt: 1000, bossWins: 0 });
	});
});

describe('bossMayStart', () => {
	const base = {
		enabled: true,
		bag: 1000,
		nextBossAt: 1000,
		phase: 'roam' as const,
		shopOpen: false,
		scareActive: false,
		menuOpen: false,
		celebrating: false,
		active: false
	};

	it('starts only in a quiet roam', () => {
		expect(bossMayStart(base)).toBe(true);
		expect(bossMayStart({ ...base, phase: 'door' })).toBe(false);
		expect(bossMayStart({ ...base, shopOpen: true })).toBe(false);
		expect(bossMayStart({ ...base, scareActive: true })).toBe(false);
		expect(bossMayStart({ ...base, menuOpen: true })).toBe(false);
		expect(bossMayStart({ ...base, celebrating: true })).toBe(false);
		expect(bossMayStart({ ...base, active: true })).toBe(false);
		expect(bossMayStart({ ...base, enabled: false })).toBe(false);
		expect(bossMayStart({ ...base, bag: 999 })).toBe(false);
	});
});

describe('pinned knobs', () => {
	it('keeps the agreed fight values', () => {
		expect(BOSS_FIRST).toBe(1000);
		expect(BOSS_STEP).toBe(500);
		expect(BOSS_HP).toBe(30);
		expect(BOSS_COST).toBe(1);
		expect(BOSS_REWARD).toBe(60);
	});
});
