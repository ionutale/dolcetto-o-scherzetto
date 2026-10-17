<script lang="ts">
	/**
	 * The candy layer (T12) — the sidewalk pile: candies float down from the
	 * door, settle, glow and wait to be tapped.
	 *
	 * Port of the prototype's `.fx` layer and its `renderCandies()` /
	 * `twinkleAt()` / `flyGhostToBag()` / `floater()` / `tapCandy()` block
	 * (`prototypes/scene-prototype.html`, CSS ~174-195, JS ~1259-1346):
	 *
	 *   - the `.fx` box (full stage, `pointer-events:none`, `z-index:5`) with
	 *     `.candy` sitting `pointer-events:auto` on top of it;
	 *   - `candyPos()` drives each falling candy (in `candy-motion.ts`), the
	 *     landing position is the sim's own `tx/ty`, and the candy's `z-index`
	 *     is `10 + round(y)` so a lower candy paints in front of a higher one;
	 *   - the `--glow` halo: each candy carries its pastel inline, the halo
	 *     breathes (`candleglow`), the landed pile breathes faster;
	 *   - a landing twinkles four sparks, a tap flies a shrinking copy into the
	 *     bag chip and floats a `+N` from the slot, then dispatches `COLLECT`.
	 *
	 * **The sim owns the math.** Nothing here decides *where* a candy lands or
	 * *what* it is worth — `state.candies` (read through the store's
	 * `candies()`) and `COLLECT` are the whole contract. A candy's element is
	 * keyed by its id, so the sim adding/removing candies adds/removes nodes
	 * and a candy is never re-animated mid-flight.
	 *
	 * **Adapted, deliberately** (see the T12 report): the prototype's
	 * click-`div` is a real `<button type="button">` (keyboard/tap parity for
	 * free), pre-delay candies are `pointer-events:none` (they used to sit at
	 * (0,0) as invisible tap targets), and the shadow/glow literals are the
	 * palette tokens (`--shadow-night`, `--moon`) instead of raw `rgba()`.
	 *
	 * **The pick-me nudge** (owner feedback): a candy nobody taps within
	 * `PICKME_MS` hops and its halo swells — an animation on the candy itself,
	 * never a bubble — until it is collected. Reduced motion swaps the loop for
	 * a bigger, brighter static halo.
	 *
	 * Reduced motion (spec §6): the halo goes **static** (still lit, no pulse)
	 * and the landed idle bob stops — both ambient loops. The landpop, the
	 * twinkle and the fly-to-bag hop are one-shot reveals/crossings and stay.
	 */
	import { onDestroy, untrack } from 'svelte';
	import { candyColor, candySvg } from '$lib/art/sprites/candy';
	import { candies, dispatch } from '$lib/state/game.svelte';
	import type { Candy, CandyType } from '$lib/sim/loop';
	import {
		FLOATER_DX,
		FLOATER_DY,
		FLOATER_MS,
		GHOST_FLY_MS,
		TWINKLE_COUNT,
		TWINKLE_MS,
		TWINKLE_SPREAD_X,
		TWINKLE_SPREAD_Y,
		candyPos,
		hasLanded
	} from './candy-motion';

	interface Props {
		/**
		 * Cue hook for the layer's two cues (T27's `playCue`): `twinkle` when a
		 * candy settles and `coin` when one is collected (the prototype's
		 * `renderCandies`/`tapCandy` calls). A no-op by default, so the layer
		 * never crashes without the SFX layer. Mirrors `<Npcs>`'s hook.
		 */
		sound?: (cue: string) => void;
	}
	let { sound = () => {} }: Props = $props();

	/** How long an unpicked candy waits before it starts asking to be picked. */
	const PICKME_MS = 5000;

	/** A landing spark, in stage-logical px. */
	interface Sparkle {
		id: number;
		x: number;
		y: number;
	}

	/** A `+N` counter that rises from a collected candy. */
	interface Floater {
		id: number;
		x: number;
		y: number;
		text: string;
	}

	/** The shrinking copy of a collected candy on its way to the bag chip. */
	interface Ghost {
		key: number;
		type: CandyType;
		x: number;
		y: number;
	}

	/** The layer's root, so the bag chip can be measured in stage px. */
	let root: HTMLElement | null = $state(null);

	let sparkles = $state<Sparkle[]>([]);
	let floaters = $state<Floater[]>([]);
	let ghost = $state<Ghost | null>(null);

	/** Ids whose landing twinkle already fired (plain: bookkeeping, not UI). */
	const landedSeen: number[] = [];

	/** Candies past `PICKME_MS` unpicked — drives the `pickme` class. */
	let nudging = $state<number[]>([]);
	let sparkleSeq = 0;
	let floaterSeq = 0;
	let ghostSeq = 0;

	/** Every timer this layer owns, cancelled when the page goes away. */
	const timers: ReturnType<typeof setTimeout>[] = [];

	function after(ms: number, fn: () => void): void {
		const id = setTimeout(() => {
			const i = timers.indexOf(id);
			if (i >= 0) timers.splice(i, 1);
			fn();
		}, ms);
		timers.push(id);
	}

	onDestroy(() => {
		for (const id of timers) clearTimeout(id);
		timers.length = 0;
	});

	/** The stage box and its live scale — the px reducer the prototype used. */
	function stageGeometry(): { stage: DOMRect; scale: number } | null {
		const stage = root?.closest('.stage');
		if (!stage) return null;
		const rect = stage.getBoundingClientRect();
		return { stage: rect, scale: rect.width / 852 || 1 };
	}

	/**
	 * One landing twinkle per candy, as in `renderCandies()`: the moment a
	 * candy flips to `landed`, four sparks scatter around its slot and fade.
	 * The `landedIds` signature keeps this effect off the 60 fps flight ticks
	 * (it only re-runs when the landed set changes) — `untrack` then does the
	 * bookkeeping without subscribing to the fx arrays it writes.
	 */
	$effect(() => {
		const landedIds = candies()
			.filter((c) => hasLanded(c))
			.map((c) => c.id);

		untrack(() => {
			if (landedIds.length === 0) {
				// A fresh run (RESET) empties the pile: forget every id.
				landedSeen.length = 0;
				nudging = [];
				return;
			}
			const landed = candies().filter((c) => hasLanded(c));
			const fresh = landed.filter((c) => !landedSeen.includes(c.id));
			if (!fresh.length) return;
			for (const c of landed) landedSeen.push(c.id);

			const born: Sparkle[] = [];
			for (const c of fresh) {
				// The prototype's per-landing `snd('twinkle')`: one soft sparkle
				// cue as each candy flips to `landed`.
				sound('twinkle');
				for (let i = 0; i < TWINKLE_COUNT; i++) {
					born.push({
						id: ++sparkleSeq,
						x: c.tx + (Math.random() * TWINKLE_SPREAD_X - TWINKLE_SPREAD_X / 2),
						y: c.ty + (Math.random() * TWINKLE_SPREAD_Y - TWINKLE_SPREAD_Y / 2)
					});
				}
				// Five seconds unpicked and the candy asks itself: one timer per
				// landing; the class stays on until the tap clears it.
				after(PICKME_MS, () => {
					if (candies().some((live) => live.id === c.id) && !nudging.includes(c.id)) {
						nudging = nudging.concat(c.id);
					}
				});
			}
			sparkles = sparkles.concat(born);
			const ids = born.map((s) => s.id);
			after(TWINKLE_MS, () => {
				sparkles = sparkles.filter((s) => !ids.includes(s.id));
			});
		});
	});

	/** The `+N` float: up 46 px, out in ~1 s (prototype `floater`). */
	function pushFloater(x: number, y: number, text: string): void {
		const id = ++floaterSeq;
		floaters = floaters.concat({ id, x, y, text });
		after(FLOATER_MS, () => {
			floaters = floaters.filter((f) => f.id !== id);
		});
	}

	/**
	 * The collected candy's ghost: starts on the candy's own rect, hops to the
	 * bag chip's centre (prototype `flyGhostToBag`, measured through the stage
	 * so a scaled device works exactly like the prototype did).
	 */
	function launchGhost(c: Candy, el: HTMLElement): void {
		const geo = stageGeometry();
		const chip = root?.closest('.stage')?.querySelector<HTMLElement>('#bagChip') ?? null;
		if (!geo || !chip) return;

		const from = el.getBoundingClientRect();
		const to = chip.getBoundingClientRect();
		const { stage, scale } = geo;
		const key = ++ghostSeq;

		ghost = {
			key,
			type: c.type,
			x: (from.left - stage.left) / scale,
			y: (from.top - stage.top) / scale
		};
		requestAnimationFrame(() => {
			if (ghost?.key !== key) return;
			ghost = {
				...ghost,
				x: (to.left - stage.left + to.width / 2) / scale,
				y: (to.top - stage.top + to.height / 2) / scale
			};
		});
		after(GHOST_FLY_MS, () => {
			if (ghost?.key === key) ghost = null;
		});
	}

	/** Tap a settled candy: ghost to the bag, `+N`, and the one sim action. */
	function tapCandy(c: Candy, el: HTMLElement): void {
		if (!hasLanded(c)) return;
		nudging = nudging.filter((id) => id !== c.id);
		launchGhost(c, el);
		dispatch({ type: 'COLLECT', id: c.id });
		pushFloater(c.tx + FLOATER_DX, c.ty + FLOATER_DY, '+' + c.value);
		sound('coin');
	}

	/**
	 * A candy's inline style. The landed case uses the sim's frozen slot; the
	 * flying case uses `candyPos`, or hides the candy entirely until its
	 * stagger delay is up.
	 */
	function candyStyle(c: Candy): string {
		const glow = `--glow:${candyColor[c.type]}`;
		if (hasLanded(c)) {
			return `${glow};left:${c.tx}px;top:${c.ty}px;transform:rotate(0deg);z-index:${10 + Math.round(c.ty)}`;
		}
		const p = candyPos(c);
		if (!p) return `${glow};opacity:0;pointer-events:none`;
		return `${glow};left:${p.x}px;top:${p.y}px;transform:rotate(${p.rot}deg);z-index:${10 + Math.round(p.y)}`;
	}
