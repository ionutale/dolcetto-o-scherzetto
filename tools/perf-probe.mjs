#!/usr/bin/env node
/**
 * T31 — the perf + memory probe (spec §14; plan T31).
 *
 * This is the **measurement harness** behind the numbers in
 * `docs/ARCHITECTURE.md` § Budgets. It drives a real Chrome over CDP, pastes the
 * audio-node meter into the page, runs a long autopiloted sim session, and
 * prints one sample row per home.
 *
 * It is plain JavaScript and speaks CDP directly (Node's global `fetch` +
 * `WebSocket`) — **no repo dependency, no build step**. The page-side half (the
 * meter + the autopilot) is the same paste-in instrumentation validated by hand
 * in Chrome; this file only wraps it in a reproducible driver.
 *
 * ## What it measures
 *
 * | signal | how | why it matters |
 * |---|---|---|
 * | audio nodes created vs disconnected | patch `AudioContext.prototype.create*` + `AudioNode.prototype.disconnect` | the iOS long-session leak guard (T27 `sweepCue`, T23 sprinkle tails, T26 loop replacement): `created - disconnected` is the live-node gap and must stay flat |
 * | loops started vs stopped | tag `AudioBufferSourceNode`s whose buffer is > 5 s (studio loops; cue noise buffers are ≤ 2 s) | proves a theme crossing *replaces* the ambience loop (started ≈ stopped + 1), never stacks it |
 * | DOM node count | `document.getElementsByTagName('*').length` | the T09 recycling window must keep the tree bounded (~20 homes of slots) |
 * | JS heap | `performance.memory.usedJSHeapSize` | the long-session growth ceiling |
 * | page errors | `error` / `unhandledrejection` listeners | console-clean is a quality-bar item |
 * | sim minutes | wall time + the fast-drive steps' Σdt | the plan's "30-minute walk" |
 *
 * The meter is installed through `Page.addScriptToEvaluateOnNewDocument`, so it
 * wraps the WebAudio prototypes **before** the first gesture builds any graph —
 * otherwise the persistent masters would be invisible to the counter.
 *
 * ## Usage
 *
 * ```
 * node tools/perf-probe.mjs --launch --url http://localhost:5211 --homes 50
 * node tools/perf-probe.mjs --cdp http://127.0.0.1:9333 --url http://localhost:5211
 * ```
 *
 * | flag | default | meaning |
 * |---|---|---|
 * | `--url` | `http://localhost:5211` | the dev (or preview) page to drive |
 * | `--cdp` | `http://127.0.0.1:9333` | an existing Chrome DevTools endpoint |
 * | `--launch` | off | launch a throwaway headless Chrome on `--cdp`'s port |
 * | `--homes` | 50 | homes to visit (≥ 40 per the task) |
 * | `--fast-steps` | 1200 | sim steps per *fast* home (`Σ dt = 60 sim-s`) |
 * | `--dt-fast` | 0.05 | the fast-drive tick (the sim's own clamp) |
 * | `--scare-every` | 3 | fire a `witch` scary moment every N homes |
 * | `--soak-steps` | 1800 | extra continuous walking steps after the last home |
 * | `--theme-steps` | 24 | neighborhood hops in the closing theme march (one loop adoption each) |
 * | `--out` | none | write the raw JSON result to this path |
 *
 * The autopilot's shape (validated by hand): `RESET` to the home's doorstep with
 * a forced outcome → one `step` → `KNOCK`; **odd** homes let the wall-clock flow
 * run (2 s resolve, candies land, then `COLLECT`; a refusing home plays `boo` so
 * the theatre's `fire:*` cues churn too); **even** homes instead close the door
 * and drive 1 200 fast ticks while walking, so the street recycles and theme
 * boundaries fire without wall time. Every `--scare-every` homes fires a `witch`
 * cameo. A sample is taken after each home.
 *
 * It never edits the repo and never writes to `src/`; the engine lives one tab
 * for the whole run, exactly like a long real session.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* ------------------------------------------------------------------ */
/* argv                                                               */
/* ------------------------------------------------------------------ */

