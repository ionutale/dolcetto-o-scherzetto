<script lang="ts">
	/**
	 * Impostazioni (T17) — the settings card behind the title's `Impostazioni`:
	 * the separate **Music** and **SFX** sliders (spec §6/§13), the IT/EN
	 * language toggle, and `Indietro` back to the title.
	 *
	 * Port of the prototype's `#settingsPanel` (`prototypes/scene-prototype.html`,
	 * CSS ~351-354, markup ~451-456, handlers ~901-912): the two `.slider-row`s
	 * with `accent-color: var(--amber)` and their `<output>`s, and the ghost
	 * `.menu-settings` back pill. Reported adaptations:
	 *   1. The pair persists through the device's one settings envelope
	 *      (`dos.settings.v1`, via `volumes.svelte.ts`) instead of the
	 *      prototype's private `dos.proto.settings` key — one slot, cleared by
	 *      the same reset (ADR-0006 · spec §13).
	 *   2. The prototype had no language control here; T17 adds the IT/EN
	 *      toggle the plan asks for. It writes the same envelope `lang` the rest
	 *      of the UI reads (`settings.read().lang`, the seam `Bottega`/`flow`
	 *      use) and dispatches the sim's `LANG` so the run field agrees.
	 *   3. The panel copy follows the language (the prototype was IT-only).
	 *
	 * The language is a **prop**, owned by `TitleScreen`, so the title's own
	 * labels flip with it; this card is otherwise presentational and talks to
	 * the world only through `dispatch` and the volumes store.
	 */
	import { dispatch } from '$lib/state/game.svelte';
	import { settings } from '$lib/persist/settings';
	import type { Lang } from '$lib/sim/loop';
	import { setMusic, setSfx, volumes } from '$lib/audio/volumes.svelte';

	interface Props {
		/** The live language, owned by the title so its labels follow. */
		lang: Lang;
		/** Called after a language change so the owner re-renders its copy. */
		onLang: (next: Lang) => void;
		/** Back to the title card (the prototype's `Indietro`). */
		onBack: () => void;
	}
	let { lang, onLang, onBack }: Props = $props();

	/** The card's copy, per language. */
	const copy = $derived(
		lang === 'it'
			? {
					title: 'Impostazioni',
					music: '🎵 Musica',
					sfx: '🔊 Effetti',
					language: 'Lingua',
					back: 'Indietro',
					wipe: 'Cancella progressi (genitori)',
					wipeConfirm: 'Sicuro? Tocca di nuovo'
				}
			: {
					title: 'Settings',
					music: '🎵 Music',
					sfx: '🔊 Sound effects',
					language: 'Language',
					back: 'Back',
					wipe: 'Erase progress (parents)',
					wipeConfirm: 'Sure? Tap again'
				}
	);

	/**
	 * Parent reset (plan T17 acceptance): long-press the card title ~0.9 s to
	 * reveal the wipe, then two taps to confirm — kid-proof by construction.
	 * Clears the run AND the settings envelope, then reloads.
	 */
	let wipeArmed = $state(false);
	let wipeConfirm = $state(false);
	let pressTimer: number | null = null;
	function pressStart(): void {
		pressTimer = window.setTimeout(() => (wipeArmed = true), 900);
	}
	function pressEnd(): void {
		if (pressTimer !== null) {
			clearTimeout(pressTimer);
			pressTimer = null;
		}
	}
	function wipe(): void {
		if (!wipeConfirm) {
			wipeConfirm = true;
			return;
		}
		try {
			localStorage.removeItem('dos.run.v1');
			localStorage.removeItem('dos.settings.v1');
			// The black box's two keys (diagnostics/crashlog) go with the rest:
			// "delete everything" means everything.
			localStorage.removeItem('dos.log.live.v1');
			localStorage.removeItem('dos.log.prev.v1');
		} catch {
			/* a hostile storage must not stop the reset */
		}
		location.reload();
	}

	/** The Music slider (0..100) → the store's `music` gain. */
	function onMusic(event: Event): void {
		setMusic(Number((event.currentTarget as HTMLInputElement).value) / 100);
	}

	/** The SFX slider (0..100) → the store's `sfx` gain. */
	function onSfx(event: Event): void {
		setSfx(Number((event.currentTarget as HTMLInputElement).value) / 100);
	}

	/**
	 * IT ⇄ EN (spec §6): persist first — the envelope is the live source the
	 * rest of the UI reads — then tell the sim, then let the title re-render.
	 */
	function pick(next: Lang): void {
		if (next === lang) return;
		settings.write({ ...settings.read(), lang: next });
		dispatch({ type: 'LANG' });
		onLang(next);
	}
