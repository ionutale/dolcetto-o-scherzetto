<script lang="ts">
	/**
	 * The one-time iOS silent-switch tip (T44) — a small, non-blocking card over
	 * the sky that says what the platform cannot: "Non senti? Togli il
	 * silenzioso o usa le cuffie."
	 *
	 * It is not a dialog: nothing pauses, nothing is required, and it parks
	 * itself after 9 s. A tap on the ✕ (or waiting) writes `audioHintSeen`, so it
	 * never asks again. The whole reason it exists is that iOS exposes no mute
	 * signal — see `silent-hint.svelte.ts` for what does and does not exist.
	 */
	import { lang } from '$lib/state/game.svelte';
	import type { Lang } from '$lib/sim/loop';
	import { dismissSilentHint, silentHintOpen } from './silent-hint.svelte';

	/** The tip's copy, both languages. */
	const COPY: Record<Lang, { text: string; close: string }> = {
		it: { text: 'Non senti? Togli il silenzioso o usa le cuffie.', close: 'Chiudi' },
		en: { text: 'No sound? Turn off silent mode or use headphones.', close: 'Close' }
	};

	// An ambient hint, not a gate: it dismisses itself and remembers.
	$effect(() => {
		if (!silentHintOpen()) return;
		const timer = setTimeout(dismissSilentHint, 9000);
		return () => clearTimeout(timer);
	});
</script>

{#if silentHintOpen()}
	<div class="silent-hint" role="status" aria-live="polite">
		<span class="silent-hint__text">{COPY[lang()].text}</span>
		<button
			type="button"
			class="silent-hint__close"
			aria-label={COPY[lang()].close}
			onclick={dismissSilentHint}>✕</button
		>
	</div>
{/if}

<style>
	/* Top-centre over the sky: below the rotate prompt (z 100) and the title
	   (z 200), above the stage; clear of the bag chip and the walk halves. */
	.silent-hint {
		position: fixed;
		top: calc(env(safe-area-inset-top, 0px) + 12px);
		left: 50%;
		translate: -50% 0;
		z-index: 90;
		display: flex;
		align-items: center;
		gap: 10px;
		max-width: min(520px, calc(100vw - 24px));
		padding: 8px 10px 8px 16px;
		border-radius: var(--r-pill);
		background: rgba(25, 18, 49, 0.92);
		border: 1px solid var(--cream-line);
		color: var(--cream);
		font-size: 13.5px;
		font-weight: 600;
		line-height: 1.3;
		box-shadow: 0 10px 26px var(--shadow-night);
		backdrop-filter: blur(6px);
	}

	.silent-hint__text {
		flex: 1;
	}

	/* A 40 px tap target, inside the pill's padding. */
	.silent-hint__close {
		flex: 0 0 auto;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 0;
		border-radius: 50%;
		background: rgba(247, 236, 217, 0.12);
		color: var(--cream);
		font-family: inherit;
		font-size: 15px;
		line-height: 1;
		cursor: pointer;
	}

	.silent-hint__close:active {
		background: rgba(247, 236, 217, 0.24);
	}

	/* T32 focus ring, same amber as the walk buttons. */
	.silent-hint__close:focus-visible {
		outline: 3px solid var(--amber);
		outline-offset: 3px;
	}
</style>