/** Parse `--key value` / `--key=value` / `--flag` into an object. */
function parseArgs(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (!arg.startsWith('--')) continue;
		const body = arg.slice(2);
		const eq = body.indexOf('=');
		if (eq >= 0) out[body.slice(0, eq)] = body.slice(eq + 1);
		else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) out[body] = argv[++i];
		else out[body] = true;
	}
	return out;
}

const args = parseArgs(process.argv.slice(2));
const cfg = {
	url: String(args.url ?? 'http://localhost:5211'),
	cdp: String(args.cdp ?? 'http://127.0.0.1:9333'),
	launch: args.launch === true || args.launch === 'true',
	homes: Number(args.homes ?? 50),
	fastSteps: Number(args['fast-steps'] ?? 1200),
	dtFast: Number(args['dt-fast'] ?? 0.05),
	scareEvery: Number(args['scare-every'] ?? 3),
	soakSteps: Number(args['soak-steps'] ?? 1800),
	themeSteps: Number(args['theme-steps'] ?? 16),
	themeStepMs: Number(args['theme-step-ms'] ?? 800),
	out: args.out ? String(args.out) : null
};

/* ------------------------------------------------------------------ */
/* a tiny CDP client (Node global WebSocket — no dependency)          */
/* ------------------------------------------------------------------ */

class CDP {
	constructor(url) {
		this.url = url;
		this.nextId = 1;
		this.pending = new Map();
		this.handlers = new Map();
		this.ws = new WebSocket(url);
		this.ready = new Promise((resolve, reject) => {
			this.ws.addEventListener('open', () => resolve());
			this.ws.addEventListener('error', (e) =>
				reject(new Error('CDP socket error: ' + (e.message ?? e)))
			);
		});
		this.ws.addEventListener('message', (event) => {
			let msg;
			try {
				msg = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
			} catch {
				return;
			}
			if (msg.id && this.pending.has(msg.id)) {
				const { resolve, reject, method } = this.pending.get(msg.id);
				this.pending.delete(msg.id);
				if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
				else resolve(msg.result);
				return;
			}
			if (msg.method) {
				const list = this.handlers.get(msg.method);
				if (list) for (const fn of list) fn(msg.params);
			}
		});
	}

	on(method, fn) {
		if (!this.handlers.has(method)) this.handlers.set(method, []);
		this.handlers.get(method).push(fn);
	}

	send(method, params = {}) {
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject, method });
			this.ws.send(JSON.stringify({ id, method, params }));
		});
	}

	close() {
		try {
			this.ws.close();
		} catch {
			/* already closed */
		}
	}
}

/* ------------------------------------------------------------------ */
/* the page-side half — the paste-in instrumentation                  */
/* ------------------------------------------------------------------ */

/**
 * The audio-node meter, as a document-init snippet: patch the WebAudio
 * creators + `disconnect`, tag long-buffer sources as loops, and collect
 * `error` / `unhandledrejection`. Installed before any context exists.
 */
const METER_INSTALL = `(function () {
	if (window.__perfMeterInstalled) return;
	window.__perfMeterInstalled = true;
	window.__perfMeter = { created: {}, disconnected: 0, errors: [],
		loopsStarted: 0, loopsStopped: 0, started: 0, stopped: 0 };
	const M = window.__perfMeter;
	try {
		const proto = AudioContext.prototype;
		const creators = [
			'createOscillator', 'createGain', 'createBiquadFilter', 'createBufferSource',
			'createBuffer', 'createDynamicsCompressor', 'createDelay', 'createStereoPanner',
			'createWaveShaper', 'createConvolver', 'createConstantSource', 'createPeriodicWave'
		];
		for (const name of creators) {
			if (typeof proto[name] !== 'function') continue;
			const orig = proto[name];
			proto[name] = function (...a) {
				const n = orig.apply(this, a);
				M.created[name] = (M.created[name] || 0) + 1;
				return n;
			};
		}
		const disc = AudioNode.prototype.disconnect;
		AudioNode.prototype.disconnect = function (...a) {
			M.disconnected += 1;
			try { return disc.apply(this, a); } catch (e) { return undefined; }
		};
		const start = AudioBufferSourceNode.prototype.start;
		AudioBufferSourceNode.prototype.start = function (...a) {
			M.started += 1;
			try {
				const d = this.buffer ? this.buffer.duration : 0;
				if (d > 5) { this.__loop = true; M.loopsStarted += 1; } // studio loops, not cue noise
			} catch (e) { /* a hostile buffer */ }
			return start.apply(this, a);
		};
		const stop = AudioBufferSourceNode.prototype.stop;
		AudioBufferSourceNode.prototype.stop = function (...a) {
			M.stopped += 1;
			if (this.__loop) { M.loopsStopped += 1; this.__loop = false; }
			return stop.apply(this, a);
		};
	} catch (e) { /* no WebAudio: the meter stays empty */ }
	window.addEventListener('error', (e) => M.errors.push('error: ' + String(e.message || e.type).slice(0, 200)));
	window.addEventListener('unhandledrejection', (e) => {
		const r = e.reason;
		M.errors.push('rejection: ' + String((r && r.message) || r).slice(0, 200));
	});
})();`;

