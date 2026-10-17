<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// PWA offline shell: SvelteKit bundles src/service-worker.ts to
	// /service-worker.js on every build. Registration is client-only and
	// guarded — browsers without service-worker support (and non-secure
	// origins in dev) simply run without the offline shell.
	onMount(() => {
		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.register('/service-worker.js').catch(() => {
				// A failed registration must never break the game.
			});
		}
	});
</script>

{@render children()}
