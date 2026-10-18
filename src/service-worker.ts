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
 * - Voice clips (`/voice/`): cache-first, **runtime only**. There are 74 of
 *   them (37 ids × 2 languages) and they are not hashed, so precaching the
 *   whole tree at install would balloon the install for the handful of lines a
 *   visit actually speaks; instead each clip is cached the first time it is
 *   played (and re-cached if the cache is dropped) and served from that cache
 *   after. The directory it lives in is the only thing that names a language,
 *   so `/voice/it/...` and `/voice/en/...` are cached under their own keys.
 * - Everything else (`/music/`, `/ambience/`, future API routes): never
 *   intercepted. Those assets are single, versioned build files already
 *   precached with the rest, so a runtime rule would only add failure modes
 *   without adding offline coverage.
 *
 * All caches are versioned by the SvelteKit build id, so activation can
 * drop every older cache and a deploy never leaks stale entries.
 */

import { build, files, version } from '$service-worker';

const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `dos-cache-${version}`;
// All caches are versioned, so activation can drop everything else.
const SHELL_CACHE = `dos-cache-${version}-shell`;
// Voice clips cache-first at runtime (never precached); versioned like the rest.
const VOICE_CACHE = `dos-cache-${version}-voice`;
// The single canonical key every navigation is served from.
const SHELL_URL = '/';
// The voice tree, served cache-first at runtime rather than precached.
const VOICE_PREFIX = '/voice/';
// Everything SvelteKit ships: the hashed bundle plus static files
// (manifest, icons, music/ambience assets). Voice is deliberately excluded —
// it caches on demand through VOICE_CACHE instead.
const ASSETS = [...build, ...files].filter((path) => !path.startsWith(VOICE_PREFIX));

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
				if (key !== CACHE && key !== SHELL_CACHE && key !== VOICE_CACHE) await caches.delete(key);
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

	// Voice clips: cache-first, at runtime only (never precached — see the
	// header). A clip is immutable per id + language, so a cached copy is always
	// correct, and a miss fetches once and warms VOICE_CACHE for the next visit.
	//
	// **Key on the URL, not the element's request.** A media element fetched
	// with a `Range` header (the voice player did, before its 2026-10-18
	// WebAudio migration), so the network answered
	// **206 Partial Content** — and the Cache API refuses a 206 (`put` throws
	// `TypeError: Partial response (status code 206) is unsupported`). Keying on
	// the element's own request therefore stored *nothing* (the write failed
	// silently) and voice never went offline. Fetch the canonical whole clip (no
	// `Range`) and key the cache on its URL, so a later range request is answered
	// from the complete cached body — a media element plays a 200 fine.
	if (url.pathname.startsWith(VOICE_PREFIX)) {
		const voiceUrl = url.href;
		event.respondWith(
			caches.match(voiceUrl).then(async (cached) => {
				if (cached) return cached;
				const response = await fetch(voiceUrl);
				if (response.ok && response.status === 200) {
					const copy = response.clone();
					try {
						const cache = await caches.open(VOICE_CACHE);
						await cache.put(voiceUrl, copy);
					} catch {
						// A cache write failure must never break the live fetch.
					}
				}
				return response;
			})
		);
		return;
	}

	// Hashed build assets: immutable, so cache-first.
	if (ASSETS.includes(url.pathname)) {
		event.respondWith(caches.match(request).then((response) => response ?? fetch(request)));
	}
});