/** JSON-embedded config for the page script. */
function pageConfig() {
	return {
		homes: cfg.homes,
		fastSteps: cfg.fastSteps,
		dtFast: cfg.dtFast,
		scareEvery: cfg.scareEvery,
		soakSteps: cfg.soakSteps,
		themeSteps: cfg.themeSteps,
		themeStepMs: cfg.themeStepMs
	};
}

/**
 * The autopilot, as one async IIFE expression evaluated in the page
 * (`awaitPromise`, `returnByValue`). Reads no repo state beyond the store's
 * public seams and the meter the init script installed.
 */
function autopilotScript() {
	return `(async () => {
	const cfg = ${JSON.stringify(pageConfig())};
	${METER_INSTALL}
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const M = window.__perfMeter;

	const store = await import('/src/lib/state/game.svelte.ts');
	const createdTotal = () => Object.values(M.created).reduce((a, b) => a + b, 0);
	const heapMB = () => (performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(2) : null);
	const domCount = () => document.getElementsByTagName('*').length;
	const sample = (home, note) => ({
		home, note,
		created: createdTotal(),
		disconnected: M.disconnected,
		gap: createdTotal() - M.disconnected,
		loopsStarted: M.loopsStarted,
		loopsStopped: M.loopsStopped,
		bufStarted: M.started,
		bufStopped: M.stopped,
		heapMB: heapMB(),
		dom: domCount(),
		phase: store.phase()
	});
	const collectAll = () => {
		for (const c of store.candies()) if (c.state === 'landed') store.dispatch({ type: 'COLLECT', id: c.id });
	};
	const gc1 = () => { if (typeof gc === 'function') { try { gc(); } catch (e) { /* not exposed */ } } };

	const t0 = performance.now();
	let fastDt = 0; // Σ dt of the synchronous fast drives
	const samples = [sample(-1, 'boot')];
	window.__perfProgress = { k: -1, note: 'boot', samples: samples.length };

	for (let k = 0; k < cfg.homes; k++) {
		const outcome = k % 2 === 0 ? 'treat' : 'refuse';
		store.dispatch({ type: 'RESET', opts: { worldX: k * 620 - 5, force: { [k]: outcome } } });
		store.step(0.016);
		store.dispatch({ type: 'KNOCK' });

		if (k % 2 === 1) {
			// real-time home: the wall-clock flow resolves at +2 s; then collect.
			await sleep(2400);
			collectAll();
			if (store.phase() === 'refuse') {
				// exercise the theatre + fire:* cues, then take the burst.
				store.dispatch({ type: 'SCHERZO_OPEN' });
				store.dispatch({ type: 'PLAY_TRICK', id: 'boo' });
				await sleep(2600); // climax ~1.9 s -> TRICK_RESOLVE -> collect
				await sleep(2400); // candies fly (2 s)
				collectAll();
				if (store.phase() === 'refuse' || store.phase() === 'door') store.dispatch({ type: 'CLOSE_DOOR' });
			} else {
				await sleep(700);
				collectAll();
			}
		} else {
			// fast home: walk hard through ~18 homes of street (theme crossings fire).
			store.dispatch({ type: 'CLOSE_DOOR' });
			store.dispatch({ type: 'WALK', dir: 1 });
			for (let i = 0; i < cfg.fastSteps; i++) { store.step(cfg.dtFast); fastDt += cfg.dtFast; }
			store.dispatch({ type: 'STOP' });
			collectAll();
			await sleep(150); // let one ambience frame adopt the crossed theme's loop
		}

		if (cfg.scareEvery > 0 && k % cfg.scareEvery === 0 && window.Scares) {
			window.Scares.trigger('witch');
			await sleep(2700);
		}
		gc1();
		samples.push(sample(k, outcome + (k % 2 === 1 ? '/real' : '/fast')));
		window.__perfProgress = { k, note: samples[samples.length - 1].note, created: samples[samples.length - 1].created, gap: samples[samples.length - 1].gap, dom: samples[samples.length - 1].dom, heapMB: samples[samples.length - 1].heapMB };
	}

	// ---- closing soak: one long continuous walk through many themes ----
	store.dispatch({ type: 'RESET', opts: { worldX: 0 } });
	store.dispatch({ type: 'WALK', dir: 1 });
	for (let i = 0; i < cfg.soakSteps; i++) { store.step(cfg.dtFast); fastDt += cfg.dtFast; }
	store.dispatch({ type: 'STOP' });
	await sleep(400);
	gc1();
	samples.push(sample(cfg.homes, 'soak'));
	window.__perfProgress = { k: cfg.homes, note: 'soak' };

	// ---- theme march: +1 neighborhood at a time, settled, so each crossing
	// latches + adopts its ambience loop (replacing the previous one). ----
	for (let t = 1; t <= cfg.themeSteps; t++) {
		store.dispatch({ type: 'RESET', opts: { worldX: t * 10 * 620 - 5 } });
		store.step(0.016);
		await sleep(cfg.themeStepMs);
		window.__perfProgress = { k: cfg.homes + 1, note: 'march ' + t + '/' + cfg.themeSteps };
	}
	gc1();
	samples.push(sample(cfg.homes + 1, 'march'));

	const wallSeconds = +((performance.now() - t0) / 1000).toFixed(1);
	const audio = {};
	try {
		const amb = await import('/src/lib/audio/ambience.svelte.ts');
		const mus = await import('/src/lib/audio/music.svelte.ts');
		const sfx = await import('/src/lib/audio/sfx.ts');
		audio.ambience = amb.ambienceInfo();
		audio.music = mus.musicInfo();
		audio.sfx = sfx.sfxInfo();
	} catch (e) {
		audio.error = String((e && e.message) || e);
	}
	return {
		samples,
		meter: {
			created: M.created,
			createdTotal: createdTotal(),
			disconnected: M.disconnected,
			gap: createdTotal() - M.disconnected,
			loopsStarted: M.loopsStarted,
			loopsStopped: M.loopsStopped,
			bufStarted: M.started,
			bufStopped: M.stopped
		},
		errors: M.errors.slice(0, 60),
		wallSeconds,
		simSeconds: +(wallSeconds + fastDt).toFixed(1),
		audio
	};
})()`;
}