</script>

<h2
	class="settings-title"
	onpointerdown={pressStart}
	onpointerup={pressEnd}
	onpointerleave={pressEnd}
>
	{copy.title}
</h2>

{#if wipeArmed}
	<button id="wipeBtn" class="wipe" onclick={wipe}
		>{wipeConfirm ? copy.wipeConfirm : copy.wipe}</button
	>
{/if}

<label class="slider-row">
	<span>{copy.music}</span>
	<input
		id="musicVol"
		type="range"
		min="0"
		max="100"
		step="1"
		value={Math.round(volumes().music * 100)}
		aria-label={copy.music}
		oninput={onMusic}
	/>
	<output for="musicVol">{Math.round(volumes().music * 100)}</output>
</label>

<label class="slider-row">
	<span>{copy.sfx}</span>
	<input
		id="sfxVol"
		type="range"
		min="0"
		max="100"
		step="1"
		value={Math.round(volumes().sfx * 100)}
		aria-label={copy.sfx}
		oninput={onSfx}
	/>
	<output for="sfxVol">{Math.round(volumes().sfx * 100)}</output>
</label>

<div class="lang-row" role="group" aria-label={copy.language}>
	<span class="lang-label">{copy.language}</span>
	<button
		type="button"
		class="lang-btn"
		class:on={lang === 'it'}
		aria-pressed={lang === 'it'}
		aria-label="Italiano"
		onclick={() => pick('it')}>IT</button
	>
	<button
		type="button"
		class="lang-btn"
		class:on={lang === 'en'}
		aria-pressed={lang === 'en'}
		aria-label="English"
		onclick={() => pick('en')}>EN</button
	>
</div>

<button type="button" class="menu-settings" onclick={onBack}>{copy.back}</button>

<style>
	/* `.menu-title2` (prototype ~341): the settings card's heading. */
	.settings-title {
		font-size: 22px;
		color: var(--cream);
	}

	/* The parent reset (plan T17): revealed by the title long-press. */
	.wipe {
		font-family: inherit;
		font-size: 13.5px;
		font-weight: 600;
		color: var(--pumpkin-deep);
		background: color-mix(in srgb, var(--pumpkin) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--pumpkin-deep) 45%, transparent);
		border-radius: var(--r-pill);
		padding: 8px 18px;
		cursor: pointer;
	}

	/* `.slider-row` (prototype ~351-353), verbatim: label · track · output. */
	.slider-row {
		display: flex;
		align-items: center;
		gap: 12px;
		color: var(--cream);
		font-weight: 600;
		font-size: 15px;
		min-width: 280px;
	}

	.slider-row input[type='range'] {
		flex: 1;
		accent-color: var(--amber);
	}

	/* T32 focus ring on the slider track (amber on the night card). */
	.slider-row input[type='range']:focus-visible {
		outline: 3px solid var(--amber);
		outline-offset: 3px;
	}

	.slider-row output {
		width: 34px;
		text-align: right;
		opacity: 0.85;
	}

	/* The language toggle (the prototype had none): a label + an IT/EN pair. */
	.lang-row {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--cream);
		font-weight: 600;
		font-size: 15px;
		min-width: 280px;
	}

	.lang-label {
		flex: 1;
	}

	.lang-btn {
		font-family: inherit;
		font-size: 14px;
		font-weight: 700;
		color: var(--cream);
		background: rgba(247, 236, 217, 0.1);
		border: 1px solid var(--cream-line);
		border-radius: var(--r-pill);
		padding: 6px 16px;
		cursor: pointer;
	}

	.lang-btn.on {
		background: linear-gradient(180deg, var(--amber), var(--amber-deep));
		color: var(--ink);
		border-color: transparent;
	}

	/* `.menu-settings` (prototype ~347-350): the ghost back pill. */
	.menu-settings {
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

	.menu-settings:hover {
		background: rgba(247, 236, 217, 0.18);
	}

	/* T32 focus rings on the card's buttons (amber reads on the night card). */
	.lang-btn:focus-visible,
	.menu-settings:focus-visible,
	.wipe:focus-visible {
		outline: 3px solid var(--amber);
		outline-offset: 3px;
	}
</style>
