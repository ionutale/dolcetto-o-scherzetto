<script lang="ts">
	/**
	 * The Bottega — the witch's shop panel (T16; spec §8 "bag = wallet", §4.3
	 * "Strega … **and** the Bottega keeper").
	 *
	 * Port of the prototype's `#shop` overlay and the `renderShop()` body
	 * (`prototypes/scene-prototype.html`: CSS ~282-302, markup ~430-440,
	 * `renderShop` ~1411-1431, the three clicks ~1617-1619):
	 *
	 *   - the scrim (`inset:0`, `z-15`, a dim night wash + blur) centred on a
	 *     cream `.shopcard` that rises in with `fanup .3s`;
	 *   - the **shopwitch** slot on the left, filled from `NEIGHBORS.strega` —
	 *     the T11 sprite, reused, never a second witch SVG;
	 *   - the title + subtitle and the scrollable `.shoplist`
	 *     (`max-height:300px`), one `.shopitem` per catalogue id: the trick
	 *     icon, its name and flavour line, then either the `Tuo!` chip (owned)
	 *     or the price chip + buy button (greyed and `disabled` when poor);
	 *   - the close `✕` and a scrim click both dispatch `SHOP_CLOSE`; a buy
	 *     dispatches `BUY`.
	 *
	 * **What is read.** The panel renders on the store's `shopOpen()` seam and
	 * builds its rows from `bag()`/`tricks()` through `bottega-model.ts` (the
	 * order, the three row states and the copy are pinned there, not here). The
	 * language is `settings.read().lang`, the same source `Scherzo` reads; the
	 * name re-reads on every render like its card label.
	 *
	 * **Adaptations** (reported, not silent):
	 *   1. `{#if shopOpen()}` mounts the panel instead of the prototype's
	 *      `display:none` toggle — idiomatic Svelte, and it keeps the buy
	 *      buttons out of the tab order while the shop is shut.
	 *   2. `Hud.svelte` renders this as a **sibling** root of its `.hud` layer
	 *      (not nested inside it), so `z-15` resolves against the stage's own
	 *      stacking context and covers the bubbles (`z-14`) exactly as the
	 *      prototype's `#shop` did.
	 *   3. The prototype played `snd('buy')` on a purchase; here it is injected
	 *      through the T27 `sound` hook (a no-op by default), threaded from
	 *      `Hud.svelte`.
	 *   4. Two off-palette prototype hexes (`#fff2cf` chip, `#efe6d8`/`#a8988a`
	 *      poor wash, `#e9e0d0`/`#a898af` disabled) have no §3 swatch, so they
	 *      are mixed from `--amber`/`--ink`/`--paper`/`--cream`, per T02's
	 *      no-off-palette rule.
	 *
	 * **Reduced motion**: the card's `fanup` is an entrance flourish, so the
	 * card carries the global `.reduce-motion-off` utility — it still appears,
	 * just without the rise.
	 */
	import { onDestroy } from 'svelte';
	import { bag, dispatch, shopOpen, tricks } from '$lib/state/game.svelte';
	import { settings } from '$lib/persist/settings';
	import type { Lang } from '$lib/sim/loop';
	import { priceFor, type TrickId } from '$lib/sim/economy';
	import { NEIGHBORS } from '$lib/art/sprites/neighbors';
	import { trickIcons } from '$lib/art/sprites/trick-icons';
	import { bottegaRows, shopCopy } from './bottega-model';

	interface Props {
		/**
		 * Cue hook for a purchase (T27's `playCue`) — a no-op by default, so the
		 * shop never crashes without the SFX layer. Threaded from `Hud.svelte`.
		 */
		sound?: (cue: string) => void;
		/** First paid purchase of the run — Hud pulses the bag chip once. */
		onPaidBuy?: () => void;
	}
	let { sound = () => {}, onPaidBuy = () => {} }: Props = $props();

	/** The live language — read like `Scherzo`'s card label (T17 wires the toggle). */
	function lang(): Lang {
		return settings.read().lang;
	}

	/** The eight rows for the current (language, bag, owned) — pure build. */
	const rows = $derived(bottegaRows(lang(), bag(), tricks()));

	/** The chrome strings (title, subtitle, labels) in the same language. */
	const copy = $derived(shopCopy(lang()));

	/** Row id that just got bought — drives the scale-pop flourish. */
	let justBought = $state<TrickId | null>(null);
	/** One-shot “nuovo trucco!” chip after a purchase. */
	let cheer = $state(false);
	/** Whether a paid trick has already been bought this run (session). */
	let paidBuySeen = false;
	let cheerTimer: ReturnType<typeof setTimeout> | undefined;
	let popTimer: ReturnType<typeof setTimeout> | undefined;

	const CHEER: Record<Lang, string> = {
		it: 'Nuovo trucco!',
		en: 'New trick!'
	};

	const CLOSE_LABEL: Record<Lang, string> = {
		it: 'Chiudi la Bottega',
		en: 'Close the shop'
	};

	function close(): void {
		dispatch({ type: 'SHOP_CLOSE' });
	}

	function buy(id: TrickId): void {
		const price = priceFor(id);
		const before = tricks();
		dispatch({ type: 'BUY', id });
		const after = tricks();
		if (after.length <= before.length || !after.includes(id)) return;
		sound('buy');
		justBought = id;
		cheer = true;
		clearTimeout(popTimer);
		clearTimeout(cheerTimer);
		popTimer = setTimeout(() => {
			justBought = null;
		}, 450);
		cheerTimer = setTimeout(() => {
			cheer = false;
		}, 1200);
		if (price > 0 && !paidBuySeen) {
			paidBuySeen = true;
			onPaidBuy();
		}
	}

	onDestroy(() => {
		clearTimeout(cheerTimer);
		clearTimeout(popTimer);
	});