/* ------------------------------------------------------------------ */
/* browser lifecycle                                                  */
/* ------------------------------------------------------------------ */

/** Locate a Chrome binary (CHROME_BIN, then the macOS default). */
function chromeBinary() {
	if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
	return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}

/** Launch a throwaway headless Chrome on the configured debug port. */
function launchChrome() {
	const port = new URL(cfg.cdp).port || '9333';
	const userDataDir = mkdtempSync(join(tmpdir(), 'dos-perf-'));
	const child = spawn(
		chromeBinary(),
		[
			'--headless=new',
			`--remote-debugging-port=${port}`,
			`--user-data-dir=${userDataDir}`,
			'--no-first-run',
			'--no-default-browser-check',
			'--disable-gpu',
			'--disable-background-timer-throttling',
			'--disable-renderer-backgrounding',
			'--autoplay-policy=no-user-gesture-required',
			'--js-flags=--expose-gc',
			'--window-size=852,393',
			'--mute-audio',
			'about:blank'
		],
		{ stdio: 'ignore', detached: false }
	);
	child.on('error', (e) => console.error('chrome launch failed:', e.message));
	return { child, userDataDir };
}

/** Poll the CDP endpoint until it answers (or give up). */
async function waitForCDP(ms = 20000) {
	const deadline = Date.now() + ms;
	for (;;) {
		try {
			const res = await fetch(cfg.cdp + '/json/version');
			if (res.ok) return true;
		} catch {
			/* not up yet */
		}
		if (Date.now() > deadline) throw new Error('CDP endpoint did not come up at ' + cfg.cdp);
		await new Promise((r) => setTimeout(r, 250));
	}
}

