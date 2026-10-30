<script lang="ts">
	/**
	 * The install guide (T45, 2026-10-30) — a parent-facing full-screen overlay
	 * opened from the home card's "Installa sul telefono" pill.
	 *
	 * Why it exists: iOS has **no install API** and no install prompt. The only
	 * way to add a web app to the Home Screen is Safari's Share sheet, so the
	 * game cannot ask for installation — it can only show the steps. One flow
	 * covers iOS 18 and iOS 27 (the same Share → Add to Home Screen path; iOS 18
	 * added the "Open as Web App" switch, and both versions can hide the row
	 * behind "Edit Actions…").
	 *
	 * Structure: it lives inside the title's `.menu` layer as an absolutely
	 * positioned full-viewport panel at z 300 — above the cards, below the log
	 * panel (z 400). The card scrolls on short landscape screens, focus moves to
	 * the close button on open, Tab wraps inside the overlay, Escape closes, and
	 * closing returns focus to the pill that opened it.
	 */
	import type { Lang } from '$lib/sim/loop';

	interface Props {
		/** The live language, owned by the title card. */
		lang: Lang;
		/** Close and return focus to the home card's install pill. */
		onClose: () => void;
	}
	let { lang, onClose }: Props = $props();

	/** One step: a sentence split so the action word can be bolded. */
	interface Step {
		before: string;
		strong: string;
		after?: string;
	}

	/** The screen's copy, both languages. */
	const COPY: Record<
		Lang,
		{ title: string; intro: string; steps: Step[]; notes: string[]; done: string }
	> = {
		it: {
			title: 'Installa sul telefono',
			intro: 'Safari non ha un pulsante «Installa»: il gioco si aggiunge alla schermata Home.',
			steps: [
				{
					before: 'Apri questo gioco in ',
					strong: 'Safari',
					after: '. Solo Safari può aggiungerlo alla Home.'
				},
				{
					before: 'Tocca ',
					strong: 'Condividi',
					after: ': il quadrato con la freccia in su.'
				},
				{ before: 'Scorri e tocca ', strong: 'Aggiungi alla schermata Home', after: '.' },
				{ before: 'Tocca ', strong: 'Aggiungi', after: ': l’icona appare nella Home.' }
			],
			notes: [
				'Se compare «Apri come app web», lascialo attivo: il gioco si apre a tutto schermo.',
				'Non vedi la voce? Tocca «Modifica azioni…» in fondo al menu Condividi e attivala.'
			],
			done: 'Ho capito'
		},
		en: {
			title: 'Install on your phone',
			intro: 'Safari has no “Install” button: the game is added to your Home Screen.',
			steps: [
				{
					before: 'Open this game in ',
					strong: 'Safari',
					after: '. Only Safari can add it to the Home Screen.'
				},
				{
					before: 'Tap ',
					strong: 'Share',
					after: ': the square with the arrow pointing up.'
				},
				{ before: 'Scroll and tap ', strong: 'Add to Home Screen', after: '.' },
				{ before: 'Tap ', strong: 'Add', after: ': the icon appears on your Home Screen.' }
			],
			notes: [
				'If “Open as Web App” appears, leave it on: the game opens full screen.',
				'Don’t see the row? Tap “Edit Actions…” at the bottom of the Share menu and turn it on.'
			],
			done: 'Got it'
		}
	};

	const copy = $derived(COPY[lang]);

	let closeButton = $state<HTMLButtonElement | null>(null);
	let overlay = $state<HTMLElement | null>(null);

	// Focus the close button when the overlay opens (it is the only guaranteed
	// way out for a keyboard user).
	$effect(() => {
		closeButton?.focus({ preventScroll: true });
	});

	/** Keep Tab inside the overlay: it has exactly two buttons. */
	function trapFocus(event: KeyboardEvent): void {
		if (event.key !== 'Tab' || !overlay) return;
		const focusable = overlay.querySelectorAll<HTMLElement>('button');
		if (focusable.length === 0) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			onClose();
			return;
		}
		trapFocus(event);
	}}