</script>

{#if shopOpen()}
	<div class="shop">
		<!-- The scrim is the prototype's outside-click-to-close (`#shop` click,
		     ~1619). A real button, so the same path works from the keyboard
		     and the a11y checker has nothing to warn about; the card sits above
		     it, so a click inside never reaches it. -->
		<button type="button" class="scrim" aria-label={CLOSE_LABEL[lang()]} onclick={close}></button>
		<div class="shopcard reduce-motion-off" role="dialog" aria-labelledby="shopTitle">
			<button type="button" class="close" aria-label={CLOSE_LABEL[lang()]} onclick={close}>✕</button
			>
			<div class="shopwitch">
				<!-- trusted static SVG, the T11 Strega sprite (spec §4.3 keeper) -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html NEIGHBORS.strega}
			</div>
			<div class="shopbody">
				<h2 id="shopTitle">{copy.title}</h2>
				<p class="sub">{copy.sub}</p>
				{#if cheer}
					<p class="cheer reduce-motion-off" role="status">{CHEER[lang()]}</p>
				{/if}
				<div class="shoplist">
					{#each rows as row (row.id)}
						<div class="shopitem" class:just-bought={justBought === row.id}>
							<!-- trusted static SVG from the validated trick pack -->
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html trickIcons[row.id]}
							<div class="meta">
								<b>{row.name}</b>
								<p>{row.desc}</p>
							</div>
							{#if row.state === 'owned'}
								<span class="pricechip" class:owned-pop={justBought === row.id}>{copy.owned}</span>
							{:else}
								<span class="pricechip" class:poor={row.state === 'poor'}>🍬 {row.price}</span>
								<button
									type="button"
									class="buybtn"
									disabled={row.state === 'poor'}
									aria-label={`${copy.buy} ${row.name}`}
									onclick={() => buy(row.id)}
								>
									{copy.buy}
								</button>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	/* `#shop` (prototype ~283-285): the full-stage scrim. Mounted as a sibling
	 * of `.hud` inside `.stage`, so z-15 sits over the bubbles (14), the HUD
	 * (13), the knock pill (12) and the controls (11). */
	.shop {
		position: absolute;
		inset: 0;
		z-index: 15;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--night-0) 55%, transparent);
		backdrop-filter: blur(3px);
		pointer-events: auto;
	}

	/* The dim backdrop, and the outside-click target. Invisible: `.shop`
	 * already paints the night wash. */
	.scrim {
		position: absolute;
		inset: 0;
		z-index: 0;
		border: none;
		padding: 0;
		background: transparent;
		cursor: default;
	}

	/* `.shopcard` (~286-289): cream paper over the night, 680 px, the witch on
	 * the left. The 24 px radius is `--r-lg`. */
	.shopcard {
		position: relative;
		z-index: 1;
		width: 680px;
		max-width: calc(100% - 24px);
		display: flex;
		gap: 18px;
		padding: 18px 22px;
		border-radius: var(--r-lg);
		background: var(--cream);
		color: var(--ink);
		box-shadow: 0 30px 80px color-mix(in srgb, var(--night-0) 65%, transparent);
		animation: fanup 0.3s ease;
	}

	.shopcard h2 {
		font-size: 20px;
		margin-bottom: 4px;
	}

	.shopcard .sub {
		font-size: 12px;
		opacity: 0.7;
		margin-bottom: 10px;
	}

	.cheer {
		margin: -4px 0 10px;
		font-size: 14px;
		font-weight: 700;
		color: var(--amber-deep);
		animation: cheerfade 1.2s ease forwards;
	}

	@keyframes cheerfade {
		0% {
			opacity: 0;
			transform: translateY(4px) scale(0.96);
		}
		15% {
			opacity: 1;
			transform: translateY(0) scale(1.04);
		}
		75% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}

	.shopitem.just-bought {
		animation: buypop 0.45s cubic-bezier(0.3, 1.4, 0.6, 1);
	}

	@keyframes buypop {
		0% {
			transform: scale(1);
		}
		40% {
			transform: scale(1.06);
		}
		100% {
			transform: scale(1);
		}
	}

	.pricechip.owned-pop {
		animation: ownedpop 0.45s ease;
		background: color-mix(in srgb, var(--amber) 55%, var(--paper));
	}

	@keyframes ownedpop {
		50% {
			transform: scale(1.12);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.cheer,
		.shopitem.just-bought,
		.pricechip.owned-pop {
			animation: none;
		}
	}

	/* `.shopwitch` (~290): the keeper column, bottom-aligned. The T11 sprite is
	 * `{@html}`, so it carries no scope tag — width only, grown by the div. */
	.shopwitch {
		flex: 0 0 110px;
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}

	/* The card's content column fills the rest of the 680 px (the prototype's
	 * bare div; `min-width:0` lets the scroll list shrink instead of pushing). */
	.shopbody {
		flex: 1;
		min-width: 0;
	}

	/* `.shoplist` (~291): the scroll box. */
	.shoplist {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-height: 300px;
		overflow-y: auto;
		padding-right: 4px;
	}

	/* `.shopitem` (~292-295). */
	.shopitem {
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--paper);
		border-radius: 16px;
		padding: 8px 12px;
		box-shadow: 0 4px 14px color-mix(in srgb, var(--ink) 10%, transparent);
	}

	.shopitem :global(svg) {
		width: 38px;
		height: 38px;
		flex: 0 0 38px;
	}

	.meta {
		flex: 1;
		min-width: 0;
	}

	.meta b {
		font-size: 14.5px;
	}

	.meta p {
		font-size: 11px;
		opacity: 0.65;
	}

	/* `.pricechip` (~296-297): the warm candy pill; `poor` greys it. */
	.pricechip {
		font-size: 13.5px;
		font-weight: 700;
		white-space: nowrap;
		background: color-mix(in srgb, var(--amber) 32%, var(--paper));
		color: var(--ink);
		padding: 5px 11px;
		border-radius: var(--r-pill);
	}

	.pricechip.poor {
		background: color-mix(in srgb, var(--ink) 9%, var(--cream));
		color: color-mix(in srgb, var(--ink) 45%, var(--cream));
	}

	/* `#shopCloseBtn` (~298-299). */
	.close {
		position: absolute;
		right: 14px;
		top: 12px;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: none;
		background: var(--paper);
		color: var(--ink);
		font-weight: 700;
		font-size: 15px;
		cursor: pointer;
		box-shadow: 0 4px 12px color-mix(in srgb, var(--ink) 15%, transparent);
	}

	/* `.buybtn` (~300-302). */
	.buybtn {
		border: none;
		border-radius: var(--r-pill);
		padding: 8px 16px;
		font-family: inherit;
		font-weight: 700;
		font-size: 13px;
		background: linear-gradient(180deg, var(--amber), var(--amber-deep));
		color: var(--ink);
		cursor: pointer;
		box-shadow: 0 6px 16px var(--amber-glow);
	}

	.buybtn:disabled {
		background: color-mix(in srgb, var(--ink) 10%, var(--cream));
		color: color-mix(in srgb, var(--ink) 45%, var(--cream));
		box-shadow: none;
		cursor: default;
	}

	/* T32 focus rings. The card is cream, so an amber ring would vanish: the
	 * card's controls take an ink ring instead, and the full-stage scrim draws
	 * its ring inset so it is visible at the viewport edges. */
	.close:focus-visible,
	.buybtn:focus-visible {
		outline: 3px solid var(--ink);
		outline-offset: 2px;
	}

	.scrim:focus-visible {
		outline: 3px solid var(--amber);
		outline-offset: -4px;
	}

	/* `fanup` (prototype ~56, the fan's rise) — declared locally so Svelte
	 * scopes it to this component rather than reaching for Scherzo's copy. */
	@keyframes fanup {
		from {
			transform: translateY(16px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}
</style>
