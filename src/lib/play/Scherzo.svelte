<script lang="ts">
	/**
	 * The Scherzo button + trick fan (T13) — spec §6 ("**Scherzo**: HUD-lights
	 * up at a refusing home → tap → trick fan → tap a trick → show plays") and
	 * §7's fan of owned pranks.
	 *
	 * Port of the prototype's `#scherzoBtn` and the `#fan` block of
	 * `renderHUD()` (`prototypes/scene-prototype.html`, CSS ~225-247, markup
	 * ~423-424, `renderHUD` ~1374-1391, click ~1598):
	 *
	 *   - the amber pill at `bottom: 26px`, centred, `display:none` until it
	 *     shows, pulsing `scherzopulse 1.5s` (glow-only keyframes, verbatim),
	 *     `:active` squashing through the same `translateX(-50%)` the
	 *     animation carries so the press never fights the centring;
	 *   - the fan at `bottom: 100px`, `display:none` until it opens, rising in
	 *     with `fanup .3s cubic-bezier(.3,1.4,.6,1)`; 82 px cards with the
	 *     trick's icon, its name and the four-dot tier row, plus the `✕` esc
	 *     hanging off the top-right corner;
	 *   - the clicks: `SCHERZO_OPEN` from the button, `PLAY_TRICK` from a
	 *     card, `SCHERZO_CLOSE` from the `✕` — the prototype's three
	 *     dispatches (~1598, ~1388, ~1389). Its `snd('pop')` cue is left for
	 *     T23/T27, as every other T11–T13 component leaves sound alone.
	 *
	 * **What is read, and from where.** Only the three store seams this task
	 * was given — `phase()`, `fanOpen()`, `tricks()` — through the pure
	 * predicates and list in `fan-model.ts` (the visibility matrix, the
	 * catalogue order and the dot math are pinned there, not here). The card
	 * label is `TRICKS[id].name` in the settings language, exactly the
	 * prototype's `trickName()` (~715): names are never retyped into this
	 * file. Like `KnockButton`, the label re-reads `settings` on every render
	 * and becomes reactive to the IT/EN toggle when T17's lands.
	 *
	 * **Two deliberate adaptations** (both reported):
	 *
	 * 1. The prototype kept the button pulsing *behind* an open fan
	 *    (`show = refuse && !shopOpen`); the task's visibility matrix makes
	 *    the two halves exclusive — closed shows the invitation, open shows
	 *    the fan — so the button hides while the fan is up and comes back
	 *    when the `✕` closes it. The prototype's `&& !shopOpen` guard has no
	 *    seam here; the shop is a full-stage z-15 panel over this z-11 layer
	 *    and covers it while open.
	 * 2. The prototype rebuilt the fan's markup behind a `dataset.sig`
	 *    guard; Svelte's keyed `{#each}` does that natively, so the cards are
	 *    declarative and a card is never re-created mid-open.
	 *
	 * **Reduced motion** (spec §6, global constraint): `scherzopulse` and
	 * `fanup` are an ambient loop and an entrance flourish, so both stop —
	 * the button still shows (static glow), the fan still opens (already in
	 * place). The cards keep their hover *end state* without the glide via
	 * the shared `reduce-motion-off` utility.
	 *
	 * **Mounting.** T15 owns the wiring: it drops this inside the `.stage`
	 * box, next to `WalkControls`/`KnockButton`. The layer is
	 * `pointer-events:none` with only the three buttons taking taps, and every
	 * one of them is a real `<button type="button">`, so keyboard and tap are
	 * the same path (T13's parity row). Nothing here listens to the window,
	 * so the page can mount it without any other wiring.
	 */
	import { dispatch, fanOpen, phase, tricks } from '$lib/state/game.svelte';
	import { settings } from '$lib/persist/settings';
	import { TRICKS } from '$lib/sim/economy';
	import type { TrickId } from '$lib/sim/economy';
	import { trickIcons } from '$lib/art/sprites/trick-icons';
	import { fanList, showFan, showScherzoButton, tierDots } from './fan-model';

	/** The invitation: at a refusing door, and only while the fan is shut. */
	const showButton = $derived(showScherzoButton(phase(), fanOpen()));

	/** The fan: opened at the refusing door, and still there. */
	const showFanUp = $derived(showFan(phase(), fanOpen()));

	/** Owned tricks, filtered and ordered by the catalogue (`fan-model`). */
	const list = $derived(fanList(tricks()));

	/** The card label — the catalogue's own name, in the settings language. */
	function label(id: TrickId): string {
		const lang = settings.read().lang;
		return TRICKS[id].name[lang] ?? TRICKS[id].name.it;
	}

	function open(): void {
		dispatch({ type: 'SCHERZO_OPEN' });
	}

	function close(): void {
		dispatch({ type: 'SCHERZO_CLOSE' });
	}

	function play(id: TrickId): void {
		dispatch({ type: 'PLAY_TRICK', id });
	}
