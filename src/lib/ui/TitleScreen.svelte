<script lang="ts">
	/**
	 * The title screen (T17) — the opening menu over the scene: the night card
	 * with the eyebrow, the game's name, the pulsing **Gioca** and the ghost
	 * **Impostazioni**, and the settings card swapped in behind it.
	 *
	 * Port of the prototype's `#menu` overlay (`prototypes/scene-prototype.html`,
	 * CSS ~331-355, markup ~444-457, the three clicks ~900-909): the fixed
	 * full-viewport wash, the frosted `.menu-card`, the `.menu-eyebrow`, the
	 * 36 px `.menu-title`, the amber `.menu-play` with its `menuInvite` pulse,
	 * the ghost `.menu-settings` pill, and the `hidden` swap between the home
	 * and settings cards. The overlay hides with a `.hide` class (`opacity:0` +
	 * `pointer-events:none`) rather than unmounting, exactly as the prototype
	 * did — so the swap is a fade, not a pop.
	 *
	 * Adaptations (reported, not silent):
	 *   1. The settings card is the `Settings.svelte` component (the sliders +
	 *      the IT/EN toggle); here it is just a sibling card in the same swap.
	 *   2. The wash and the card are re-keyed to §3 tokens (`--night-0/1/2`,
	 *      `--cream-line`, `--r-lg`) instead of the prototype's literal purples.
	 *   3. The `menuInvite` pulse carries the repo's `.reduce-motion-off`
	 *      utility (T02's policy) instead of a local `animation:none` block.
	 *   4. The language is owned here (read from the settings envelope) so the
	 *      card's own copy flips with the toggle; `Settings` reports changes up.
	 *   5. **Reopenable (owner feedback).** The open latch lives in the shared
	 *      `menu-state.svelte.ts` runes store: Gioca closes it, the HUD's 🏠
	 *      reopens it — the overlay returns with the same fade, reset to the
	 *      home card.
	 *
	 * **Play does not unlock anything here.** `Gioca` only fades the overlay and
	 * calls `onPlay`; the audio unlock and the landscape-lock attempt belong to
	 * the page (`+page.svelte`), which owns the process-wide gesture listener.
	 */
	import { onMount } from 'svelte';
	import { crashlog } from '$lib/diagnostics/crashlog';
	import { settings } from '$lib/persist/settings';
	import type { Lang } from '$lib/sim/loop';
	import BlackBox from './BlackBox.svelte';
	import CrashBanner from './CrashBanner.svelte';
	import Settings from './Settings.svelte';
	import { menuState, closeMenu } from './menu-state.svelte';

	interface Props {
		/**
		 * Gioca. The page uses this to run its first-gesture audio unlock and the
		 * guarded `screen.orientation.lock('landscape')` attempt (spec §6).
		 */
		onPlay?: () => void;
	}
	let { onPlay }: Props = $props();

	/** Which card shows: the home card or the settings card. */
	let panel = $state<'home' | 'settings'>('home');
	/** The live language; the settings envelope holds it, `Settings` writes it. */
	let lang = $state<Lang>(settings.read().lang);

	/* ------------------------------------------------------------------ */
	/* the black box (owner request) — crash banner + the hidden viewer    */
	/* ------------------------------------------------------------------ */

	/** The boot verdict: was the previous session interrupted? (once). */
	const crashInfo = crashlog.info();
	/** ✕ on the banner hides it for this boot. */
	let crashDismissed = $state(false);
	/** The full-log viewer. */
	let boxOpen = $state(false);
	/** Triple-tap the build line to open the viewer (kid-proof by accident). */
	let versionTaps = 0;
	let versionTimer: ReturnType<typeof setTimeout> | undefined;
	function tapVersion(): void {
		versionTaps += 1;
		clearTimeout(versionTimer);
		if (versionTaps >= 3) {
			versionTaps = 0;
			boxOpen = true;
			return;
		}
		versionTimer = setTimeout(() => (versionTaps = 0), 700);
	}

	/** `?debug` opens the viewer directly (desktop triage). */
	onMount(() => {
		try {
			if (new URLSearchParams(location.search).has('debug')) boxOpen = true;
		} catch {
			/* no location: no debug entry */
		}
	});

	/** A reopened menu always comes back to the home card. */
	$effect(() => {
		if (menuState.open) panel = 'home';
	});

	const copy = $derived(
		lang === 'it'
			? {
					eyebrow: '🎃 Una notte di caramelle',
					play: 'Gioca ▶',
					settings: '⚙️ Impostazioni',
					menu: 'Menu principale',
					build: 'Diario di bordo — tocca tre volte'
				}
			: {
					eyebrow: '🎃 A night of candy',
					play: 'Play ▶',
					settings: '⚙️ Settings',
					menu: 'Main menu',
					build: 'Flight log — tap 3 times'
				}
	);

	/** Gioca: fade the menu, then hand the gesture to the page. */
	function play(): void {
		closeMenu();
		onPlay?.();
	}

	/** `Impostazioni`: swap the settings card in. */
	function showSettings(): void {
		panel = 'settings';
	}

	/** `Indietro`: swap the home card back. */
	function showHome(): void {
		panel = 'home';
	}
