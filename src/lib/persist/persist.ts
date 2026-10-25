/**
 * The localStorage mirror of the run — the game's only save slot
 * (ADR-0006: local-only, no backend, autosaved after every change).
 *
 * Schema **v2** adds session street memory (done homes), the candy album, and
 * unlockable cosmetics. A v1 payload is migrated on read so older devices
 * keep their bag/tricks/furthest without a wipe.
 *
 * v2 also carries the candy boss's progress: the next threshold and the win
 * count. **No v2 payload shipped before the boss** — the base game autosaved
 * the v1 literal, so the installed population is v1 and comes in through
 * `migrateRunV1`. The boss fields stay optional anyway so a v2 payload that
 * omits them (an older export, a hand-edited copy) is filled with the welcome
 * defaults on read, and a malformed value is repaired rather than wiping the
 * run.
 *
 * **Nothing here ever throws.** localStorage is hostile in the wild — Safari
 * private mode throws on every access, a full quota throws on write, and a
 * half-written or hand-edited value throws on parse. Every one of those paths
 * degrades to "no save": `read()` returns `null` and `write()`/`clear()` stay
 * silent.
 */

import { BOSS_FIRST, normalizeBossProgress } from '$lib/play/boss-model';

/** The one key the run owns in localStorage. */
export const RUN_KEY = 'dos.run.v1';

/** Current schema version written by `write()`. */
export const RUN_VERSION = 2 as const;

/** Candy skins the album counts (mirrors `CANDY_TYPES` in loop.ts). */
export const ALBUM_TYPES = ['lolli', 'gummy', 'choco', 'toffee', 'corn', 'star'] as const;
export type AlbumType = (typeof ALBUM_TYPES)[number];

/** Unlockable cosmetics (Bottega cape for now). */
export const COSMETIC_IDS = ['cape'] as const;
export type CosmeticId = (typeof COSMETIC_IDS)[number];

/** One completed home, serialised with a numeric house index. */
export interface SavedHome {
	done: boolean;
	used: boolean;
	kind: 'treat' | 'scherzo';
}

/**
 * What survives a reload (v2).
 */
export interface RunState {
	version: 2;
	bag: number;
	record: number;
	tricks: string[];
	furthestK: number;
	/** Done / used homes by house index (string keys in JSON). */
	homes: Record<string, SavedHome>;
	/** Per-type collected counts this device (monotonic within a wipe). */
	album: Record<AlbumType, number>;
	/** Owned cosmetics (`cape`, …). */
	cosmetics: string[];
	/**
	 * Bag threshold for the next boss (1 000, 1 500, 2 000 …).
	 *
	 * Optional so a v2 payload that omits it (an older export or a hand edit)
	 * is filled with the welcome default instead of being refused.
	 * `normalizeRun` also repairs junk.
	 */
	nextBossAt?: number;
	/** Boss fights won this run (drives the rotation). Optional, as above. */
	bossWins?: number;
}

/** Empty album — every type at 0. */
export function emptyAlbum(): Record<AlbumType, number> {
	const album = {} as Record<AlbumType, number>;
	for (const t of ALBUM_TYPES) album[t] = 0;
	return album;
}

function isFiniteNumber(v: unknown): v is number {
	return typeof v === 'number' && Number.isFinite(v);
}

function isSavedHome(v: unknown): v is SavedHome {
	if (typeof v !== 'object' || v === null) return false;
	const h = v as Partial<SavedHome>;
	return (
		typeof h.done === 'boolean' &&
		typeof h.used === 'boolean' &&
		(h.kind === 'treat' || h.kind === 'scherzo')
	);
}

function isAlbum(v: unknown): v is Record<AlbumType, number> {
	if (typeof v !== 'object' || v === null) return false;
	const a = v as Record<string, unknown>;
	return ALBUM_TYPES.every((t) => isFiniteNumber(a[t]) && (a[t] as number) >= 0);
}

/**
 * True for a v2 run the sim can boot. Foreign versions (except migratable v1)
 * are refused by `read()` after migration attempt.
 *
 * The boss fields are deliberately **not** checked: `normalizeRun` repairs
 * them, and a missing value is a legal v2 payload without boss progress.
 * Validating them here would turn a hostile threshold into a wiped run — the
 * normaliser's job is to keep the bag and fix the boss.
 */
