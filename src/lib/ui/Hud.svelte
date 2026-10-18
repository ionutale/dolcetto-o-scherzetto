<script lang="ts">
	/**
	 * The HUD (T12) — for now, just the bag chip.
	 *
	 * Port of the prototype's `.hud` + `#bagChip` (`prototypes/
	 * scene-prototype.html`, markup ~409-410, CSS ~197-206, `renderHUD`
	 * ~1364): the click-through layer (`pointer-events:none`, `z-index:13`),
	 * the frosted pill, the bucket icon and the live bag count, and the
	 * `bagpulse` pop whenever the bag grows — the candy the tap sent home
	 * landing in the bucket.
	 *
	 * **Minimal on purpose.** T16 extends this same file with the Bottega pill
	 * (its `.top-right` cluster) and mounts the shop panel; nothing else
	 * belongs here yet.
	 * The chip is a `<button>` with `id="bagChip"` because T12's candy ghost
	 * measures it by that id to know where the bag is (`CandyLayer`).
	 *
	 * The pulse is a one-shot reveal (like the bubble pop), so a reduced-motion
	 * player still gets it — only the ambient loops are switched off.
	 */
	import { onDestroy } from 'svelte';
	import { bucketIcon } from '$lib/art/sprites/candy';
	import { bag, dispatch, fanOpen, lang, shopOpen, tricks } from '$lib/state/game.svelte';
	import type { Lang } from '$lib/sim/loop';
	import { inviteToShop } from './bottega-model';
	import { openMenu } from './menu-state.svelte';
	import Bottega from './Bottega.svelte';

	interface Props {
		/**
		 * Cue hook (T27's `playCue`), threaded to the Bottega's `buy`. A no-op by
		 * default, so the HUD never crashes without the SFX layer.
		 */
		sound?: (cue: string) => void;
	}
	let { sound = () => {} }: Props = $props();

	/** `bagpulse` duration (prototype `#bagChip.pulse`). */
	const BAG_PULSE_MS = 350;

	let pulse = $state(false);
	/** Last bag seen — a plain field: only `bag()` may re-run the effect. */
	let prev = bag();
	let timer: ReturnType<typeof setTimeout> | undefined;

	/** Pop the chip whenever the bag grows; a spend (T16) does not pop it. */
	$effect(() => {
		const count = bag();
		if (count > prev) {
			pulse = true;
			clearTimeout(timer);
			timer = setTimeout(() => {
				pulse = false;
			}, BAG_PULSE_MS);
		}
		prev = count;
	});

	onDestroy(() => clearTimeout(timer));

	/** The Bottega pill opens the shop panel (prototype `#bottegaBtn`, ~1617). */
	function openShop(): void {
		dispatch({ type: 'SHOP_OPEN' });
	}

	/**
	 * The 🏠 pill (owner feedback): back to the main menu from anywhere. Stops
	 * the walk and closes the shop/fan underneath, so the resumed game comes
	 * back to a clean standing state. Audio keeps playing (the menu is a
	 * pause, not a stop — and Settings stays reachable mid-game).
	 */
	function toMenu(): void {
		dispatch({ type: 'STOP' });
		if (shopOpen()) dispatch({ type: 'SHOP_CLOSE' });
		if (fanOpen()) dispatch({ type: 'SCHERZO_CLOSE' });
		openMenu();
	}

	/** The bag chip's spoken name — the count included (T32), in the run language. */
	function bagLabel(): string {
		const n = bag();
		if (lang() === 'en') return n === 1 ? 'Bag: 1 candy' : `Bag: ${n} candies`;
		return n === 1 ? 'Sacchetto: 1 caramella' : `Sacchetto: ${n} caramelle`;
	}

	/** The Bottega pill's accessible name, both languages (visible text stays). */
	const BOTTEGA_LABEL: Record<Lang, string> = {
		it: 'Apri la Bottega',
		en: 'Open the shop'
	};

	/**
	 * Owner feedback: the 🏪 pill beckons exactly while at least one **unowned,
	 * affordable** trick waits — and goes quiet the moment nothing new is
	 * affordable or everything is bought. Pure rule in `bottega-model.ts`;
	 * this is only the reactive wiring (buys update the bag and the owned set,
	 * so the beckon stops by itself the moment it no longer applies).
	 */
	const shopInvite = $derived(inviteToShop(bag(), tricks()));
</script>

