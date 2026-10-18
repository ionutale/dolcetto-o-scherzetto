/**
 * The log panel's open latch + entry view (owner ask, 2026-10-18).
 *
 * Same shape as `menu-state.svelte.ts`: the Settings card (parent-facing) and
 * the title's hidden build line both open the one panel hosted by the title,
 * without threading props between subtrees. `view` picks what it opens on:
 * the live/previous session (`current`) or the crash archive list (`list`).
 */
export const logPanel = $state({ open: false, view: 'current' as 'current' | 'list' });

/** Open the panel on `view` (defaults to the live session view). */
export function openLogs(view: 'current' | 'list' = 'current'): void {
	logPanel.view = view;
	logPanel.open = true;
}

/** Close the panel. */
export function closeLogs(): void {
	logPanel.open = false;
}
