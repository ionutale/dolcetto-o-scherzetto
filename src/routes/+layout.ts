/**
 * The game is client-only: the run lives in the browser and is mirrored to
 * localStorage, so a server render would paint a fresh default state that the
 * client then throws away on hydration — or, worse, disagree with the save.
 */
export const ssr = false;
