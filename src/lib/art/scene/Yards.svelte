<script lang="ts">
	/**
	 * The yard dressing in front of one home — fences, gateposts, path, mailbox,
	 * trash can, gnome, tombstone, scarecrow, pumpkin pair, cobweb, bats, candle
	 * lantern and the sidewalk lamp post.
	 *
	 * 1:1 port of the prototype's `yardDressing(k)` (`prototypes/
	 * scene-prototype.html`, v2, lines ~1050-1074) and its `.path` / `.fence` /
	 * `.gatepost` / `.yarditem` / `.lampglow` / `.cobweb` rules (~113-128): the
	 * item set, the `k % n` selection and every left/bottom offset are verbatim.
	 * The prototype builds this as one HTML string and drops it into the slot
	 * with `innerHTML`, so here it is one `{@html}` — the whole dressing shares a
	 * single injection point.
	 *
	 * Modulo is deliberately the prototype's raw `k % n` (no wrap into `0..n-1`):
	 * that is what makes the window-edge house `k = -1` draw a plain fence and
	 * none of the even/odd ornaments, exactly as the validated scene did. The
	 * items are pure decor and never feed the refusal roll (spec §4.4).
	 *
	 * The prototype's `.bats` / `.candle` / `.lampbulb` wrapper animations are
	 * dropped: they only ever matched the `FB.*` fallback shapes, which carry a
	 * `bats` / `candle` class the real sprite pack's SVGs do not — with the pack
	 * loaded they were inert, and the pack's own `animCSS` animates each bat,
	 * flame and glow instead. Porting them would only add dead rules.
	 *
	 * Colours are the validated artefact's, ported verbatim; the `.dressing`
	 * wrapper is inserted so the scoped rules can reach the injected items.
	 */
	import {
		bats,
		candleLantern,
		cobweb,
		gnome,
		lampPost,
		mailbox,
		pumpkinPair,
		scarecrow,
		tombstone,
		trashCan
	} from '$lib/art/sprites';

	interface Props {
		/** House index on the endless street (may be negative at the window edge). */
		k: number;
	}

	let { k }: Props = $props();

	/** The prototype's `yardDressing(k)`, returning one HTML string. */
	function yardDressing(index: number): string {
		let s = '';
		const fenceStyle = index % 4;
		if (fenceStyle !== 3) {
			s += `<div class="fence" style="left:64px; width:222px;"></div>`;
			s += `<div class="fence" style="left:334px; width:216px;"></div>`;
			s += `<div class="gatepost" style="left:285px;"></div><div class="gatepost" style="left:329px;"></div>`;
		}
		s += `<div class="path"></div>`;
		s += `<div class="yarditem" style="left:246px; bottom:-48px;">${mailbox()}</div>`;
		s += `<div class="yarditem" style="left:168px; bottom:-40px;">${trashCan()}</div>`;
		if (index % 2 === 0) {
			s += `<div class="yarditem" style="left:404px; bottom:-50px;">${gnome()}</div>`;
		}
		if (index % 5 === 0) {
			s += `<div class="yarditem" style="left:74px; bottom:-38px;">${tombstone()}</div>`;
		}
		if (index % 7 === 3) {
			s += `<div class="yarditem" style="left:446px; bottom:-50px;">${scarecrow()}</div>`;
		}
		if (index % 3 !== 2) {
			s += `<div class="yarditem" style="left:486px; bottom:-46px;">${pumpkinPair()}</div>`;
		}
		// lamp on the sidewalk edge (alternating sides)
		const lampLeft = index % 2 === 0 ? 36 : 566;
		s += `<div class="yarditem lampglow" style="left:${lampLeft - 42}px; bottom:-58px;"></div>`;
		s += `<div class="yarditem" style="left:${lampLeft}px; bottom:-68px;">${lampPost()}</div>`;
		// ornaments on the house
		if (index % 2 === 0) {
			s += `<div class="yarditem cobweb" style="left:204px; bottom:118px;">${cobweb()}</div>`;
		}
		if (index % 3 === 1) {
			s += `<div class="yarditem" style="left:150px; bottom:142px;">${bats()}</div>`;
		}
		s += `<div class="yarditem" style="left:342px; bottom:44px;">${candleLantern()}</div>`;
		return s;
	}

	const dressing = $derived(yardDressing(k));
</script>

<div class="dressing">
	<!-- trusted static SVG from the validated sprite pack -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html dressing}
</div>

<style>
	/* Fills the slot box so the injected items' absolute offsets resolve against
	 * the same 620×200 box the prototype's slot provided. */
	.dressing {
		position: absolute;
		inset: 0;
	}

	.dressing :global(.path) {
		position: absolute;
		left: 286px;
		bottom: -52px;
		width: 48px;
		height: 54px;
		background: #5b4a71;
		clip-path: polygon(38% 0, 62% 0, 100% 100%, 0 100%);
		opacity: 0.95;
	}

	.dressing :global(.fence) {
		position: absolute;
		bottom: -52px;
		height: 30px;
		background: repeating-linear-gradient(90deg, var(--fence) 0 6px, transparent 6px 15px);
		border-top: 5px solid var(--fence);
	}

	.dressing :global(.gatepost) {
		position: absolute;
		bottom: -52px;
		width: 6px;
		height: 36px;
		background: var(--fence);
		border-radius: 3px;
	}

	.dressing :global(.yarditem) {
		position: absolute;
	}

	.dressing :global(.lampglow) {
		position: absolute;
		width: 110px;
		height: 36px;
		border-radius: 50%;
		opacity: 0.5;
		pointer-events: none;
		background: radial-gradient(
			ellipse at center,
			rgba(255, 217, 160, 0.55) 0%,
			rgba(255, 217, 160, 0) 70%
		);
	}

	.dressing :global(.cobweb) {
		opacity: 0.75;
	}
</style>
