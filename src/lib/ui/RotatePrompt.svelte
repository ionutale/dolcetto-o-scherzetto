<script lang="ts">
	/**
	 * The portrait prompt (T43, 2026-10-29) — the T08 overlay restored as the
	 * *default* behaviour, now that the owner wants the automatic way back.
	 *
	 * This is still the pure-CSS screen it always was: the element is
	 * `display: none` and `@media (orientation: portrait)` is the only thing
	 * that reveals it, so a rotation needs no JS listener and cannot desync
	 * from the viewport — it appears in the same frame the orientation flips.
	 * There is **no accelerometer** here or anywhere else in the game; "auto"
	 * means the CSS media feature (ADR-0007).
	 *
	 * Two things are new since the deleted component:
	 *
	 *   1. It only exists while `rotationMode() === 'auto'` (T43). Manual mode
	 *      unmounts it, which is the T4b escape for a phone on rotation lock.
	 *   2. The line follows the `lang` setting instead of always printing IT
	 *      and EN stacked (the old prompt predated settings), and one pill —
	 *      `Gioca così` / `Play this way` — persists `'manual'` so the child can
	 *      stop being asked even when they cannot turn the phone. The Settings
	 *      card's `Schermo` row is the way back to `'auto'`.
	 *
	 * It sits at `z-index: 100`: above the stage and the boss (z 10), below the
	 * title menu (z 200), so the title's Impostazioni stays reachable while the
	 * prompt is up. The pill is focused whenever the overlay covers play, so a
	 * keyboard or screen-reader child can always leave it.
	 */
	import { lang } from '$lib/state/game.svelte';
	import type { Lang } from '$lib/sim/loop';
	import { menuState } from './menu-state.svelte';
	import { rotationMode, setRotationMode } from './rotation.svelte';

	/** The prompt's copy, both languages. */
	const COPY: Record<Lang, { title: string; escape: string }> = {
		it: { title: 'Gira il telefono', escape: 'Gioca così' },
		en: { title: 'Turn the phone to play', escape: 'Play this way' }
	};

	let escapeButton = $state<HTMLButtonElement | null>(null);

	/**
	 * Focus the escape whenever the prompt is actually covering play. While the
	 * title menu is up it sits above the prompt and owns the focus, so we stay
	 * out of its way (no autofocus stealing Gioca).
	 */
	$effect(() => {
		if (rotationMode() !== 'auto' || menuState.open) return;
		escapeButton?.focus({ preventScroll: true });
	});
</script>

{#if rotationMode() === 'auto'}
	<div
		class="rotate-overlay"
		role="dialog"
		aria-labelledby="rotatePromptTitle"
		data-mode={rotationMode()}
	>
		<span class="rotate-overlay__phone reduce-motion-off" aria-hidden="true">📱</span>
		<p class="rotate-overlay__title" id="rotatePromptTitle">{COPY[lang()].title}</p>
		<button
			bind:this={escapeButton}
			id="rotatePromptEscape"
			type="button"
			class="rotate-overlay__escape"
			onclick={() => setRotationMode('manual')}
		>
			{COPY[lang()].escape}
		</button>
	</div>
{/if}

<style>
	.rotate-overlay {
		display: none;
		position: fixed;
		inset: 0;
		/* Above the stage and the boss (z 10), below the title menu (z 200). */
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

	/* The escape (T43): the one control on an otherwise blocking panel. */
	.rotate-overlay__escape {
		font-family: inherit;
		font-size: 15px;
		font-weight: 600;
		color: var(--cream);
		background: rgba(247, 236, 217, 0.1);
		border: 1px solid var(--cream-line);
		border-radius: var(--r-pill);
		padding: 9px 26px;
		cursor: pointer;
	}

	.rotate-overlay__escape:hover {
		background: rgba(247, 236, 217, 0.18);
	}

	/* T32 focus ring, same amber as the walk buttons. */
	.rotate-overlay__escape:focus-visible {
		outline: 3px solid var(--amber);
		outline-offset: 3px;
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