<div class="hud">
	<button
		type="button"
		id="bagChip"
		class="pill"
		class:pulse
		aria-label={bagLabel()}
		title={bagLabel()}
	>
		<!-- trusted static SVG from the validated candy pack -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html bucketIcon(24)}
		<span class="count">{bag()}</span>
	</button>

	<!-- The wallet count, announced politely whenever it changes (T32). -->
	<span class="visually-hidden" role="status" aria-live="polite">{bagLabel()}</span>

	<!-- The prototype's `.top-right` cluster (markup ~411-415). T17 adds the
	     language/mute pills here; T16 ships the Bottega pill alone. -->
	<div class="top-right">
		<button type="button" id="menuBtn" class="pill" aria-label="Menu" title="Menu" onclick={toMenu}
			>🏠</button
		>
		<button
			type="button"
			id="bottegaBtn"
			class="pill"
			class:invite={shopInvite}
			aria-label={BOTTEGA_LABEL[lang()]}
			onclick={openShop}>🏪 Bottega</button
		>
	</div>
</div>

<!-- The shop panel is a **sibling** of `.hud`, not a child: its `z-15` then
     resolves against the stage's stacking context and covers the bubbles
     (`z-14`), exactly as the prototype's `#shop` did. -->
<Bottega {sound} />

<style>
	/* Full-stage, click-through: only the pills take pointers. */
	.hud {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 13;
	}

	.pill {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 7px;
		background: color-mix(in srgb, var(--night-0) 60%, transparent);
		border: 1px solid var(--cream-line);
		border-radius: 999px;
		color: var(--cream);
		font-weight: 600;
		font-size: 15px;
		padding: 7px 13px;
		/* T32 target size: the pill grows to a 44 px tap target; the icon and the
		 * count stay vertically centred (flex), so nothing shifts. */
		min-height: 44px;
		backdrop-filter: blur(6px);
		cursor: pointer;
		transition: transform 0.12s ease;
		font-family: inherit;
	}

	.pill:active {
		transform: scale(0.95);
	}

	/* T32 focus ring: amber reads 12.4:1 on the night stage; the ring sits
	 * outside the pill, so it never clips the icon or the label. */
	.pill:focus-visible {
		outline: 3px solid var(--amber);
		outline-offset: 3px;
	}

	#bagChip {
		position: absolute;
		left: 14px;
		top: 12px;
		font-size: 16px;
	}

	#bagChip.pulse {
		animation: bagpulse 0.35s ease;
	}

	/* `.hud .top-right` (prototype ~207): the pill cluster top-right. */
	.top-right {
		position: absolute;
		right: 14px;
		top: 12px;
		display: flex;
		gap: 8px;
	}

	/* `#bottegaBtn` (prototype ~209-210): the amber CTA pill. */
	#bottegaBtn {
		background: linear-gradient(180deg, var(--amber), var(--amber-deep));
		color: var(--ink);
		border: none;
		box-shadow: 0 6px 18px var(--amber-glow);
	}

	@keyframes bagpulse {
		50% {
			transform: scale(1.14);
		}
	}

	/* Owner feedback: the 🏪 pill's beckon — a slow, gentle swell of the amber
	   CTA while an affordable trick waits (the shop's "pick me", the knock
	   cloud's slower cousin). Wins over `:active` only in scale, so tapping
	   still reads as a press. */
	#bottegaBtn.invite {
		animation: shopinvite 1.6s ease-in-out infinite;
	}

	/* The beckon, pronounced (owner feedback): a double hop-nudge with a small
	   wobble and a glow bloom, then a settle — readable from across the couch.
	   A tap interrupts it (`:active` below), so the press still reads as a press. */
	@keyframes shopinvite {
		0% {
			transform: scale(1) rotate(0deg);
			box-shadow: 0 6px 18px var(--amber-glow);
		}
		10% {
			transform: scale(1.17) rotate(-3deg);
			box-shadow: 0 12px 34px color-mix(in srgb, var(--amber) 75%, transparent);
		}
		22% {
			transform: scale(1.03) rotate(1.5deg);
			box-shadow: 0 8px 22px color-mix(in srgb, var(--amber) 50%, transparent);
		}
		34% {
			transform: scale(1.13) rotate(-2deg);
			box-shadow: 0 11px 30px color-mix(in srgb, var(--amber) 70%, transparent);
		}
		48% {
			transform: scale(1.02) rotate(0.5deg);
			box-shadow: 0 7px 20px color-mix(in srgb, var(--amber) 45%, transparent);
		}
		60% {
			transform: scale(1.07) rotate(0deg);
			box-shadow: 0 9px 26px color-mix(in srgb, var(--amber) 55%, transparent);
		}
		100% {
			transform: scale(1) rotate(0deg);
			box-shadow: 0 6px 18px var(--amber-glow);
		}
	}

	#bottegaBtn.invite:active {
		animation: none;
	}

	/* Reduced motion: the beckon loop stops, the pill still asks — statically,
	   with a brighter halo and a visible ring (same policy as the candies). */
	@media (prefers-reduced-motion: reduce) {
		#bottegaBtn.invite {
			animation: none;
			box-shadow: 0 8px 26px color-mix(in srgb, var(--amber) 60%, transparent);
			outline: 3px solid color-mix(in srgb, var(--amber) 80%, transparent);
			outline-offset: 2px;
		}
	}
</style>