/** The first page target's websocket URL, creating a tab if there is none. */
async function pageTarget() {
	for (;;) {
		const res = await fetch(cfg.cdp + '/json/list');
		const targets = await res.json();
		const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
		if (page) return page;
		try {
			await fetch(cfg.cdp + '/json/new?about:blank', { method: 'PUT' });
		} catch {
			/* older Chrome rejects PUT; retry the list */
		}
		await new Promise((r) => setTimeout(r, 300));
	}
}

/* ------------------------------------------------------------------ */
/* run                                                                */
/* ------------------------------------------------------------------ */

async function main() {
	let launched = null;
	if (cfg.launch) {
		launched = launchChrome();
		await waitForCDP();
	}

	const target = await pageTarget();
	const cdp = new CDP(target.webSocketDebuggerUrl);
	await cdp.ready;

	const pageErrors = [];
	cdp.on('Runtime.exceptionThrown', (p) =>
		pageErrors.push(
			'exception: ' + (p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text)
		)
	);
	cdp.on('Log.entryAdded', (p) => {
		if (p.entry?.level === 'error') pageErrors.push('log: ' + p.entry.text);
	});

	await cdp.send('Page.enable');
	await cdp.send('Runtime.enable');
	await cdp.send('Log.enable');
	await cdp.send('Emulation.setDeviceMetricsOverride', {
		width: 852,
		height: 393,
		deviceScaleFactor: 1,
		mobile: false
	});
	// Start every run from a clean save: the run's `furthestK` is monotonic and
	// persisted, so a leftover high value would pin the neighborhood theme and
	// the ambience loop would never be replaced. (Runs before the app module.)
	await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
		source: 'try { localStorage.clear(); } catch (e) {}'
	});
	// Install the meter before any document script (and any audio context).
	await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: METER_INSTALL });

	const loaded = new Promise((resolve) => cdp.on('Page.loadEventFired', resolve));
	await cdp.send('Page.navigate', { url: cfg.url });
	await Promise.race([loaded, new Promise((r) => setTimeout(r, 20000))]);

	// Wait for the Svelte app to hydrate (Scares is registered on mount).
	for (let i = 0; i < 80; i++) {
		const r = await cdp.send('Runtime.evaluate', {
			expression: '!!(window.Scares && document.querySelector(".menu-play"))',
			returnByValue: true
		});
		if (r.result?.value) break;
		await new Promise((r2) => setTimeout(r2, 250));
	}

	// Real user activation: click Gioca so the AudioContexts resume and the
	// gesture latch unlocks audio exactly like a player's first tap.
	const rect = await cdp.send('Runtime.evaluate', {
		expression:
			'(() => { const b = document.querySelector(".menu-play"); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()',
		returnByValue: true
	});
	if (rect.result?.value) {
		const { x, y } = rect.result.value;
		await cdp.send('Input.dispatchMouseEvent', {
			type: 'mousePressed',
			x,
			y,
			button: 'left',
			clickCount: 1
		});
		await cdp.send('Input.dispatchMouseEvent', {
			type: 'mouseReleased',
			x,
			y,
			button: 'left',
			clickCount: 1
		});
	}
	await new Promise((r) => setTimeout(r, 500));

	console.log(
		`perf-probe: driving ${cfg.url} — ${cfg.homes} homes, ${cfg.fastSteps} fast steps/home, scare every ${cfg.scareEvery}, soak ${cfg.soakSteps}`
	);

	const evalPromise = cdp.send('Runtime.evaluate', {
		expression: autopilotScript(),
		awaitPromise: true,
		returnByValue: true
	});
	let finished = false;
	// Fire-and-forget progress poller: prints a heartbeat every 4 s while the
	// autopilot runs. It unwinds on the next wake after `finished` flips.
	void (async () => {
		while (!finished) {
			await new Promise((r) => setTimeout(r, 4000));
			if (finished) break;
			try {
				const p = await cdp.send('Runtime.evaluate', {
					expression: 'window.__perfProgress || null',
					returnByValue: true
				});
				if (p.result?.value) console.log('  … ' + JSON.stringify(p.result.value));
			} catch {
				console.log('  … (progress read failed — page busy/navigated)');
			}
		}
	})();

	let evaluated;
	try {
		evaluated = await Promise.race([
			evalPromise,
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('autopilot timed out after 20 min')), 1200000)
			)
		]);
	} finally {
		finished = true; // the poller notices on its next wake and unwinds
	}

	if (!evaluated || evaluated.exceptionDetails) {
		console.error(
			'page script threw:',
			evaluated?.exceptionDetails?.exception?.description ??
				evaluated?.exceptionDetails?.text ??
				'no result (page navigated/closed?)'
		);
		cdp.close();
		if (launched) launched.child.kill();
		process.exit(1);
	}

	const result = evaluated.result.value;
	cdp.close();
	if (launched) launched.child.kill();

	printReport(result, pageErrors);
	if (cfg.out) writeFileSync(cfg.out, JSON.stringify({ cfg, result, pageErrors }, null, 2));
	// The WebSocket + the poller's timer would otherwise keep the loop alive.
	process.exit(0);
}

