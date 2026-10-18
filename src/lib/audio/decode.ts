/**
 * Low-rate decoding for the audio stack's long-lived buffers.
 *
 * `decodeAudioData` always resamples to the *context's* sample rate, and a
 * device rate (44.1 / 48 kHz) inflates every buffer far past what its content
 * needs — decoded audio is a big slice of the page's resident memory, and the
 * iPhone's process budget is the thing that kills long sessions (owner's
 * Activity Monitor reading, 2026-10-18: ~225 MB idle → ~355–400 MB mid-play;
 * the music loop alone decoded to ~34–37 MB).
 *
 * This helper decodes through small `OfflineAudioContext`s pinned to the
 * *content's* own rate instead:
 *
 *   - **music** at {@link MUSIC_DECODE_RATE} (32 kHz — the owner's call: the
 *     loop stays seam-identical, only the top of the spectrum is trimmed);
 *   - **clips** (voice lines, ambience beds) at {@link CLIP_DECODE_RATE}
 *     (24 kHz — the voices' native speech rate; the beds are texture).
 *
 * `AudioBuffer`s are not bound to a context, so the results play in the live
 * graphs unchanged (playback resamples). No offline context, no decode: the
 * caller stays silent. Nothing here ever throws.
 */

/** The music loop's decode rate — the owner's memory/ear compromise. */
export const MUSIC_DECODE_RATE = 32000;

/** Voice lines + ambience beds: their native speech rate (24 kHz mono). */
export const CLIP_DECODE_RATE = 24000;

/** The offline decode contexts, one per rate, built lazily. */
const contexts = new Map<number, OfflineAudioContext>();

/** The decode context for `rate`, or `null` where offline contexts are absent. */
function contextFor(rate: number): OfflineAudioContext | null {
	try {
		const cached = contexts.get(rate);
		if (cached) return cached;
		// `Window` declares neither constructor on every engine, so read the
		// pair off a cast shape (Safari used to ship the webkit-prefixed name).
		const w = globalThis as unknown as {
			OfflineAudioContext?: typeof OfflineAudioContext;
			webkitOfflineAudioContext?: typeof OfflineAudioContext;
		};
		const Ctor = w.OfflineAudioContext ?? w.webkitOfflineAudioContext;
		if (typeof Ctor !== 'function') return null;
		// Length is irrelevant to decoding; 1 frame keeps the context tiny.
		const ctx = new Ctor(1, 1, rate);
		contexts.set(rate, ctx);
		return ctx;
	} catch {
		return null;
	}
}

/**
 * Decode `bytes` at `rate`. Returns `null` — never throws — where there is no
 * offline context (node, SSR) or the bytes cannot be decoded.
 */
export async function decodeAt(bytes: ArrayBuffer, rate: number): Promise<AudioBuffer | null> {
	try {
		const ctx = contextFor(rate);
		if (!ctx) return null;
		return await ctx.decodeAudioData(bytes);
	} catch {
		return null;
	}
}
