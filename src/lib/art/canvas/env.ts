/**
 * The canvas world's shared per-frame environment (T4, 2026-10-19).
 *
 * Every layer module draws from this one struct, so the shell owns the clock
 * and the state reads, and the layers stay pure functions of (env, input).
 */

export interface LayerEnv {
	/** World scroll position in logical px — the same number the sim exports. */
	worldX: number;
	/** Monotonic ms clock (any origin) — drives every ambient motion. */
	tMs: number;
	/** True when the user prefers reduced motion (ambient loops rest). */
	reducedMotion: boolean;
}