</script>

<div class="layer">
	<button type="button" class="scherzo" class:show={showButton} onclick={open}>
		<span>✨</span> SCHERZO
	</button>

	<div class="fan" class:show={showFanUp}>
		{#each list as id (id)}
			<button
				type="button"
				class="trickcard reduce-motion-off"
				data-trick={id}
				onclick={() => play(id)}
			>
				<!-- trusted static SVG from the validated trick pack -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html trickIcons[id]}
				<span>{label(id)}</span>
				<span class="tier">
					{#each [1, 2, 3, 4] as dot (dot)}
						<i class:on={dot <= tierDots(id)}></i>
					{/each}
				</span>
			</button>
		{/each}
		<button type="button" class="esc" onclick={close}>✕</button>
	</div>
</div>

<style>
	/*
	 * The prototype's `.controls` box, restated as this widget's own layer
	 * (WalkControls owns its own copy of the same block): full stage,
	 * click-through, z-11 under the knock pill (12), HUD (13) and shop (15).
	 */
	.layer {
		position: absolute;
		inset: 0;
		z-index: 11;
		pointer-events: none;
	}

	/* `#scherzoBtn` (prototype ~225-231), verbatim but for the gradient
	 * stops: `#ffd166`/`#f2b93f` are the `--amber`/`--amber-deep` swatches. */
	.scherzo {
		pointer-events: auto;
		position: absolute;
		bottom: 26px;
		left: 50%;
		transform: translateX(-50%);
		display: none;
		align-items: center;
		gap: 9px;
		padding: 14px 26px;
		border-radius: 999px;
		cursor: pointer;
		background: linear-gradient(180deg, var(--amber), var(--amber-deep));
		color: var(--ink);
		font-weight: 700;
		font-size: 19px;
		letter-spacing: 0.04em;
		border: none;
		box-shadow: 0 10px 30px rgba(255, 209, 102, 0.38);
		font-family: inherit;
	}

	.scherzo.show {
		display: flex;
		animation: scherzopulse 1.5s ease-in-out infinite;
	}

	.scherzo:active {
		transform: translateX(-50%) scale(0.94);
	}

	@keyframes scherzopulse {
		0%,
		100% {
			box-shadow: 0 10px 30px rgba(255, 209, 102, 0.32);
		}
		50% {
			box-shadow: 0 10px 44px rgba(255, 209, 102, 0.62);
		}
	}

	/* `.fan` + `.fan.show` + `fanup` (prototype ~233-236), verbatim. */
	.fan {
		pointer-events: auto;
		position: absolute;
		bottom: 100px;
		left: 50%;
		transform: translateX(-50%);
		display: none;
		gap: 10px;
		flex-wrap: wrap;
		justify-content: center;
		max-width: 760px;
	}

	.fan.show {
		display: flex;
		animation: fanup 0.3s cubic-bezier(0.3, 1.4, 0.6, 1);
	}

	@keyframes fanup {
		from {
			transform: translateX(-50%) translateY(16px);
			opacity: 0;
		}
		to {
			transform: translateX(-50%);
			opacity: 1;
		}
	}

	/* `.trickcard` (prototype ~237-245). The icon arrives through `{@html}`,
	 * so it carries no scope tag: size it with `:global`, anchored here. */
	.trickcard {
		width: 82px;
		padding: 9px 5px 8px;
		border-radius: 16px;
		background: var(--paper);
		color: var(--ink);
		border: none;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		font-family: inherit;
		font-weight: 600;
		font-size: 11.5px;
		box-shadow: 0 8px 22px rgba(10, 6, 30, 0.45);
		transition: transform 0.12s ease;
	}

	.trickcard:hover {
		transform: translateY(-3px);
	}

	.trickcard:active {
		transform: scale(0.94);
	}

	.trickcard :global(svg) {
		width: 34px;
		height: 34px;
	}

	.tier {
		display: flex;
		gap: 2px;
	}

	/* The off dot's `#e7d9bd` (a beige wash on paper) has no palette swatch,
	 * so it is mixed from the two that do: ink into paper, per T02's
	 * no-off-palette-hex rule. The lit dot is the `--pumpkin-deep` swatch. */
	.tier i {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--ink) 22%, var(--paper));
	}

	.tier i.on {
		background: var(--pumpkin-deep);
	}

	/* `.fan .esc` (prototype ~246-247): the corner of the fan is its box. */
	.esc {
		position: absolute;
		right: -8px;
		top: -14px;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: var(--paper);
		color: var(--ink);
		border: none;
		font-weight: 700;
		cursor: pointer;
		box-shadow: 0 6px 16px rgba(10, 6, 30, 0.4);
	}

	/* Reduced motion: the pulse is an ambient loop and the fanup an entrance
	 * flourish — both stop here. Everything still shows, statically. */
	@media (prefers-reduced-motion: reduce) {
		.scherzo.show,
		.fan.show {
			animation: none;
		}
	}
</style>
