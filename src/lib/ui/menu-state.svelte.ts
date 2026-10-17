/**
 * The title menu's open latch (owner feedback, "return to main menu").
 *
 * A UI-local runes store instead of a page-owned `$state`: the menu is closed
 * by `TitleScreen`'s Gioca and reopened by the HUD's 🏠 pill, which live in
 * different subtrees — and neither the page nor any wave owner has to thread
 * the flag through props. The page's `<TitleScreen onPlay={play}/>` keeps its
 * current shape; `play()` (audio unlock + landscape attempt) still runs on
 * every Gioca.
 */
export const menuState = $state({ open: true });

/** Reopen the menu (HUD 🏠). */
export function openMenu(): void {
	menuState.open = true;
}

/** Fade the menu away (Gioca). */
export function closeMenu(): void {
	menuState.open = false;
}
