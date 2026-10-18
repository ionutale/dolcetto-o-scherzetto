/**
 * The black box — the in-app flight recorder (owner report: the game still
 * "returns to the main menu" on the iPhone, and Safari's remote debugger dies
 * with it, so the game itself must leave evidence behind).
 *
 * What it does:
 *
 *   - keeps a compact event log for the **live session** in memory, written
 *     through to localStorage every few seconds (and immediately on errors,
 *     visibility changes and page-hide);
 *   - on boot, inspects the previous session's log: if it ended abruptly
 *     (no `end` entry) and its last heartbeat is recent, the previous write is
 *     archived under the `prev` key and flagged as **crashed**, so the title
 *     screen can offer "send the log" without anyone attaching a debugger;
 *   - records a **heartbeat** every few seconds with the numbers the iOS leak
 *     hunts read: DOM element count, WebAudio nodes created/disconnected,
 *     AudioContext state, ambience loops, the voice pool, fps and the sim's
 *     phase/bag — the last heartbeat before a kill is the crash scene.
 *
 * localStorage layout (ADR-0006's local-only rule; nothing here ever throws):
 *
 *   - `dos.log.live.v1` — the live session, one JSON array of entries;
 *   - `dos.log.prev.v1` — the archived previous session (kept only when it
 *     crashed; the viewer can show and clear it);
 *   - `dos.log.history.v1` — the durable crash archive (owner ask,
 *     2026-10-18): every interrupted session of the last three days, newest
 *     first, viewable and deletable from the settings.
 *
 * Entry shape: `{ t, k, d? }` where `t` is milliseconds since the session
 * started, `k` is the event key (`boot`, `hb`, `ph`, `err`, …) and `d` is a
 * small scrubbed payload. Payloads are clamped hard (long strings cut, deep
 * objects replaced, a size ceiling per entry and per session), because the
 * log must never be the reason storage dies.
 */

import { readLocalStorage } from '$lib/persist/persist';

declare global {
	// Injected by vite's `define` at build time (the deployed commit hash).
	var __APP_VERSION__: string | undefined;
	interface Window {
		/** The debug handle the smoke/e2e use to inspect the black box. */
		__blackbox?: unknown;
	}
}

/* ------------------------------------------------------------------ */
/* keys, caps and defaults                                             */
/* ------------------------------------------------------------------ */

/** The one key the live session owns. */
export const CRASHLOG_LIVE_KEY = 'dos.log.live.v1';
/** The one key the crashed previous session is archived under. */
export const CRASHLOG_PREV_KEY = 'dos.log.prev.v1';
/** The durable crash archive: every interrupted session of the last 3 days. */
export const CRASHLOG_HISTORY_KEY = 'dos.log.history.v1';

/** The archive's age ceiling — the owner's rule: three days. */
export const HISTORY_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
/** The archive's length ceiling (the oldest fall off). */
export const HISTORY_MAX = 20;
/** The archive's serialised ceiling in characters (oldest drop first). */
const HISTORY_MAX_BYTES = 600_000;

/**
 * A previous session counts as *crash* when its last entry is this close to
 * the next boot: a normal close writes `end`, and a long-finished session
 * (the app simply not being reopened for hours) fails the window instead.
 */
export const CRASH_WINDOW_MS = 120_000;

/**
 * How far back from the tail the `end` marker is still honoured. A real
 * teardown may append bread crumbs (`visibilitychange` to hidden) *after*
 * `pagehide` wrote `end`, so the verdict scans a short tail instead of the
 * literal last line — a clean close with trailing crumbs is not a crash.
 */
export const CRASH_TAIL = 32;

/** How many entries one session keeps (oldest fall off the ring). */
export const LOG_CAP = 320;

/** The hard ceiling on one serialised session, in characters. */
const SERIALIZED_CAP = 40_000;

/** Long strings inside one payload are cut here. */
const STRING_CAP = 160;

/** The whole payload of one entry is capped near this, in characters. */
const PAYLOAD_CAP = 700;

/** The default heartbeat cadence. */
export const HEARTBEAT_MS = 4000;

/** The main-thread lag meter's tick: lateness past this reads as a hang. */
export const LAG_TICK_MS = 1000;

/** Keys worth a synchronous write the moment they happen (near-death events). */
const CRITICAL = new Set(['boot', 'end', 'err', 'rej', 'ce', 'vis', 'freeze']);