/** Render the sample table + the summary lines the task asks for. */
function printReport(result, pageErrors) {
	const rows = result.samples;
	const pad = (v, n) => String(v).padStart(n);
	console.log('');
	console.log('  home  kind        created  disc   gap  loops  heapMB   dom  phase');
	console.log('  ----  ----------  -------  ----  ----  -----  ------  ----  -----');
	for (const r of rows) {
		console.log(
			`  ${pad(r.home, 4)}  ${String(r.note).padEnd(10)}  ${pad(r.created, 7)}  ${pad(r.disconnected, 4)}  ${pad(r.gap, 4)}  ${pad(r.loopsStarted + '/' + r.loopsStopped, 5)}  ${pad(r.heapMB ?? 'n/a', 6)}  ${pad(r.dom, 4)}  ${r.phase}`
		);
	}
	const first = rows[0];
	const last = rows[rows.length - 1];
	const peak = rows.reduce((a, r) => (r.heapMB != null && r.heapMB > a ? r.heapMB : a), 0);
	const gaps = rows.map((r) => r.gap);
	console.log('');
	console.log(
		`  sim time .......... ${(result.simSeconds / 60).toFixed(1)} sim-min (${result.wallSeconds}s wall + Σ fast dt)`
	);
	console.log(
		`  created / disc .... ${result.meter.createdTotal} / ${result.meter.disconnected}  → live gap ${result.meter.gap}`
	);
	console.log(`  by type ........... ${JSON.stringify(result.meter.created)}`);
	console.log(
		`  loops started/stop  ${result.meter.loopsStarted} / ${result.meter.loopsStopped}  (buffer srcs ${result.meter.bufStarted}/${result.meter.bufStopped})`
	);
	console.log(
		`  live gap .......... min ${Math.min(...gaps)} / max ${Math.max(...gaps)} (alarm ≤ 60)`
	);
	console.log(
		`  DOM nodes ......... ${first.dom} → ${last.dom}  (min ${Math.min(...rows.map((r) => r.dom))}, max ${Math.max(...rows.map((r) => r.dom))})`
	);
	console.log(`  heap MB ........... ${first.heapMB} → ${last.heapMB}  (peak ${peak})`);
	console.log(
		`  page errors ....... ${pageErrors.length + result.errors.length === 0 ? 'none' : JSON.stringify([...pageErrors, ...result.errors].slice(0, 10))}`
	);
	if (result.audio) console.log(`  audio engines ..... ${JSON.stringify(result.audio)}`);
}

main().catch((e) => {
	console.error('perf-probe failed:', e);
	process.exit(1);
});