export function isRunState(value: unknown): value is RunState {
	if (typeof value !== 'object' || value === null) return false;
	const state = value as Partial<RunState>;
	if (state.version !== RUN_VERSION) return false;
	if (
		!isFiniteNumber(state.bag) ||
		!isFiniteNumber(state.record) ||
		!isFiniteNumber(state.furthestK)
	)
		return false;
	if (!Array.isArray(state.tricks) || !state.tricks.every((t) => typeof t === 'string'))
		return false;
	if (!Array.isArray(state.cosmetics) || !state.cosmetics.every((c) => typeof c === 'string'))
		return false;
	if (!isAlbum(state.album)) return false;
	if (typeof state.homes !== 'object' || state.homes === null) return false;
	for (const home of Object.values(state.homes)) {
		if (!isSavedHome(home)) return false;
	}
	return true;
}

/** Lift a legacy v1 payload into v2 (empty street memory / album / cosmetics). */
export function migrateRunV1(value: unknown): RunState | null {
	if (typeof value !== 'object' || value === null) return null;
	const s = value as Record<string, unknown>;
	if (s.version !== 1) return null;
	if (!isFiniteNumber(s.bag) || !isFiniteNumber(s.record) || !isFiniteNumber(s.furthestK))
		return null;
	if (!Array.isArray(s.tricks) || !s.tricks.every((t) => typeof t === 'string')) return null;
	return {
		version: 2,
		bag: s.bag,
		record: s.record,
		tricks: s.tricks as string[],
		furthestK: s.furthestK,
		homes: {},
		album: emptyAlbum(),
		cosmetics: [],
		// A v1 run never met the boss: welcome cadence, no wins.
		nextBossAt: BOSS_FIRST,
		bossWins: 0
	};
}

/**
 * Parse any stored payload into a v2 run, or null.
 *
 * Accepted v2 payloads are normalised, not just returned: the boss fields are
 * filled (a v2 payload without them) or repaired (junk values) so `read()`
 * always hands the sim a playable threshold.
 */
export function normalizeRun(value: unknown): RunState | null {
	if (isRunState(value)) {
		return { ...value, ...normalizeBossProgress(value.bag, value.nextBossAt, value.bossWins) };
	}
	return migrateRunV1(value);
}

export interface Persist {
	read(): RunState | null;
	write(state: RunState): void;
	clear(): void;
}

export function createPersist(storage: Storage | null): Persist {
	function read(): RunState | null {
		if (!storage) return null;
		let raw: string | null;
		try {
			raw = storage.getItem(RUN_KEY);
		} catch {
			return null;
		}
		if (raw === null) return null;
		try {
			return normalizeRun(JSON.parse(raw));
		} catch {
			return null;
		}
	}

	return {
		read,

		write(state: RunState): void {
			if (!storage) return;
			try {
				storage.setItem(RUN_KEY, JSON.stringify(state));
			} catch {
				/* quota — keep playing */
			}
		},

		clear(): void {
			if (!storage) return;
			try {
				storage.removeItem(RUN_KEY);
			} catch {
				/* ignore */
			}
		}
	};
}

export function readLocalStorage(): Storage | null {
	if (typeof window === 'undefined') return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

export const persist: Persist = createPersist(readLocalStorage());

/* ------------------------------------------------------------------ */
/* Save export / import (parent tool — survive device wipe copies)     */
/* ------------------------------------------------------------------ */

export const SAVE_EXPORT_KIND = 'dolcetto-o-scherzetto-save' as const;

export interface SaveExport {
	kind: typeof SAVE_EXPORT_KIND;
	/** Schema hint for future importers. */
	schema: 2;
	exportedAt: string;
	run: RunState;
}

export function buildSaveExport(run: RunState, now = new Date()): SaveExport {
	return {
		kind: SAVE_EXPORT_KIND,
		schema: 2,
		exportedAt: now.toISOString(),
		run
	};
}

/** Parse a pasted/uploaded save file into a RunState, or null. */
export function parseSaveImport(raw: string): RunState | null {
	try {
		const value: unknown = JSON.parse(raw);
		if (typeof value !== 'object' || value === null) return null;
		const obj = value as Record<string, unknown>;
		if (obj.kind === SAVE_EXPORT_KIND && obj.run) return normalizeRun(obj.run);
		return normalizeRun(value);
	} catch {
		return null;
	}
}