/* ------------------------------------------------------------------ */
/* the entry and the boot metadata                                     */
/* ------------------------------------------------------------------ */

/** One log line: ms since session start, the event key, a small payload. */
export interface LogEntry {
	t: number;
	k: string;
	d?: Record<string, unknown>;
}

/** One archived (interrupted) session in the crash history. */
export interface ArchivedSession {
	/** Wall clock of the session's last activity (when it died). */
	at: number;
	/** Wall clock of its boot, when the session header wrote one. */
	startedAt: number | null;
	/** The build the dead session ran. */
	v: string;
	/** The session's entries, verbatim. */
	entries: LogEntry[];
}

/** What the session knew about itself at boot (the report's header). */
export interface BootMeta {
	/** Wall clock at boot (`Date.now()`). */
	at: number;
	/** The deployed build, from vite's `define` (`dev` when local). */
	v: string;
	/** The user agent, trimmed. */
	ua: string;
	/** The iOS version the UA names (`OS 18_5`), or `null`. */
	ios: string | null;
	/** Installed to the home screen, or a browser tab. */
	mode: 'standalone' | 'browser';
	/** The UI language at boot. */
	lang: string;
	/** `393x852@3` — the CSS viewport and pixel ratio. */
	screen: string;
	/** The navigation type (`reload` vs `navigate`), when the platform says. */
	nav: string;
}

/** The boot-time snapshot the UI reads: crash verdict plus both sessions. */
export interface BlackBoxInfo {
	crashed: boolean;
	prev: LogEntry[];
	live: LogEntry[];
	meta: BootMeta;
}

/** The black box's public face. Every method is total — nothing throws. */
export interface CrashLog {
	/** Append one entry; flushes immediately for the critical keys. */
	log(k: string, d?: Record<string, unknown>): void;
	/** Write the live session through to storage (no-op without storage). */
	flush(): void;
	/** The session is going away: append `end` and flush. */
	end(): void;
	/** The boot-time verdict (crash?, both sessions, the meta). */
	info(): BlackBoxInfo;
	/** A fresh read for the viewer: the live memory plus the archived prev. */
	snapshot(): { live: LogEntry[]; prev: LogEntry[] };
	/** Drop the archived previous session. */
	clearPrev(): void;
	/** The pruned crash archive, newest first (owner ask). */
	history(): ArchivedSession[];
	/** Drop the whole crash archive + the `prev` slot. */
	clearArchive(): void;
	/** The full export text: the archive + the prev (once) + the live session. */
	formatAll(): string;
	/** The human text the banner and the viewer copy/share. */
	format(): string;
}

/* ------------------------------------------------------------------ */
/* payload scrubbing — the log must never break storage                */
/* ------------------------------------------------------------------ */

/** Scrub one value: primitives pass (strings cut), structures degrade. */
function scrubValue(value: unknown, depth: number): unknown {
	if (value === null) return null;
	const kind = typeof value;
	if (kind === 'string') return (value as string).slice(0, STRING_CAP);
	if (kind === 'number') return Number.isFinite(value) ? value : String(value);
	if (kind === 'boolean') return value;
	if (kind === 'bigint') return String(value);
	if (kind === 'undefined' || kind === 'function' || kind === 'symbol') return undefined;
	if (kind === 'object') {
		if (depth >= 2) return '[deep]';
		if (Array.isArray(value)) return value.slice(0, 10).map((item) => scrubValue(item, depth + 1));
		try {
			const out: Record<string, unknown> = {};
			// 24 keys of headroom: the heartbeat is a legitimate flat 15-key
			// payload (`el … fps`), and the 12-key cap this replaced silently
			// swallowed its tail (`ph`/`menu`/`fps`) the day three counters
			// joined — caught by the e2e before it ever reached a device.
			let n = 0;
			for (const [key, item] of Object.entries(value as object)) {
				if (n >= 24) break;
				n += 1;
				const scrubbed = scrubValue(item, depth + 1);
				if (scrubbed !== undefined) out[key] = scrubbed;
			}
			return out;
		} catch {
			return '[obj]';
		}
	}
	return String(value);
}