/>

<div
	class="install"
	bind:this={overlay}
	role="dialog"
	aria-modal="true"
	aria-labelledby="installTitle"
>
	<div class="install-card">
		<button
			bind:this={closeButton}
			type="button"
			class="install-close"
			aria-label={copy.done}
			onclick={onClose}>✕</button
		>

		<p class="install-badge">iPhone · iOS 18 · iOS 27</p>
		<h2 class="install-title" id="installTitle">{copy.title}</h2>
		<p class="install-intro">{copy.intro}</p>

		<ol class="install-steps">
			{#each copy.steps as step, index (index)}
				<li class="install-step">
					<span class="install-num" aria-hidden="true">{index + 1}</span>
					<span>{step.before}<b>{step.strong}</b>{step.after ?? ''}</span>
				</li>
			{/each}
		</ol>

		{#each copy.notes as note, index (index)}
			<p class="install-note">{note}</p>
		{/each}

		<button type="button" class="install-done" onclick={onClose}>{copy.done}</button>
	</div>
</div>

<style>
	/* Full-viewport wash inside the title's `.menu` layer (absolute, not fixed:
	   an ancestor backdrop-filter would trap a fixed box). z 300 is above the
	   menu cards and below the log panel (z 400). */
	.install {
		position: absolute;
		inset: 0;
		z-index: 300;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: calc(12px + env(safe-area-inset-top, 0px)) 12px
			calc(12px + env(safe-area-inset-bottom, 0px));
		background: rgba(12, 9, 26, 0.82);
		backdrop-filter: blur(4px);
	}

	.install-card {
		position: relative;
		width: min(620px, 100%);
		max-height: calc(100dvh - 24px);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 26px 30px 24px;
		background: color-mix(in srgb, var(--night-0) 72%, transparent);
		border: 1px solid var(--cream-line);
		border-radius: var(--r-lg);
		box-shadow: 0 30px 80px var(--shadow-night);
		color: var(--cream);
	}

	/* The close sits in the top-right corner, clear of the title. */
	.install-close {
		position: absolute;
		top: 10px;
		right: 10px;
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

	.install-close:active {
		background: rgba(247, 236, 217, 0.24);
	}

	.install-badge {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		opacity: 0.65;
	}

	.install-title {
		font-size: 24px;
		line-height: 1.15;
	}

	.install-intro {
		font-size: 14px;
		font-weight: 500;
		opacity: 0.85;
	}

	.install-steps {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin: 2px 0 0;
		padding: 0;
		list-style: none;
		font-size: 15px;
		line-height: 1.35;
	}

	.install-step {
		display: flex;
		align-items: flex-start;
		gap: 10px;
	}

	/* A numbered amber disc: the same accent as Gioca, small enough for prose. */
	.install-num {
		flex: 0 0 auto;
		width: 22px;
		height: 22px;
		margin-top: 1px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: linear-gradient(180deg, var(--amber), var(--amber-deep));
		color: var(--ink);
		font-size: 12px;
		font-weight: 700;
	}

	.install-note {
		font-size: 12.5px;
		font-weight: 500;
		line-height: 1.4;
		opacity: 0.7;
	}

	.install-done {
		align-self: center;
		margin-top: 4px;
		font-family: inherit;
		font-size: 15px;
		font-weight: 600;
		color: var(--cream);
		background: rgba(247, 236, 217, 0.1);
		border: 1px solid var(--cream-line);
		border-radius: var(--r-pill);
		padding: 10px 30px;
		cursor: pointer;
	}

	.install-done:hover,
	.install-close:hover {
		background: rgba(247, 236, 217, 0.18);
	}

	/* T32 focus rings, amber on the night card. */
	.install-close:focus-visible,
	.install-done:focus-visible {
		outline: 3px solid var(--amber);
		outline-offset: 3px;
	}
</style>
