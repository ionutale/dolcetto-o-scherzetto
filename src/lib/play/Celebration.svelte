<script lang="ts">
	/**
	 * T18 — the neighborhood celebration beat: a small, restrained banner that
	 * drops in top-centre with the name of the neighborhood just entered and a
	 * soft sparkle sweep across it, then leaves after ~2.6 s.
	 *
	 * Spec §4.2/§9: "Every ~10 homes the street becomes a new neighborhood … A
	 * small celebration beat marks each transition." The *decision* of when a
	 * beat is due lives in `celebration-model.ts` (pure, pinned); this component
	 * only renders the `beat` the page hands it and owns its own on-screen life.
	 *
	 * **One beat, keyed by index.** The page assigns a **fresh** `Beat` object
	 * per fire, so the effect below re-arms on every transition; `{#key
	 * shown.index}` re-mounts the banner so the sweep restarts cleanly and two
	 * quick transitions can never share one animation. A `null` `beat` (before
	 * the first transition) renders nothing.
	 *
	 * **The stinger hook.** `onStinger(theme)` fires once per beat, right as it
	 * appears — a **no-op** today (T23/T25/T27 own the audio). It exists so the
	 * sound wiring is a one-line change later and nothing here has to know about
	 * WebAudio.
	 *
	 * **Reduced motion** (ART-STYLE §4 rule 4): the sparkle sweep is an ambient
	 * flourish, so its `<i>` carries the shared `.reduce-motion-off` utility —
	 * killed under `prefers-reduced-motion: reduce`. The banner's own
	 * fade/slide is a reveal (fades stay, per the spec), so it keeps its
	 * transition. Nothing here takes a pointer.
	 */
	import { untrack } from 'svelte';
	import { lang } from '$lib/state/game.svelte';
	import { themeName } from '$lib/i18n/lines';
	import type { Theme } from '$lib/sim/progression';
	import type { Beat } from './celebration-model';

	interface Props {
		/** The beat to show, or `null`; a fresh object per transition re-arms it. */
		beat: Beat | null;
		/** Called once per beat as it appears. No-op by default (audio lands later). */
		onStinger?: (theme: Theme) => void;
	}
	let { beat, onStinger }: Props = $props();

	/** How long a beat stays on screen (spec: a *small* celebration). */
	const BEAT_MS = 2600;

	/** The beat currently rendered, or `null` between beats. */
	let shown = $state<Beat | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	// A new `beat` object is a new transition: show it, sting, and arm the hide.
	$effect(() => {
		const next = beat;
		if (!next) return;
		shown = next;
		// Read the hook without subscribing: a recreated callback prop must not
		// re-arm (and re-sting) a beat that is already on screen.
		untrack(() => onStinger?.(next.theme));
		clearTimeout(timer);
		timer = setTimeout(() => {
			shown = null;
		}, BEAT_MS);
	});

	// Cancel a pending hide if the page goes away mid-beat.
	$effect(() => () => clearTimeout(timer));
</script>

<div class="layer" aria-live="polite">
	{#if shown}
		{#key shown.index}
			<div class="beat" role="status">
				<span class="sweep" aria-hidden="true"><i class="reduce-motion-off"></i></span>
				<span class="spark" aria-hidden="true">✨</span>
				<span class="name">{themeName(lang(), shown.theme)}</span>
				<span class="spark" aria-hidden="true">✨</span>
			</div>
		{/key}
	{/if}
</div>

<style>
	/* Full-stage, click-through — the banner never steals a tap (spec §6). */
	.layer {
		position: absolute;
		inset: 0;
		z-index: 16;
		pointer-events: none;
	}

	.beat {
		position: absolute;
		top: 18px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 18px;
		border-radius: var(--r-pill);
		background: color-mix(in srgb, var(--night-0) 62%, transparent);
		border: 1px solid var(--cream-line);
		box-shadow: 0 12px 30px var(--shadow-night);
		backdrop-filter: blur(6px);
		color: var(--cream);
		font-weight: 700;
		font-size: 15px;
		letter-spacing: 0.02em;
		white-space: nowrap;
		overflow: hidden;
		animation: drop 0.42s cubic-bezier(0.3, 1.4, 0.6, 1);
	}

	/* The theme's name — the whole point of the beat. */
	.name {
		color: var(--cream);
	}

	.spark {
		font-size: 13px;
		opacity: 0.85;
	}

	/* The sparkle sweep: a soft diagonal highlight gliding across once. It is an
	 * ambient flourish (transform only), so the `<i>` carries the reduced-motion
	 * utility and parks off-screen for a reduce-motion player. */
	.sweep {
		position: absolute;
		inset: 0;
		overflow: hidden;
		border-radius: inherit;
		pointer-events: none;
	}

	.sweep i {
		position: absolute;
		top: -30%;
		bottom: -30%;
		left: 0;
		width: 46%;
		background: linear-gradient(100deg, transparent, var(--cream-soft) 50%, transparent);
		transform: translateX(-160%);
		animation: sweep 2.6s ease-out;
	}

	@keyframes sweep {
		from {
			transform: translateX(-160%);
		}
		to {
			transform: translateX(360%);
		}
	}

	/* The entrance is a reveal (fade + a small drop), so it stays for a
	 * reduce-motion player — the spec keeps fades and crossings. */
	@keyframes drop {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%);
		}
	}
</style>