/** Scrub a whole payload and enforce the per-entry size ceiling. */
export function scrubPayload(d: Record<string, unknown>): Record<string, unknown> {
	const out = scrubValue(d, 0);
	const record = typeof out === 'object' && out !== null && !Array.isArray(out) ? out : {};
	try {
		if (JSON.stringify(record).length > PAYLOAD_CAP)
			return { trunc: JSON.stringify(record).length };
	} catch {
		return { trunc: -1 };
	}
	return record as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* storage moves — each guarded, each a no-op without storage          */
/* ------------------------------------------------------------------ */

function readRaw(storage: Storage | null, key: string): string | null {
	if (!storage) return null;
	try {
		return storage.getItem(key);
	} catch {
		return null;
	}
}

function writeRaw(storage: Storage | null, key: string, raw: string): void {
	if (!storage) return;
	try {
		storage.setItem(key, raw);
	} catch {
		/* quota, private mode, a hostile storage: the session keeps playing */
	}
}

function dropRaw(storage: Storage | null, key: string): void {
	if (!storage) return;
	try {
		storage.removeItem(key);
	} catch {
		/* nothing to do: a key we cannot remove is one we cannot read either */
	}
}

/** Parse a stored session; anything malformed degrades to `[]`. */
export function parseEntries(raw: string | null): LogEntry[] {
	if (!raw) return [];
	try {
		const value: unknown = JSON.parse(raw);
		if (!Array.isArray(value)) return [];
		const out: LogEntry[] = [];
		for (const item of value) {
			if (typeof item !== 'object' || item === null) continue;
			const e = item as Partial<LogEntry>;
			if (typeof e.t !== 'number' || !Number.isFinite(e.t)) continue;
			if (typeof e.k !== 'string') continue;
			const d =
				typeof e.d === 'object' && e.d !== null && !Array.isArray(e.d)
					? (e.d as Record<string, unknown>)
					: undefined;
			out.push({ t: e.t, k: e.k, d });
		}
		return out;
	} catch {
		return [];
	}
}

/** Parse a stored crash archive; malformed sessions fall off. */
export function parseHistory(raw: string | null): ArchivedSession[] {
	if (!raw) return [];
	try {
		const value: unknown = JSON.parse(raw);
		if (!Array.isArray(value)) return [];
		const out: ArchivedSession[] = [];
		for (const item of value) {
			if (typeof item !== 'object' || item === null) continue;
			const s = item as Partial<ArchivedSession>;
			if (typeof s.at !== 'number' || !Number.isFinite(s.at)) continue;
			const entries = Array.isArray(s.entries) ? parseEntries(JSON.stringify(s.entries)) : [];
			if (!entries.length) continue;
			out.push({
				at: s.at,
				startedAt:
					typeof s.startedAt === 'number' && Number.isFinite(s.startedAt) ? s.startedAt : null,
				v: typeof s.v === 'string' ? s.v : '?',
				entries
			});
		}
		return out;
	} catch {
		return [];
	}
}

/**
 * Apply the owner's retention rules to an archive, newest first: keep only
 * sessions from the last {@link HISTORY_MAX_AGE_MS}, at most {@link HISTORY_MAX}
 * of them, and within {@link HISTORY_MAX_BYTES} serialised (oldest drop first).
 * Pure — the boot and the tests both call it.
 */
export function pruneHistory(list: ArchivedSession[], nowMs: number): ArchivedSession[] {
	const fresh = list.filter((s) => nowMs - s.at <= HISTORY_MAX_AGE_MS && s.at <= nowMs + 60_000);
	const out = fresh.slice(0, HISTORY_MAX);
	let raw: string;
	try {
		raw = JSON.stringify(out);
	} catch {
		return out.slice(0, 1);
	}
	while (raw.length > HISTORY_MAX_BYTES && out.length > 1) {
		out.pop();
		try {
			raw = JSON.stringify(out);
		} catch {
			break;
		}
	}
	return out;
}

/* ------------------------------------------------------------------ */
/* the boot metadata                                                   */
/* ------------------------------------------------------------------ */

function buildVersion(): string {
	try {
		return typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? __APP_VERSION__ : 'dev';
	} catch {
		return 'dev';
	}
}

function textOf(value: unknown): string {
	try {
		if (value instanceof Error) return `${value.name}: ${value.message}`;
		if (typeof value === 'string') return value;
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
}

function stackOf(value: unknown): string | undefined {
	try {
		return value instanceof Error && typeof value.stack === 'string'
			? value.stack.slice(0, 480)
			: undefined;
	} catch {
		return undefined;
	}
}

/** The boot metadata, read defensively off whatever the platform exposes. */
export function defaultMeta(at: number): BootMeta {
	let ua = '';
	let ios: string | null = null;
	let mode: 'standalone' | 'browser' = 'browser';
	let lang = '';
	let screenStr = '';
	let nav = '?';
	try {
		ua = typeof navigator !== 'undefined' ? String(navigator.userAgent).slice(0, 200) : '';
		ios = /OS (\d+[_.]\d+)/.exec(ua)?.[1] ?? null;
		lang = typeof navigator !== 'undefined' ? String(navigator.language ?? '') : '';
	} catch {
		/* hostile navigator: keep the defaults */
	}
	try {
		const standalone =
			typeof window !== 'undefined' &&
			(window.matchMedia?.('(display-mode: standalone)').matches === true ||
				(navigator as unknown as { standalone?: boolean }).standalone === true);
		mode = standalone ? 'standalone' : 'browser';
	} catch {
		/* no matchMedia: browser it is */
	}
	try {
		if (typeof screen !== 'undefined' && typeof window !== 'undefined') {
			screenStr = `${screen.width}x${screen.height}@${window.devicePixelRatio || 1}`;
		}
	} catch {
		/* no screen: leave it empty */
	}
	try {
		const entry = performance.getEntriesByType('navigation')[0] as
			(PerformanceEntry & { type?: string }) | undefined;
		if (entry && typeof entry.type === 'string') nav = entry.type;
	} catch {
		/* no navigation timing: keep '?' */
	}
	return { at, v: buildVersion(), ua, ios, mode, lang, screen: screenStr, nav };
}

/* ------------------------------------------------------------------ */
/* the factory                                                         */
/* ------------------------------------------------------------------ */

/** Options for {@link createCrashLog} — the clocks and meta, for tests. */
export interface CrashLogOptions {
	/** Wall clock, defaults to `Date.now` (tests inject a fake). */
	now?: () => number;
	/** Boot metadata, defaults to {@link defaultMeta} (tests inject a stub). */
	meta?: (at: number) => BootMeta;
	/** Entry cap, defaults to {@link LOG_CAP}. */
	cap?: number;
}

/** `ms` as `34s` / `7m39s` — the report's duration format. */
export function fmtDur(ms: number): string {
	const s = Math.max(0, Math.round(ms / 1000));
	if (s < 60) return `${s}s`;
	return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
}

/** `2026-10-18 14:32` — the archive's compact, sortable timestamp. */
export function stamp(at: number): string {
	try {
		return new Date(at).toISOString().slice(0, 16).replace('T', ' ');
	} catch {
		return String(at);
	}
}

/** The report's legend, shared by `format` and `formatAll`. */
const LEGEND =
	'(legenda: el=nodi DOM · svg=nodi SVG · br=respiro raster (trim cache) · ' +
	'aC/aD=nodi WebAudio creati/chiusi · aX=stato AudioContext · ' +
	'amb=loop ambience vivi · sy=voce avviata · vc=clip voce decodificati · vx=errori voce · ' +
	'vs=fonti voce vive · anim=animazioni attive · js=heap JS MB (dove leggibile) · ' +
	'lag=blocco main-thread ms · cq=cue SFX suonati · fps=frame/s · cd=caramelle a schermo · ' +
	'bag=caramelle in sacca · k=isolato · ph=fase · menu=menu aperto)';

/**
 * Bind a black box to a `Storage`. Pass `null` where there is none and every
 * write quietly degrades to memory-only — the log survives nothing, but the
 * game never notices.
 */
export function createCrashLog(storage: Storage | null, opts: CrashLogOptions = {}): CrashLog {
	const now = opts.now ?? (() => Date.now());
	const cap = opts.cap ?? LOG_CAP;
	const startAt = now();
	const meta = (opts.meta ?? defaultMeta)(startAt);

	/* ---- boot: read the previous session, decide crash, archive ---- */
	let prev: LogEntry[] = [];
	let crashed = false;
	let prevLastWall: number | null = null;
	function historyNow(): ArchivedSession[] {
		return pruneHistory(parseHistory(readRaw(storage, CRASHLOG_HISTORY_KEY)), now());
	}
	function writeHistory(list: ArchivedSession[]): void {
		try {
			writeRaw(storage, CRASHLOG_HISTORY_KEY, JSON.stringify(list));
		} catch {
			/* a hostile entry: the archive just does not grow */
		}
	}
	{
		const raw = readRaw(storage, CRASHLOG_LIVE_KEY);
		const parsed = parseEntries(raw);
		if (parsed.length) {
			const last = parsed[parsed.length - 1];
			const firstWall = typeof parsed[0].d?.at === 'number' ? (parsed[0].d.at as number) : null;
			const lastWall = firstWall === null ? null : firstWall + last.t;
			prevLastWall = lastWall;
			// Closed ⇔ an `end` marker sits in the session's final stretch (the
			// teardown's trailing bread crumbs must not look like a crash).
			const tail = parsed.slice(-CRASH_TAIL);
			const abrupt = !tail.some((e) => e.k === 'end');
			const recent =
				lastWall !== null && now() - lastWall >= 0 && now() - lastWall <= CRASH_WINDOW_MS;
			if (abrupt && recent && raw) {
				crashed = true;
				writeRaw(storage, CRASHLOG_PREV_KEY, raw);
				prev = parsed;
				// The durable crash archive (owner ask, 2026-10-18): every
				// interrupted session is kept for three days, not just the
				// latest one — viewable and exportable from the settings.
				const session: ArchivedSession = {
					at: lastWall ?? now(),
					startedAt: firstWall,
					v: typeof parsed[0].d?.v === 'string' ? (parsed[0].d.v as string) : '?',
					entries: parsed
				};
				writeHistory([session, ...historyNow()]);
			}
		}
		// The three-day rule runs on every boot, crash or not.
		writeHistory(historyNow());
	}

	/* ---- the live session starts here ---- */
	const entries: LogEntry[] = [
		{
			t: 0,
			k: 'boot',
			d: scrubPayload({
				at: meta.at,
				v: meta.v,
				mode: meta.mode,
				ios: meta.ios ?? '?',
				screen: meta.screen,
				lang: meta.lang,
				nav: meta.nav,
				ua: meta.ua
			})
		}
	];

	function trim(): void {
		if (entries.length > cap) entries.splice(0, entries.length - cap);
		let raw: string;
		try {
			raw = JSON.stringify(entries);
		} catch {
			return;
		}
		while (raw.length > SERIALIZED_CAP && entries.length > 8) {
			entries.splice(0, Math.max(1, Math.ceil(entries.length / 4)));
			try {
				raw = JSON.stringify(entries);
			} catch {
				return;
			}
		}
	}

	function flush(): void {
		try {
			writeRaw(storage, CRASHLOG_LIVE_KEY, JSON.stringify(entries));
		} catch {
			/* a hostile entry (impossible after scrubbing, but total anyway) */
		}
	}

	function log(k: string, d?: Record<string, unknown>): void {
		try {
			const t = Math.max(0, Math.round(now() - startAt));
			entries.push({ t, k, d: d ? scrubPayload(d) : undefined });
			trim();
			if (CRITICAL.has(k)) flush();
		} catch {
			/* the log must never take the game down with it */
		}
	}

	flush(); // persist the boot entry immediately

	return {
		log,
		flush,
		end(): void {
			log('end', { at: now() });
		},
		info(): BlackBoxInfo {
			return { crashed, prev: [...prev], live: [...entries], meta };
		},
		snapshot(): { live: LogEntry[]; prev: LogEntry[] } {
			const archived = prev.length ? prev : parseEntries(readRaw(storage, CRASHLOG_PREV_KEY));
			return { live: [...entries], prev: [...archived] };
		},
		clearPrev(): void {
			prev = [];
			dropRaw(storage, CRASHLOG_PREV_KEY);
		},
		history(): ArchivedSession[] {
			return historyNow();
		},
		clearArchive(): void {
			prev = [];
			dropRaw(storage, CRASHLOG_PREV_KEY);
			dropRaw(storage, CRASHLOG_HISTORY_KEY);
		},
		formatAll(): string {
			const lines: string[] = [];
			lines.push('SCATOLA NERA — archivio completo (Dolcetto o Scherzetto)');
			lines.push(
				`build ${meta.v} · ${meta.mode} · iOS ${meta.ios ?? '?'} · ${meta.screen} · lang ${meta.lang} · esportato ${stamp(now())}`
			);
			const archived = historyNow();
			lines.push(
				`— ${archived.length} session${archived.length === 1 ? 'e' : 'i'} interrott${archived.length === 1 ? 'a' : 'e'} in archivio (ultimi 3 giorni)`
			);
			archived.forEach((session, index) => {
				lines.push('');
				lines.push(`═══ [${index + 1}] ${stamp(session.at)} · build ${session.v}`);
				lines.push(...synopsis(session.entries));
				lines.push('— dettaglio:');
				for (const e of session.entries) lines.push(entryLine(e));
			});
			// The `prev` slot duplicates the newest archive entry; only a prev
			// the archive missed (a hostile storage) is exported on its own.
			if (prev.length && !archived.some((s) => s.at === prevLastWall)) {
				lines.push('');
				lines.push(`═══ [prev] ${stamp(prevLastWall ?? now())}`);
				lines.push(...synopsis(prev));
				for (const e of prev) lines.push(entryLine(e));
			}
			lines.push('');
			lines.push(`═══ [sessione viva] +${fmtDur(entries[entries.length - 1]?.t ?? 0)}`);
			lines.push(...synopsis(entries));
			for (const e of entries) lines.push(entryLine(e));
			lines.push(LEGEND);
			return lines.join('\n');
		},
		format(): string {
			const lines: string[] = [];
			lines.push('SCATOLA NERA — Dolcetto o Scherzetto');
			lines.push(
				`build ${meta.v} · ${meta.mode} · iOS ${meta.ios ?? '?'} · ${meta.screen} · lang ${meta.lang} · nav ${meta.nav}`
			);
			const archived = prev.length ? prev : parseEntries(readRaw(storage, CRASHLOG_PREV_KEY));
			if (archived.length) {
				const last = archived[archived.length - 1];
				lines.push(
					`— sessione precedente: ${crashed ? '⚠ INTERROTTA (niente chiusura)' : 'chiusa'} · ${archived.length} eventi · ${fmtDur(last.t)}`
				);
				lines.push(...synopsis(archived));
				for (const e of archived) lines.push(entryLine(e));
			} else {
				lines.push('— nessuna sessione precedente registrata');
			}
			lines.push(
				`— sessione attuale: viva · ${entries.length} eventi · +${fmtDur(entries[entries.length - 1]?.t ?? 0)}`
			);
			lines.push(...synopsis(entries));
			for (const e of entries) lines.push(entryLine(e));
			lines.push(LEGEND);
			return lines.join('\n');
		}
	};
}

/** Numeric payload read for the synopsis; absent fields read `null`. */
function num(e: LogEntry | undefined, key: string): number | null {
	const v = e?.d?.[key];
	return typeof v === 'number' ? v : null;
}

/**
 * The per-session "inizio → fine" summary (owner request, 2026-10-18): the
 * first heartbeat against the last, with peaks — the memory-adjacent story the
 * raw entries only imply. Fields an older build never wrote read `—`.
 */
function synopsis(entries: LogEntry[]): string[] {
	const beats = entries.filter((e) => e.k === 'hb');
	if (!beats.length) return ['  (nessun battito registrato)'];
	const first = beats[0];
	const last = beats[beats.length - 1];
	const values = (key: string): number[] =>
		beats.map((e) => num(e, key)).filter((v): v is number => v !== null);
	const range = (key: string, unit = ''): string | null => {
		const from = num(first, key);
		const to = num(last, key);
		if (from === null && to === null) return null;
		const all = values(key);
		const peak = all.length ? Math.max(...all) : null;
		let out = `${from ?? '?'} → ${to ?? '?'}${unit}`;
		if (peak !== null && peak !== from && peak !== to) out += ` (picco ${peak}${unit})`;
		return out;
	};
	const lines: string[] = [];
	lines.push(
		`  inizio → fine: ${fmtDur(last.t)} · porte ${num(first, 'k') ?? '?'} → ${num(last, 'k') ?? '?'} · bag ${num(first, 'bag') ?? '?'} → ${num(last, 'bag') ?? '?'}`
	);
	const label = (name: string, key: string, unit = ''): string | null => {
		const r = range(key, unit);
		return r === null ? null : `${name} ${r}`;
	};
	const nodes = [label('el', 'el'), label('svg', 'svg'), label('anim', 'anim')].filter(
		(s): s is string => s !== null
	);
	lines.push(`  nodi: ${nodes.length ? nodes.join(' · ') : '—'}`);
	const audio: string[] = [];
	const aC = range('aC');
	const aD = range('aD');
	if (aC && aD) audio.push(`webAudio ${aC} / ${aD}`);
	const vs = range('vs');
	if (vs) audio.push(`fonti vive ${vs}`);
	if (num(last, 'vc') !== null) audio.push(`clip ${num(last, 'vc')}`);
	if (num(last, 'cq') !== null) audio.push(`cue ${num(last, 'cq')}`);
	const amb = range('amb');
	if (amb) audio.push(`ambience ${amb}`);
	lines.push(`  audio: ${audio.length ? audio.join(' · ') : '—'}`);
	const voice: string[] = [];
	const sy = range('sy');
	if (sy) voice.push(`voci ${sy}`);
	if (num(last, 'vx') !== null && num(last, 'vx') !== 0)
		voice.push(`errori voce ${num(last, 'vx')}`);
	if (voice.length) lines.push(`  voce: ${voice.join(' · ')}`);
	lines.push(`  heap JS: ${range('js', ' MB') ?? '— (non leggibile su questa piattaforma)'}`);
	const fpsAll = values('fps');
	const lagAll = values('lag');
	lines.push(
		`  fps min ${fpsAll.length ? Math.min(...fpsAll) : '?'} · lag max ${lagAll.length ? Math.max(...lagAll) : '?'} ms`
	);
	const errors = entries.filter((e) => e.k === 'err' || e.k === 'rej' || e.k === 'ce').length;
	lines.push(`  errori pagina: ${errors}`);
	return lines;
}

/** One archived session as text (the list's detail view + export blocks). */
export function formatSession(session: ArchivedSession): string {
	const lines: string[] = [];
	lines.push(`SCATOLA NERA — sessione archiviata (${stamp(session.at)})`);
	lines.push(`build ${session.v}`);
	lines.push(...synopsis(session.entries));
	lines.push('— dettaglio:');
	for (const e of session.entries) lines.push(entryLine(e));
	return lines.join('\n');
}

/** The list row's one-liner: when, which build, and what it looked like. */
export function sessionSummary(session: ArchivedSession): string {
	const beats = session.entries.filter((e) => e.k === 'hb');
	const last = beats[beats.length - 1];
	const parts = [stamp(session.at), `build ${session.v}`, fmtDur(last?.t ?? 0)];
	const k0 = beats.length ? num(beats[0], 'k') : null;
	const k1 = num(last, 'k');
	if (k0 !== null && k1 !== null) parts.push(`porte ${k0}→${k1}`);
	const fpsAll = beats.map((e) => num(e, 'fps')).filter((v): v is number => v !== null);
	if (fpsAll.length) parts.push(`fps min ${Math.min(...fpsAll)}`);
	return parts.join(' · ');
}

function entryLine(e: LogEntry): string {
	let payload = '';
	if (e.d) {
		try {
			payload = ` ${JSON.stringify(e.d).slice(0, 320)}`;
		} catch {
			payload = ' [payload?]';
		}
	}
	return `[+${(e.t / 1000).toFixed(1)}s] ${e.k}${payload}`;
}

/* ------------------------------------------------------------------ */
/* the singleton and the live wiring                                   */
/* ------------------------------------------------------------------ */

/** The app's one black box (memory-only on the server / without storage). */
export const crashlog: CrashLog = createCrashLog(readLocalStorage());

/** The event hook the game's modules call; a bound `crashlog.log`. */
export function logEvent(k: string, d?: Record<string, unknown>): void {
	crashlog.log(k, d);
}

/** Install options — the stats provider is the page's read of the world. */
export interface InstallOptions {
	/** Sampled for every heartbeat: DOM/audio/sim numbers, kept compact. */
	stats?: () => Record<string, unknown>;
	/** Heartbeat cadence in ms, defaults to {@link HEARTBEAT_MS}. */
	heartbeatMs?: number;
}

let installed = false;
let statsProvider: (() => Record<string, unknown>) | null = null;
let frames = 0;
let lastBeatAt = 0;
let lastFrames = 0;
let lagPeak = 0;
let lastLagTick = 0;

function perfNow(): number {
	try {
		return typeof performance === 'undefined' ? Date.now() : performance.now();
	} catch {
		return Date.now();
	}
}

function beat(): void {
	try {
		const t = perfNow();
		const secs = Math.max(0.001, (t - lastBeatAt) / 1000);
		const framesDelta = frames - lastFrames;
		lastBeatAt = t;
		lastFrames = frames;
		let sampled: Record<string, unknown> = {};
		try {
			sampled = statsProvider ? statsProvider() : {};
		} catch {
			sampled = { statsErr: 1 };
		}
		const lag = Math.round(lagPeak);
		lagPeak = 0;
		crashlog.log('hb', { ...sampled, fps: Math.round(framesDelta / secs), lag });
		// Persist immediately. On iOS the process can be killed between beats,
		// and a kill **while foreground** never fires the critical events
		// (visibility/pagehide/error) — without this write-through the whole
		// session vanished down to a bare `boot` line (owner's first device
		// log, 2026-10-18): the last 4 s must already be on disk.
		crashlog.flush();
	} catch {
		/* a heartbeat must never throw */
	}
}

/**
 * Wire the global listeners, the console tee, the frame counter and the
 * heartbeat. Idempotent; a no-op without a window (SSR — though the app is
 * `ssr=false`, the modules still evaluate in every environment).
 */
export function installCrashLog(opts: InstallOptions = {}): void {
	if (typeof window === 'undefined' || installed) return;
	installed = true;
	statsProvider = opts.stats ?? null;
	try {
		(window as Window).__blackbox = crashlog;
	} catch {
		/* a locked-down window still gets the log, just no debug handle */
	}

	window.addEventListener('error', (event) => {
		const e = event as ErrorEvent;
		crashlog.log('err', {
			m: e.message,
			src: e.filename,
			ln: e.lineno,
			col: e.colno,
			st: stackOf(e.error)
		});
	});
	window.addEventListener('unhandledrejection', (event) => {
		const e = event as PromiseRejectionEvent;
		crashlog.log('rej', { m: textOf(e.reason), st: stackOf(e.reason) });
	});
	window.addEventListener('pagehide', () => crashlog.end());
	try {
		document.addEventListener('freeze', () => crashlog.log('freeze'));
		document.addEventListener('resume', () => crashlog.log('resume'));
	} catch {
		/* no Page Lifecycle events: the visibility log still covers it */
	}
	document.addEventListener('visibilitychange', () => {
		crashlog.log('vis', { v: document.visibilityState });
		if (document.visibilityState === 'visible') {
			// Background throttling must never look like a hang: restart the lag
			// meter's clock (and clear any pending peak) on the way back.
			lastLagTick = perfNow();
			lagPeak = 0;
			beat();
		}
	});
	try {
		const originalError = console.error.bind(console);
		console.error = (...args: unknown[]) => {
			try {
				crashlog.log('ce', { m: args.map(textOf).join(' ').slice(0, 220) });
			} catch {
				/* never break the console */
			}
			originalError(...args);
		};
	} catch {
		/* a frozen console: error events still land on 'err' */
	}

	const rafLoop = (): void => {
		frames += 1;
		try {
			requestAnimationFrame(rafLoop);
		} catch {
			/* no rAF: the heartbeat just reports 0 fps */
		}
	};
	try {
		requestAnimationFrame(rafLoop);
	} catch {
		/* no rAF at all */
	}

	lastBeatAt = perfNow();
	lastFrames = 0;
	beat();
	window.setInterval(() => {
		try {
			if (document.visibilityState === 'visible') beat();
		} catch {
			/* a throttled interval must never throw */
		}
	}, opts.heartbeatMs ?? HEARTBEAT_MS);

	// The main-thread lag meter: a 1 s tick measuring its own lateness. A
	// watchdog-style kill (a multi-second hang) would surface as `lag`
	// climbing past 1000 ms on the beats right before death — the hang-vs-
	// memory discriminator the device hunts needed (owner's 2026-10-18 logs).
	lastLagTick = perfNow();
	window.setInterval(() => {
		try {
			const t = perfNow();
			if (document.visibilityState === 'visible') {
				const late = t - lastLagTick - LAG_TICK_MS;
				if (late > lagPeak) lagPeak = late;
			}
			lastLagTick = t;
		} catch {
			/* a throttled interval must never throw */
		}
	}, LAG_TICK_MS);
}
