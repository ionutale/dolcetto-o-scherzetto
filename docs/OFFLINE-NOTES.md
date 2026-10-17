# OFFLINE-NOTES — PWA / service-worker verification (T33)

Verification of the **built** app (`pnpm build` + `pnpm preview`) driven through the
Chrome DevTools MCP. Read-mostly task; the only files touched were the two allowed
targets — `src/service-worker.ts` (one defect fixed) and
`static/manifest.webmanifest` (inspected, no change) — plus this doc.

- **Build under test:** SvelteKit build id `1792267820549` (served SW cache names
  `dos-cache-1792267820549{,-shell,-voice}`).
- **Served via:** isolated `vite preview` snapshot on `http://localhost:5213/`
  (a sibling agent rebuilds `.svelte-kit/output` in the shared tree, so the frozen
  snapshot was used to keep the run reproducible — see *Caveats*).
- **Spec §13 target:** PWA, manifest `orientation: landscape`, offline shell.

## 1. Findings

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1a | `/service-worker.js` served | **PASS** | `200`, `text/javascript` |
| 1b | `navigator.serviceWorker.ready` resolves | **PASS** | resolves; active state `activated` |
| 1c | `registration.scope` correct | **PASS** | `http://localhost:5213/` (root scope), `scriptURL …/service-worker.js`, controller set |
| 1d | Manifest fields per spec §13 | **PASS** | `name`, `short_name`, `start_url:/`, `scope:/`, `display:standalone`, `orientation:landscape`, `theme_color:#241d45`, `background_color:#191231`, `lang:it` |
| 1e | Icons 192/512 (+ maskable) | **PASS** | `icon-192.png` (192×192), `icon-512.png` (512×512), `icon-512-maskable.png` (512×512, `purpose:maskable`) |
| 1f | Every referenced icon 200s | **PASS** | all `200` + `image/png`; `apple-touch-icon.png` 180×180 `200` |
| 2a | Cold offline reload boots the shell | **PASS** | SW-served document; `h1 "Dolcetto o Scherzetto"`, Gioca + scene present (see §3) |
| 2b | Play enters a playable scene | **PASS** |  Play click → menu hides; holding `.walkbtn.r` → `.kids.walking` true, `.homes` `translateX(0px)→translateX(-139.232px)`; `.walkbtn.l` also moves the world |
| 2c | No fatal console errors offline | **PASS** | console clean on reload; only benign `net::ERR_FAILED` for *uncached* voice during an offline knock (swallowed by design) |
| 2d | Audio fails silently offline | **PASS** | `unhandledrejection: []`, `window error: []` around an offline knock |
| 2e | Second offline reload | **PASS** | boots identically with the origin server **stopped** (real `ECONNREFUSED`) |
| 3a | Runtime caches present | **PASS** | `dos-cache-V` (45), `dos-cache-V-shell` (1), `dos-cache-V-voice` (runtime) |
| 3b | Voice clips cache at runtime | **FAIL (pre-fix) → PASS (post-fix)** | pre-fix: voice fetch `206` → `Cache.put` throws → **0** entries; post-fix: **3** entries after one knock, and a cached clip is served offline |
| 4a | `activate` keep-set drops old caches | **PASS** | source: keeps `{CACHE, SHELL_CACHE, VOICE_CACHE}`, deletes everything else; all three are version-suffixed |
| 4b | Voice cache growth bounded (no prune needed) | **PASS** | max 74 clips (37 ids × 2 langs × ~31 KB ≈ 2.2 MB) — structurally bounded, re-versioned per deploy |
| 5a | Page head links manifest | **PASS** | `<link rel="manifest" href="./manifest.webmanifest">` |
| 5b | `theme-color` meta | **PASS** | `<meta name="theme-color" content="#241d45">` (matches manifest) |
| 5c | Installability (manual, Lighthouse-style) | **PASS** | see §6 |
| — | `pnpm check` / `pnpm build` after fix | **PASS** | `svelte-check`: 0 errors / 0 warnings; build OK; `prettier --check` clean |

## 2. Cache content summary

Version `V = 1792267820549`.

| Cache | Entries | Contents |
|-------|--------:|----------|
| `dos-cache-V` (precache, `install.addAll`) | **45** | 27 hashed build assets (`_app/immutable/**`: entries, nodes, chunks, CSS, Fredoka woff/woff2) + 18 static non-voice files |
| `dos-cache-V-shell` (network-first navigations) | **1** | `/` — the single canonical shell key (query strings collapse to `/`) |
| `dos-cache-V-voice` (cache-first, runtime only) | 0 → grows | one entry per played clip, URL-keyed |

**Precache set = 45 files ≈ 4.51 MiB.** The 18 static files are:

```
/ambience/{foggy,leafy,pumpkin,starry}.v1.mp3   (4)
/art/{bottega-strip,bottega,hero,og}.v1.webp    (4)
/art/spike/{facade-maisonette,facade-tower}.v1.webp (2)
/icons/{apple-touch-icon,icon-192,icon-512,icon-512-maskable}.png + mark.svg (5)
/manifest.webmanifest                            (1)
/music/a-winters-night.v1.mp3                    (1)
/sfx/scare-witch.v1.mp3                          (1)
```

**Voice is deliberately *not* precached** (`ASSETS` filters `/voice/**`; the tree is
76 files / 2.2 MB). After one online knock the voice cache held, in order of play:

```
/voice/it/shout.mp3  /voice/it/greet-ghost.mp3  /voice/it/refuse-ghost.mp3
```

**Bound:** at most 74 clips (37 ids × `{it,en}`, no query variants → no duplicate
keys), ~31 KB average (15.6–62.3 KB), ≈ 2.2 MB worst case — and the cache name is
re-versioned each deploy, so it cannot accumulate across releases. **No cap/prune is
needed**; the voice cache is bounded by construction, not by accumulation.

## 3. Cold-offline boot proof

Method: page online → SW active → **stop the origin server** (so a cache hit cannot be
disguised by a live fetch) → reload. Server down confirmed: `curl → 000`.

**Console (reload, server down):**

```
## Console messages
<no console messages found>
```

**DOM probe (reload, server down):**

```json
{"controller":"http://localhost:5213/service-worker.js",
 "h1":"Dolcetto o Scherzetto",
 "gioca":true, "walkBtn":true,
 "homes":"translateX(-620px)",
 "bodyText":"Bussa ✊\n0\nSacchetto: 0 caramelle\n🏠\n🏪 Bottega\n\n🎃 UNA NOTTE DI CARAMELLE…"}
```

**Playable offline (server down):** click Gioca → `menuHidden:true`; hold `.walkbtn.r`
→ `.kids.walking:true`, `.homes: translateX(-620px) → translateX(-752.981px)`
(world moves). A second reload offline booted identically.

**Offline knock (uncached voice is the only failure, and it is swallowed):**

```json
{"cachedVoice":{"status":200,"bytes":23085},
 "uncachedVoice":"FAILED",
 "doorInRange":true,"knockFired":true,
 "unhandledRejections":[], "windowErrors":[],
 "console":"Failed to load resource: net::ERR_FAILED (… 2 times)"}
```

The single console line is the optional audio fetch for clips **not yet cached**
(`/voice/it/greet-strega.mp3`, `/voice/it/treat-strega.mp3`) — a resource-load
failure, not a JS error, and it never rejects the page (the `<audio>` `error` and
`play()` rejection are both swallowed by `voice.svelte.ts`).

**Definitive voice-from-cache isolation** (server down): fetch the cached clip →
`200/23085 B`; **delete its `VOICE_CACHE` entry → the same fetch `FAILED (TypeError)`**;
re-`put` it → `200/23085 B`. The 200 is therefore served by `VOICE_CACHE`, not the
browser HTTP cache.

### Per-layer cold-offline behaviour

| Layer | Asset strategy | Offline result |
|-------|----------------|----------------|
| App shell (`/`, navigation) | network-first → `SHELL_CACHE('/')` | **boots** (title + scene) |
| Hashed build assets (`_app/**`) | precache-first | **served** |
| Manifest / icons | precache | **served** |
| Music `a-winters-night.v1.mp3` | precache (`files`) | **plays** |
| Ambience `*.v1.mp3` | precache (`files`) | **plays**; missing themes fall back to the synth bed |
| SFX `scare-witch.v1.mp3` + synth | precache / WebAudio | **plays** |
| Voice `/voice/**` | cache-first, runtime | **cached clips play; uncached clips no-op silently** |

## 4. Update path (source-level, `src/service-worker.ts`)

All three cache names embed the build id `version`:

```
CACHE       = `dos-cache-${version}`
SHELL_CACHE = `dos-cache-${version}-shell`
VOICE_CACHE = `dos-cache-${version}-voice`
```

`activate` walks `caches.keys()` and **deletes every cache that is not one of those
three**, then `clients.claim()`. Because the names are version-suffixed, a new build
produces three new names and the previous build's three caches are deleted on
activation. The version genuinely changes per build — observed:
`dos-cache-1792267311483*` (earlier build) → `dos-cache-1792267820549*` (this build).

Notes / non-defects:

- No `skipWaiting()`: a new SW **waits** until existing clients close, then activates
  and prunes — standard SvelteKit behaviour; updates apply on the next cold open.
- If the build id ever *did not* change between deploys, `install.addAll` would
  overwrite same-URL entries but stale old-hash entries would linger. Not observed;
  the id changes every build.
