/**
 * The localStorage mirror of the run — the game's only save slot
 * (ADR-0006: local-only, no backend, autosaved after every change).
 *
 * The state is stored verbatim under one versioned key (`dos.run.v1`), so a
 * future schema bumps `version` and an older payload is recognised and dropped
 * instead of crashing the boot. `RunState` is plain JSON by design (the sim in
 * `src/lib/sim` keeps it that way), so `JSON.stringify` is the whole
 * serialisation.
 *
 * **Nothing here ever throws.** localStorage is hostile in the wild — Safari
 * private mode throws on every access, a full quota throws on write, and a
 * half-written or hand-edited value throws on parse. Every one of those paths
 * degrades to "no save": `read()` returns `null` and `write()`/`clear()` stay
 * silent. A game that cannot save must still be playable.
 *
 * Validation is deliberately minimal (version, the types of every field the
 * sim reads): enough to tell a save from garbage, not a schema check. The
 * numbers must be *finite* — a hand-edited `1e999` parses to `Infinity`, which
 * would corrupt the run silently.
 */

/** The one key the run owns in localStorage. */
export const RUN_KEY = 'dos.run.v1';

/** Bumped whenever `RunState` changes shape; older payloads are dropped. */
const RUN_VERSION = 1;

/**
 * What survives a reload. Kept minimal for T03; the sim (T05) extends it with
 * the rest of the loop state.
 */
export interface RunState {
	version: 1;
	/** Candies in the bag right now. */
	bag: number;
	/** The best bag ever held on this device. */
	record: number;
	/** Owned trick ids (the Bottega's eight scherzi). */
	tricks: string[];
	/** Furthest neighborhood index reached (progression, T07). */
	furthestK: number;
}

/**
 * True for a v1 run state the sim could run on. Anything else — a future
 * schema, a truncated write, a hand-edited value — is refused and the game
 * starts fresh instead of booting into a corrupt run.
 */
export function isRunState(value: unknown): value is RunState {
	if (typeof value !== 'object' || value === null) return false;
	const state = value as Partial<RunState>;
	if (state.version !== RUN_VERSION) return false;
	if (typeof state.bag !== 'number' || !Number.isFinite(state.bag)) return false;
	if (typeof state.record !== 'number' || !Number.isFinite(state.record)) return false;
	if (typeof state.furthestK !== 'number' || !Number.isFinite(state.furthestK)) return false;
	return Array.isArray(state.tricks) && state.tricks.every((trick) => typeof trick === 'string');
}

export interface Persist {
	/** The saved run, or `null` when there is nothing usable to restore. */
	read(): RunState | null;
	/** Writes the run as the latest save (last write wins). Never throws. */
	write(state: RunState): void;
	/** Drops the save; the next boot starts a fresh run. */
	clear(): void;
}

/**
 * Binds the mirror to a `Storage`. Pass `null` where there is none (SSR, or a
 * browser that refuses to expose localStorage) and every method no-ops.
 */
export function createPersist(storage: Storage | null): Persist {
	/** The stored run, parsed and shape-checked, or `null`. */
	function read(): RunState | null {
		if (!storage) return null;
		let raw: string | null;
		try {
			raw = storage.getItem(RUN_KEY);
		} catch {
			// Private mode, blocked cookies, a revoked quota: no save, no crash.
			return null;
		}
		if (raw === null) return null;
		try {
			const state: unknown = JSON.parse(raw);
			return isRunState(state) ? state : null;
		} catch {
			// Truncated or hand-edited payload: treat as no save at all.
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
				// Quota exceeded or a serialisation refusal: the run keeps playing,
				// it just does not survive a reload.
			}
		},

		clear(): void {
			if (!storage) return;
			try {
				storage.removeItem(RUN_KEY);
			} catch {
				// Nothing to do: a save we cannot remove is one we cannot read back
				// either, and read() has already proven it is a no-op for us.
			}
		}
	};
}

/**
 * `window.localStorage`, or `null` when there is none to have (SSR, or a
 * browser that refuses to expose it). The *access* itself throws in some
 * privacy modes, so even this read is guarded.
 */
export function readLocalStorage(): Storage | null {
	if (typeof window === 'undefined') return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

/**
 * The mirror this app uses. `window.localStorage` is read once, defensively:
 * building the instance is guarded and SSR gets a no-op mirror.
 */
export const persist: Persist = createPersist(readLocalStorage());
