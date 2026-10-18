<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import type { LayoutProps } from './$types';
	import { installCrashLog } from '$lib/diagnostics/crashlog';
	import { ambienceStats } from '$lib/audio/ambience.svelte';
	import { sfxStats } from '$lib/audio/sfx';
	import { voiceInfo } from '$lib/audio/voice';
	import { bag, candies, furthest, phase } from '$lib/state/game.svelte';
	import { menuState } from '$lib/ui/menu-state.svelte';

	let { children }: LayoutProps = $props();

	// PWA offline shell: SvelteKit bundles src/service-worker.ts to
	// /service-worker.js on every build. Registration is client-only and
	// guarded — browsers without service-worker support (and non-secure
	// origins in dev) simply run without the offline shell.
	//
	// The black box installs first (owner request): it records the boot, every
	// error and a heartbeat with the leak-hunt numbers — DOM nodes, WebAudio
	// created/disconnected, ambience loops, fps (see `diagnostics/crashlog.ts`)
	// — so an iPhone crash leaves evidence in localStorage instead of dying
	// with Safari's remote debugger.
	onMount(() => {
		installCrashLog({
			stats: () => {
				const audio = sfxStats();
				const amb = ambienceStats();
				const voice = voiceInfo();
				// The JS heap is Chromium-only; WebKit (Safari/iOS) exposes no
				// process-memory read to a page — the field stays `null` there
				// and the report shows growth of everything countable instead.
				let heap: number | null = null;
				try {
					const m = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
					if (typeof m?.usedJSHeapSize === 'number') {
						heap = Math.round((m.usedJSHeapSize / 1048576) * 10) / 10;
					}
				} catch {
					/* no heap API: keep null */
				}
				return {
					el: document.getElementsByTagName('*').length,
					svg: document.getElementsByTagName('svg').length,
					aC: audio.created,
					aD: audio.disconnected,
					aX: audio.ctx,
					amb: amb.live,
					sy: voice.plays,
					vc: voice.clips,
					vx: voice.errors,
					vs: voice.live,
					anim: typeof document.getAnimations === 'function' ? document.getAnimations().length : -1,
					js: heap,
					cq: audio.cues,
					cd: candies().length,
					bag: bag(),
					k: furthest(),
					ph: phase(),
					menu: menuState.open ? 1 : 0
				};
			}
		});
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js').catch(() => {
				// A failed registration must never break the game.
			});
		}
	});
</script>

{@render children()}
