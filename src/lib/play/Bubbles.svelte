<script lang="ts">
	/**
	 * The speech bubble layer (T11) — one bubble, positioned in stage-logical
	 * px, over everything else on the stage.
	 *
	 * Port of the prototype's `#bubble` element and its `.bubble` block
	 * (`prototypes/scene-prototype.html`, HTML ~427, CSS ~270-277): the same
	 * anchor (`translate(-50%, -100%)`, so `(x, y)` is the tail's tip), the
	 * same 240 px measure, the same 0.22 s pop and the same `.small` size the
	 * kids' shout uses. `var(--paper)` here is the prototype's `--paper-2`
	 * (#fffdf8 — the tokens renamed the warmer sheet to `--cream`).
	 *
	 * State lives in `bubble.svelte.ts`; this component renders it. It is
	 * `pointer-events: none` like the prototype's layer, so a line shown over
	 * the knock pill or a candy never steals its tap.
	 *
	 * Reduced motion: the pop is a reveal, not an ambient loop — the bubble
	 * still appears and fades, it just snaps instead of scaling (the same
	 * choice `HouseSlot` makes for the door swing).
	 */
	import { bubble } from './bubble.svelte';

	const view = $derived(bubble());
</script>

<div
	class="bubble"
	class:show={view.show}
	class:small={view.small}
	style="left: {view.x}px; top: {view.y}px"
>
	{view.text}
</div>

<style>
	.bubble {
		position: absolute;
		z-index: 14;
		max-width: 240px;
		border-radius: 16px;
		padding: 10px 14px;
		background: var(--paper);
		color: var(--ink);
		font-weight: 600;
		font-size: 14px;
		line-height: 1.35;
		box-shadow: 0 12px 30px rgba(10, 6, 30, 0.5);
		transform: translate(-50%, -100%) scale(0.6);
		opacity: 0;
		transition:
			transform 0.22s cubic-bezier(0.3, 1.5, 0.6, 1),
			opacity 0.18s;
		pointer-events: none;
	}

	.bubble.show {
		transform: translate(-50%, -100%) scale(1);
		opacity: 1;
	}

	/* The tail: a rotated square tucked under the bubble, prototype-exact. */
	.bubble::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: -7px;
		margin-left: -7px;
		width: 14px;
		height: 14px;
		background: var(--paper);
		transform: rotate(45deg);
		border-radius: 3px;
	}

	.bubble.small {
		font-size: 12.5px;
		padding: 7px 11px;
	}

	/* A reduced-motion player still gets the line — the reveal just snaps. */
	@media (prefers-reduced-motion: reduce) {
		.bubble {
			transition-duration: 0.001ms;
		}
	}
</style>
