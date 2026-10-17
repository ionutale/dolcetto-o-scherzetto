<script lang="ts">
	/**
	 * Loads the sprite pack's motion stylesheet into the document once.
	 *
	 * The pack animates itself: `animCSS` (ported 1:1 in `./index.ts`) is the
	 * whole `@keyframes` set plus the `.s-body` / `.flame` / `.bat` / `.carve`
	 * … application rules and the `prefers-reduced-motion` kill switch. Port of
	 * `SPRITES.injectAnimCSS()` (`prototypes/pieces/sprites.js`, lines ~743-755):
	 * the `<style id="sprites-anim">` id guard makes it idempotent, so this can
	 * be composed anywhere — a second instance, or a manual `injectAnimCSS()`
	 * elsewhere, is a no-op.
	 *
	 * `onMount` runs after the component's DOM exists but before the next paint,
	 * so the stylesheet is in place for the sprites' first frame; nothing renders
	 * here, the element is a pure side-effect seam. `ssr = false` (see
	 * `+layout.ts`) means this never runs on a server, and `injectAnimCSS`
	 * resolves its own `document`, so importing it is safe anywhere.
	 */
	import { onMount } from 'svelte';
	import { injectAnimCSS } from './index';

	onMount(() => {
		injectAnimCSS();
	});
</script>
