<script lang="ts">
	/**
	 * The knock cloud (T11) — the floating "Bussa ✊" pill that beckons when a
	 * door is within reach: 1.25 s pulse + amber ring + the tapping hand, all
	 * static under reduced motion.
	 *
	 * Port of the prototype's `#knockBtn` (`prototypes/scene-prototype.html`):
	 * the `.knockbtn`/`.show` CSS (~249-268, keyframes verbatim, including the
	 * `translateX(-50%)` every keyframe carries so the entrance never fights
	 * the centring), the label splice from `renderHUD()` (~1367-1371: the `✊`
	 * in `L[lang].knock` is wrapped in the `.knock-hand` span so it can tap on
	 * its own) and the click that dispatches `KNOCK` (~1597).
	 *
	 * **When it shows.** The prototype's `state.phase === 'roam' &&
	 * state.activeK >= 0 && !state.shopOpen && !ambienceLock`. `canWalk()` is
	 * the store's mirror of `!shopOpen` (while roaming it *is* that guard), so
	 * the shop seam is honoured without the store leaking `shopOpen`;
	 * `ambienceLock` is T23's audio gate and arrives with it. The label
	 * re-reads `settings` on every render — the prototype's `renderHUD` did
	 * the same — and T17's IT/EN toggle makes that read reactive when it
	 * lands.
	 *
	 * **Where it sits.** `left = activeK * 620 - worldX + 310` — the knocked
	 * door's screen x, the same seam `Street` exposes as `data-screen-x` —
	 * anchored `bottom: 209px` above the kids' heads, z-12 between the walk
	 * controls (11) and the bubble (14). Hidden it is `display: none`
	 * (prototype-exact), so it is neither focusable nor tappable while a door
	 * is not in range.
	 */
	import { activeK, canWalk, dispatch, phase, worldX } from '../state/game.svelte';
	import { lang } from '../state/game.svelte';
	import { t } from '../i18n/lines';

	interface Props {
		/**
		 * Cue hook for the knock (T27's `playCue`) — a no-op by default, so the
		 * pill never crashes without the SFX layer. Mirrors `<Npcs>`'s hook.
		 */
		sound?: (cue: string) => void;
	}
	let { sound = () => {} }: Props = $props();

	/** Prototype constant: one home every 620 logical px. */
	const SPACING = 620;
	/** The glyph the prototype spliced into its label to animate it by hand. */
	const HAND = '✊';

	/** The prototype's show condition (see the shop/ambienceLock notes above). */
	const show = $derived(phase() === 'roam' && activeK() >= 0 && canWalk());
	/** The active door's screen x — the pill hovers over its own doorstep. */
	const left = $derived(activeK() * SPACING - worldX() + 310);

	/** The label text before the hand glyph: 'Bussa ' / 'Knock '. */
	function labelHead(): string {
		return t(lang(), 'knock').split(HAND)[0];
	}

	/** The prototype's `KNOCK` beat: answer the reducer, then the wooden cue. */
	function knock(): void {
		dispatch({ type: 'KNOCK' });
		sound('knock');
	}
</script>

<button
	type="button"
	class="knockbtn"
	class:show
	style="left: {left}px"
	aria-label={labelHead().trim()}
	onclick={knock}
>
	{labelHead()}<span class="knock-hand" aria-hidden="true">{HAND}</span>
</button>

<style>
	.knockbtn {
		pointer-events: auto;
		position: absolute;
		z-index: 12;
		bottom: 209px;
		transform: translateX(-50%);
		display: none;
		padding: 12px 18px;
		border-radius: 999px;
		background: var(--paper);
		color: var(--ink);
		font-weight: 700;
		font-size: 15px;
		border: none;
		cursor: pointer;
		box-shadow: 0 10px 26px rgba(10, 6, 30, 0.5);
		font-family: inherit;
		/* T32 target size: symmetric vertical padding grows the pill from ~41 px
		 * to ~45 px to a ≥44 px tap target; the label stays vertically centred,
		 * so its visual centre holds. */
	}

	/* T32 focus ring (amber on the night stage). */
	.knockbtn:focus-visible {
		outline: 3px solid var(--amber);
		outline-offset: 3px;
	}

	/* The entrance is a crossing (kept for reduced motion); the invite loop is
	 * an ambient beckon and dies there — see the media query below. */
	.knockbtn.show {
		display: block;
		animation:
			knockin 0.3s cubic-bezier(0.3, 1.4, 0.6, 1),
			knockinvite 1.25s ease-in-out 0.35s infinite alternate;
	}

	.knockbtn:active {
		transform: translateX(-50%) scale(0.93);
	}

	@keyframes knockin {
		from {
			transform: translateX(-50%) translateY(10px);
			opacity: 0;
		}
		to {
			transform: translateX(-50%);
			opacity: 1;
		}
	}

	@keyframes knockinvite {
		from {
			transform: translateX(-50%) scale(1);
			box-shadow: 0 10px 26px rgba(10, 6, 30, 0.5);
		}
		to {
			transform: translateX(-50%) scale(1.08);
			box-shadow:
				0 10px 26px rgba(10, 6, 30, 0.5),
				0 0 26px 7px rgba(255, 209, 102, 0.38);
		}
	}

	.knock-hand {
		display: inline-block;
		margin-left: 4px;
		transform-origin: 50% 82%;
		animation: handtap 1.25s ease-in-out infinite;
	}

	@keyframes handtap {
		0%,
		38% {
			transform: translateY(0) rotate(0deg);
		}
		56% {
			transform: translateY(2.5px) rotate(-9deg);
		}
		74%,
		100% {
			transform: translateY(0) rotate(0deg);
		}
	}

	/* Reduced motion: the invite pulse and the hand tap are ambient loops, so
	 * they stop; the 0.3 s entrance stays (it is a crossing, like the door's). */
	@media (prefers-reduced-motion: reduce) {
		.knockbtn.show {
			animation: knockin 0.3s;
		}
		.knock-hand {
			animation: none;
		}
	}
</style>