</script>

<div
	class="menu"
	class:hide={!menuState.open}
	role="dialog"
	aria-label={copy.menu}
	inert={!menuState.open}
>
	<!-- T29 — the flux2 key-art band (decorative). -->
	<img class="menu-hero" src="/art/hero.v1.webp" alt="" aria-hidden="true" />

	<div class="menu-card" hidden={panel !== 'home'}>
		{#if crashInfo.crashed && !crashDismissed}
			<CrashBanner onDismiss={() => (crashDismissed = true)} onOpenLogs={() => (boxOpen = true)} />
		{/if}
		<p class="menu-eyebrow">{copy.eyebrow}</p>
		<h1 class="menu-title">Dolcetto o Scherzetto</h1>
		<button type="button" class="menu-play reduce-motion-off" onclick={play}>{copy.play}</button>
		<button type="button" class="menu-settings" onclick={showSettings}>{copy.settings}</button>
		<button type="button" class="menu-build" aria-label={copy.build} onclick={tapVersion}
			>build {crashInfo.meta.v}</button
		>
	</div>

	<div class="menu-card" hidden={panel !== 'settings'}>
		<Settings {lang} onLang={(next) => (lang = next)} onBack={showHome} />
	</div>

	<BlackBox open={boxOpen} onClose={() => (boxOpen = false)} />
</div>

<style>
	/* `.menu` (prototype ~332-335): the fixed, full-viewport night wash. */
	.menu {
		position: fixed;
		inset: 0;
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		background:
			radial-gradient(1200px 600px at 70% -10%, var(--night-2) 0%, transparent 60%),
			linear-gradient(180deg, var(--night-0), var(--night-1) 45%, var(--night-2));
		transition: opacity 0.35s ease;
	}

	.menu.hide {
		opacity: 0;
		pointer-events: none;
	}

	/* T29 — the flux2 key-art band: a scenic strip grounded under the card.
	   Masked at the top so the night wash carries the fade; never clickable. */
	.menu-hero {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		width: 100%;
		height: 46%;
		object-fit: cover;
		object-position: center 60%;
		opacity: 0.92;
		-webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 38%);
		mask-image: linear-gradient(180deg, transparent 0%, #000 38%);
		pointer-events: none;
		user-select: none;
	}

	/* `.menu-card` (prototype ~336-338): the frosted night card. The max-height
	   + scroll guard the crash-banner case: banner + card can exceed a 393 pt
	   landscape screen, and a clipped Gioca would strand the player. */
	.menu-card {
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		padding: 34px 42px;
		background: color-mix(in srgb, var(--night-0) 55%, transparent);
		border: 1px solid var(--cream-line);
		border-radius: var(--r-lg);
		box-shadow: 0 30px 80px var(--shadow-night);
		backdrop-filter: blur(6px);
		max-height: calc(100vh - 20px);
		max-height: calc(100dvh - 20px);
		overflow-y: auto;
	}

	/* `.menu-card[hidden]` (prototype ~354): the swap must beat the card's own
	 * `display:flex`, so the rule is explicit rather than relying on the UA sheet. */
	.menu-card[hidden] {
		display: none;
	}

	/* `.menu-eyebrow` (prototype ~339). */
	.menu-eyebrow {
		font-size: 13px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		opacity: 0.7;
	}

	/* `.menu-title` (prototype ~340). */
	.menu-title {
		font-size: 36px;
		color: var(--cream);
	}

	/* `.menu-play` (prototype ~342-345): the amber CTA with the invite pulse. */
	.menu-play {
		font-family: inherit;
		font-size: 22px;
		font-weight: 700;
		color: var(--ink);
		background: linear-gradient(180deg, var(--amber), var(--amber-deep));
		border: none;
		border-radius: var(--r-pill);
		padding: 14px 54px;
		cursor: pointer;
		box-shadow: 0 12px 30px var(--amber-glow);
		animation: menuInvite 1.6s ease-in-out infinite alternate;
	}

	/* `.menu-settings` (prototype ~347-350): the ghost settings pill. */
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

	/* The build line (the black box's hidden door): tiny, muted, triple-tap. */
	.menu-build {
		font-family: inherit;
		font-size: 10px;
		letter-spacing: 0.06em;
		color: var(--cream);
		opacity: 0.4;
		background: none;
		border: none;
		padding: 4px 8px;
		cursor: default;
	}

	/* T32 focus rings (amber on the night card). */
	.menu-play:focus-visible,
	.menu-settings:focus-visible,
	.menu-build:focus-visible {
		outline: 3px solid var(--amber);
		outline-offset: 3px;
	}

	@keyframes menuInvite {
		from {
			transform: scale(1);
		}
		to {
			transform: scale(1.05);
		}
	}
</style>
