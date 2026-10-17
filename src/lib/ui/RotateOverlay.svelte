<script lang="ts">
	/**
	 * The portrait "turn the phone" screen (ADR-0004 · spec §13): the game is a
	 * landscape verb, so a portrait viewport gets a friendly prompt instead of a
	 * squashed street.
	 *
	 * The prototype's `.rotatehint` block (`prototypes/scene-prototype.html`, v2,
	 * lines ~52-58), unchanged in behaviour: the element is always in the DOM and
	 * `@media (orientation: portrait)` is the only thing that reveals it, so a
	 * rotation needs no JS listener and cannot desync from the viewport — the
	 * overlay appears in the same frame the orientation flips, on top of a stage
	 * that the frame's own fit() is already re-measuring.
	 *
	 * Both languages at once, like the prototype: IT is the default the child
	 * reads, EN is the line underneath (T17 wires the real `lang` setting; the
	 * prompt must work before any setting has been read, and before audio/i18n
	 * exist at all).
	 *
	 * The rotating phone is the only motion here; it is an ambient loop, so it
	 * carries the global `.reduce-motion-off` utility (app.css) and parks at
	 * upright for a reduced-motion user — the words still say what to do.
	 */
</script>

<div class="rotate-overlay">
	<span class="rotate-overlay__phone reduce-motion-off" aria-hidden="true">📱</span>
	<p class="rotate-overlay__title">Gira il telefono</p>
	<p class="rotate-overlay__sub">Turn the phone to play</p>
</div>

<style>
	.rotate-overlay {
		display: none;
		position: fixed;
		inset: 0;
		z-index: 100;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		text-align: center;
		font-weight: 600;
		color: var(--cream);
		/* Room to breathe under a notch in either orientation. */
		padding: calc(var(--space-6) + env(safe-area-inset-top, 0px))
			calc(var(--space-6) + env(safe-area-inset-right, 0px))
			calc(var(--space-6) + env(safe-area-inset-bottom, 0px))
			calc(var(--space-6) + env(safe-area-inset-left, 0px));
		background: linear-gradient(180deg, var(--night-0), var(--night-1) 40%, var(--night-2));
	}

	.rotate-overlay__phone {
		display: block;
		font-size: 44px;
		line-height: 1;
		animation: turn 2.2s ease-in-out infinite;
	}

	.rotate-overlay__title {
		font-size: 1.2rem;
	}

	.rotate-overlay__sub {
		font-size: 0.85rem;
		font-weight: 500;
		opacity: 0.7;
	}

	@keyframes turn {
		0%,
		25% {
			transform: rotate(0deg);
		}
		65%,
		100% {
			transform: rotate(90deg);
		}
	}

	@media (orientation: portrait) {
		.rotate-overlay {
			display: flex;
		}
	}
</style>