</script>

<div class="fx" bind:this={root}>
	{#each candies() as c (c.id)}
		<button
			type="button"
			class="candy"
			class:landed={hasLanded(c)}
			class:pickme={nudging.includes(c.id)}
			style={candyStyle(c)}
			onclick={(event) => tapCandy(c, event.currentTarget)}
		>
			<!-- trusted static SVG from the validated candy pack -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html candySvg(c.type)}
		</button>
	{/each}

	{#if ghost}
		<div
			class="candy ghostfly landed"
			style="--glow:{candyColor[ghost.type]};left:{ghost.x}px;top:{ghost.y}px"
		>
			<!-- trusted static SVG from the validated candy pack -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html candySvg(ghost.type)}
		</div>
	{/if}

	{#each sparkles as s (s.id)}
		<div class="sparkle" style="left:{s.x}px;top:{s.y}px"></div>
	{/each}

	{#each floaters as f (f.id)}
		<div class="floater" style="left:{f.x}px;top:{f.y}px">{f.text}</div>
	{/each}
</div>

<style>
	/* The fx layer, prototype-exact: full stage, click-through, above the kids. */
	.fx {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 5;
	}

	/* A candy is a button (tap + keyboard); the reset keeps the pack's look. */
	.candy {
		--glow: var(--amber);
		position: absolute;
		width: 34px;
		height: 34px;
		margin: -17px 0 0 -17px;
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		color: inherit;
		pointer-events: auto;
		cursor: pointer;
		filter: drop-shadow(0 3px 5px var(--shadow-night)) drop-shadow(0 0 7px var(--glow));
	}

	/* The SVG arrives through {@html}, so it is not scope-tagged: size it and
	 * animate it through :global, still anchored to this candy. */
	.candy :global(svg) {
		display: block;
		width: 34px;
		height: 34px;
	}

	.candy::before {
		content: '';
		position: absolute;
		inset: -8px;
		border-radius: 50%;
		z-index: -1;
		background: radial-gradient(circle, var(--glow) 0%, transparent 68%);
		opacity: 0.5;
		animation: candleglow 1.6s ease-in-out infinite alternate;
	}

	@keyframes candleglow {
		from {
			opacity: 0.32;
			transform: scale(0.92);
		}
		to {
			opacity: 0.66;
			transform: scale(1.06);
		}
	}

	/* The landed pile breathes faster than the candies still falling. */
	.candy.landed::before {
		animation-duration: 1.1s;
	}

	.candy.landed {
		animation: landpop 0.3s ease;
	}

	@keyframes landpop {
		0% {
			transform: scale(0.6);
		}
		60% {
			transform: scale(1.18);
		}
		100% {
			transform: scale(1);
		}
	}

	.candy.landed :global(svg) {
		animation: idlebob 1.8s ease-in-out 0.35s infinite alternate;
	}

	@keyframes idlebob {
		from {
			transform: translateY(0);
		}
		to {
			transform: translateY(-2.5px);
		}
	}

	/* Unpicked for `PICKME_MS`: the candy hops and its halo swells — how a
	 * candy says "pick me!" without a bubble (owner feedback). The rule sits
	 * after the idlebob block on purpose: at equal specificity, later wins. */
	.candy.pickme :global(svg) {
		animation: pickme 1.5s ease-in-out infinite;
	}

	@keyframes pickme {
		0%,
		50%,
		100% {
			transform: translateY(0) rotate(0deg) scale(1);
		}
		12% {
			transform: translateY(-8px) rotate(-7deg) scale(1.14);
		}
		26% {
			transform: translateY(0) rotate(5deg) scale(1.08);
		}
		38% {
			transform: translateY(-3px) rotate(0deg) scale(1.04);
		}
	}

	.candy.pickme::before {
		inset: -11px;
		animation-duration: 0.85s;
	}

	/* The collected candy's hop into the bag chip. */
	.ghostfly {
		pointer-events: none;
		transition:
			left 0.45s cubic-bezier(0.4, -0.2, 0.6, 1),
			top 0.45s cubic-bezier(0.4, -0.2, 0.6, 1),
			transform 0.45s,
			opacity 0.45s;
		opacity: 0.2;
		transform: scale(0.5) rotate(20deg);
	}

	.floater {
		position: absolute;
		font-weight: 700;
		font-size: 19px;
		color: var(--amber);
		text-shadow: 0 2px 8px var(--shadow-night);
		animation: floatup 0.95s ease-out forwards;
		pointer-events: none;
		white-space: nowrap;
	}

	@keyframes floatup {
		0% {
			transform: translateY(0);
			opacity: 0;
		}
		15% {
			opacity: 1;
		}
		100% {
			transform: translateY(-46px);
			opacity: 0;
		}
	}

	.sparkle {
		position: absolute;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--moon);
		box-shadow: 0 0 8px 2px color-mix(in srgb, var(--moon) 70%, transparent);
		animation: sparkfade 0.5s ease-out forwards;
		pointer-events: none;
	}

	@keyframes sparkfade {
		0% {
			transform: scale(0.6);
			opacity: 1;
		}
		100% {
			transform: scale(1.8) translateY(-10px);
			opacity: 0;
		}
	}

	/* Reduced motion: the halo and the pile's idle bob are ambient loops and
	 * stop (the halo stays lit); landpop, the twinkle and the fly-to-bag hop
	 * are one-shot reveals/crossings and stay. */
	@media (prefers-reduced-motion: reduce) {
		.candy::before {
			animation: none;
			opacity: 0.5;
		}

		.candy.landed :global(svg) {
			animation: none;
		}

		/* The nudge loop stops; the candy still asks — statically. */
		.candy.pickme :global(svg) {
			animation: none;
		}

		.candy.pickme::before {
			animation: none;
			opacity: 0.8;
			inset: -10px;
		}

		.ghostfly {
			transition-duration: 0.001ms;
		}
	}
</style>
