<script lang="ts">
	/**
	 * The rotate button (T4b, revised 2026-10-24) — the manual screen rotation.
	 *
	 * The manual half of the presentation rotation (T4b), still the only control
	 * that moves the angle: the player — not a sensor — decides how the stage
	 * sits. **Every tap
	 * turns the world a quarter turn to the left** (0° → 270° → 180° → 90° →
	 * 0°), so any hold can be made readable in a few taps; the angle is
	 * remembered in the settings envelope (`rotation.svelte.ts`). Since T43 it
	 * works in both rotation modes — `'auto'` may also show the CSS portrait
	 * prompt (`RotatePrompt.svelte`), and the button keeps driving the angle
	 * under it.
	 *
	 * It sits in the top-left corner under the bag chip — a corner the player
	 * never taps while walking or knocking (owner feedback: the bottom-centre
	 * spot stole walks from the stage halves). A tap never starts a walk: the
	 * stage-halves handler ignores taps whose target is a `button`.
	 */
	import { lang } from '$lib/state/game.svelte';
	import type { Lang } from '$lib/sim/loop';
	import { rotateLeft, rotation } from './rotation.svelte';

	/** The button's label, both languages (the visible art is the arrow). */
	const LABEL: Record<Lang, string> = {
		it: 'Gira il gioco a sinistra',
		en: 'Turn the game left'
	};
</script>

<button
	id="rotateBtn"
	type="button"
	class="rotatebtn"
	aria-label={LABEL[lang()]}
	title={LABEL[lang()]}
	data-rotation={rotation()}
	onclick={rotateLeft}
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
		<path d="M4 12a8 8 0 1 0 2.34-5.66" />
		<path d="M4 4v5h5" />
	</svg>
</button>

<style>
	/* A quiet circle in the top-left, right under the bag chip (which sits at
	   14/12): sky area, clear of the walk halves, the knock cloud and Bottega. */
	.rotatebtn {
		pointer-events: auto;
		position: absolute;
		top: 84px;
		left: 14px;
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

	.rotatebtn:active {
		background: rgba(247, 236, 217, 0.3);
		transform: scale(0.94);
	}

	.rotatebtn svg {
		width: 20px;
		height: 20px;
	}

	/* T32 focus ring, same amber as the walk buttons. */
	.rotatebtn:focus-visible {
		outline: 3px solid var(--amber);
		outline-offset: 3px;
	}
</style>
