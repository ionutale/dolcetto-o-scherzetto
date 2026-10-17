/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

/**
 * Offline strategy (version key `dos`; see ADR-0004 and spec §13):
 *
 * - Hashed build assets (`build`/`files`): precache-first. They are
 *   immutable, so a cached copy is always correct.
 * - The app shell (navigations): network-first. Online a deploy is picked
 *   up; offline the shell cached at install (and refreshed on every
 *   navigation) answers the cold start. Query strings vary (`?seed=`),
 *   so the shell is stored under the canonical key `/`.
 * - Everything else (`/voice/`, `/music/`, `/ambience/`, future API
 *   routes): never intercepted. Audio assets are hashed build files and
 *   already precached with the rest, so a runtime rule would only add
 *   failure modes without adding offline coverage.
 *
 * Both caches are versioned by the SvelteKit build id, so activation can
 * drop every older cache and a deploy never leaks stale entries.
 */

import { build, files, version } from '$service-worker';

const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `dos-cache-${version}`;
// Both caches are versioned, so activation can drop everything else.
const SHELL_CACHE = `dos-cache-${version}-shell`;
// The single canonical key every navigation is served from.
const SHELL_URL = '/';
// Everything SvelteKit ships: the hashed bundle plus static files
// (manifest, icons, voice/music/ambience assets).
const ASSETS = [...build, ...files];

worker.addEventListener('install', (event) => {
	event.waitUntil(
		Promise.all([
			caches.open(CACHE).then((cache) => cache.addAll(ASSETS)),
			// Warm the shell so the very first offline reload works. A failed
			// fetch (install while offline, server hiccup) must not fail the
			// install — the assets precache still stands.
			caches.open(SHELL_CACHE).then((cache) =>
				fetch(SHELL_URL)
					.then((response) => (response.ok ? cache.put(SHELL_URL, response) : undefined))
					.catch(() => undefined)
			)
		])
	);
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			for (const key of keys) {
				if (key !== CACHE && key !== SHELL_CACHE) await caches.delete(key);
			}
			await worker.clients.claim();
		})
	);
});

worker.addEventListener('fetch', (event) => {
	const { request } = event;
	// Saves and API traffic: GET only, same-origin.
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== worker.location.origin) return;

	// Navigations — the app shell. Network-first; the cached shell is the
	// offline cold start. Query strings vary (?seed=), so cache under `/`.
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request)
				.then(async (response) => {
					if (response.ok) {
						const copy = response.clone();
						try {
							const cache = await caches.open(SHELL_CACHE);
							await cache.put(SHELL_URL, copy);
						} catch {
							// A cache write failure must never break the live navigation.
						}
					}
					return response;
				})
				.catch(async () => (await caches.match(SHELL_URL)) ?? Response.error())
		);
		return;
	}

	// Hashed build assets: immutable, so cache-first.
	if (ASSETS.includes(url.pathname)) {
		event.respondWith(caches.match(request).then((response) => response ?? fetch(request)));
	}
});