- Should `version` ever be pinned, the voice cache would still be bounded at 74 clips.

**Hole analysis put to the task:** voice growth is **bounded by construction**, so no
cap/prune was added. The real defect was elsewhere (next section).

## 5. Defect found and fixed — the `206` voice-cache trap

**Symptom:** after three `/voice/…` fetches, `dos-cache-V-voice` was **empty**.

**Root cause:** a media element (`<audio>`, `voice.svelte.ts`) requests with a
`Range` header, so the network answers **`206 Partial Content`** — and the Cache API
refuses to store a 206. The original voice branch keyed on the element's own request
and did `cache.put(request, copy)`, which threw and was swallowed by the
`catch {}`. Proven live:

```
rangeStatus: 206
put206: "THREW: TypeError: Failed to execute 'put' on 'Cache':
                      Partial response (status code 206) is unsupported"
plainStatus: 200
put200: "SUCCEEDED"
```

So voice **never** went offline — silently.

**Fix (minimal, `src/service-worker.ts`, voice branch only):** fetch the canonical
whole clip (no `Range`) and key the cache on its **URL**, so a later range request is
answered from the complete cached body (a media element plays a `200` fine):

```ts
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
```

**Re-verification after the fix:**

- Online knock → voice cache now **3 entries** (was 0): `shout`, `greet-ghost`,
  `refuse-ghost`.
- Offline (origin server stopped) → cached clip `200 / 23085 B`; **deleting the cache
  entry makes the same fetch fail**, restoring it makes it succeed → the SW cache is
  the source.
- Offline cold reload boots; Play is playable; no `unhandledrejection`.
- `pnpm check` → 0 errors / 0 warnings; `pnpm build` → OK; `prettier --check` clean.

## 6. Installability (manual, Lighthouse-style)

This Lighthouse build (v13) no longer ships a PWA category — only `is-on-https`
(**pass**) remains. Criteria assessed manually:

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Served over HTTPS (or localhost) | **PASS** | `is-on-https = 1`; `window.isSecureContext = true` |
| Web manifest fetched + valid | **PASS** | `200`, `application/manifest+json`, parses |
| …`name` / `short_name` | **PASS** | "Dolcetto o Scherzetto" / "Dolcetto" |
| …`start_url` | **PASS** | `/` |
| …`display` | **PASS** | `standalone` |
| …`theme_color` / `background_color` | **PASS** | `#241d45` / `#191231` |
| …icon 192×192 + 512×512 | **PASS** | both present, correct dimensions, `200` |
| …maskable icon | **PASS** | `icon-512-maskable.png`, `purpose:"maskable"` |
| Registered SW with a `fetch` handler | **PASS** | active, scope `/`, intercepts navigations/assets/voice |
| Head links the manifest | **PASS** | `<link rel="manifest">` |
| `theme-color` meta | **PASS** | `#241d45` |

Out-of-scope observations from the same audit (owned by `app.html` / `+page.svelte`,
**not touched**): no `<title>` (a11y/SEO), `user-scalable=no` in the viewport meta
(a11y), no `meta description` (SEO). None affect installability.

## 7. Caveats / method notes

- **DevTools "hard reload" bypasses the service worker.** `Page.reload(ignoreCache)`
  offline produced `ERR_INTERNET_DISCONNECTED` (Chrome's behaviour, not the app's).
  The acceptance "cold offline reload" is therefore a **normal** reload, which the SW
  answers; the cache-bypass variant was reported rather than treated as a defect.
- **CDP page-level offline emulation does not throttle the SW's own `fetch()`.**
  Early probes ran with the server still up, so a few clips got cached "offline"; the
  definitive runs **stopped the origin server**, which pins the origin for both the
  page and the SW and makes every cache hit unambiguous.
- **Shared working tree.** A sibling agent's `pnpm build` replaced hashed assets
  mid-serve (killing a first preview process). Verification was moved to a frozen
  snapshot of `.svelte-kit/output`, with `node_modules`/`src`/`static` symlinked, so
  the run is stable and reproducible.
- One benign console line (`net::ERR_FAILED`, ×2) is expected: the offline knock's
  **uncached** voice clips. It is a resource-load failure the app deliberately
  swallows; there is no `unhandledrejection` and no JS error.

## 8. Reproduce

```sh
pnpm build && pnpm preview --port 5213
# 1) online: load, confirm SW ready/scope + caches (keys/sizes)
# 2) online: Gioca → walk to a door → knock  (populates VOICE_CACHE)
# 3) stop the preview server, reload twice   (definitive cold-offline boot)
# 4) Play → hold walk buttons → world moves; knock → cached voice plays, no rejections
# 5) pnpm check && pnpm build
```
