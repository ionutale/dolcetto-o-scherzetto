<script lang="ts">
	/**
	 * The flip button (T4b, 2026-10-19) — the manual screen orientation.
	 *
	 * Replaces the old "Gira il telefono" prompt and the landscape lock: the
	 * player — not the accelerometer — decides the presentation. One tap turns
	 * the world a quarter turn (`flip.svelte.ts`); the choice is remembered in
	 * the settings envelope. It lives bottom-centre between the walk buttons,
	 * styled as their quiet sibling so it reads as a game control and not a
	 * system dialog.
	 *
	 * A tap never starts a walk: the stage-halves handler ignores taps whose
	 * target is a `button` (WalkControls' guard), and this is one.
	 */
	import { lang } from '$lib/state/game.svelte';
	import type { Lang } from '$lib/sim/loop';
	import { flip, toggleFlip } from './flip.svelte';

	/** The button's label, both languages (the visible art is the arrows). */
	const LABEL: Record<Lang, string> = {
		it: 'Gira il gioco',
		en: 'Turn the game'
	};
</script>

<button
	id="flipBtn"
	type="button"
	class="flipbtn reduce-motion-off"
	aria-label={LABEL[lang()]}
	title={LABEL[lang()]}
	data-flip={flip()}
	onclick={toggleFlip}
>
	<svg
		viewBox="0 0 24 24"
		aria-hidden="true"
		fill="none"
		stroke="currentColor"
		stroke-width="2.2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path d="M20 12a8 8 0 1 1-2.34-5.66" />
		<path d="M20 4v5h-5" />
	</svg>
</button>

<style>
	/* The walk buttons' quiet sibling (WalkControls' `.walkbtn` block): a 44 px
	   circle, bottom-centre, on the road band. */
	.flipbtn {
		pointer-events: auto;
		position: absolute;
		bottom: 22px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 11;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: rgba(247, 236, 217, 0.14);
		border: 1px solid rgba(247, 236, 217, 0.38);
		color: var(--cream);
		display: flex;
		align-items: center;
		justify-content: center;
		backdrop-filter: blur(4px);
		cursor: pointer;
		touch-action: none;
		opacity: 0.9;
	}

	.flipbtn:active {
		background: rgba(247, 236, 217, 0.3);
		transform: translateX(-50%) scale(0.94);
	}

	.flipbtn svg {
		width: 20px;
		height: 20px;
	}

	/* T32 focus ring, same amber as the walk buttons. */
	.flipbtn:focus-visible {
		outline: 3px solid var(--amber);
		outline-offset: 3px;
	}
</style>
