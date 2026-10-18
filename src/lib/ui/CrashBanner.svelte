<script lang="ts">
	/**
	 * The black-box banner (owner request): it appears on the title card when
	 * the previous session ended abruptly — the phone crashed, no debugger
	 * needed. One tap sends the flight log through the iOS share sheet (or
	 * copies it), so the crash scene reaches the developer in two taps.
	 */
	import { crashlog, fmtDur } from '$lib/diagnostics/crashlog';
	import type { LogEntry } from '$lib/diagnostics/crashlog';
	import { settings } from '$lib/persist/settings';
	import { copyText, shareText } from '$lib/diagnostics/share-text';

	interface Props {
		/** ✕ — hide the banner for this boot. */
		onDismiss?: () => void;
		/** 🔎 — open the full black-box viewer. */
		onOpenLogs?: () => void;
	}
	let { onDismiss = () => {}, onOpenLogs = () => {} }: Props = $props();

	const info = crashlog.info();
	const lang = settings.read().lang;

	const copy =
		lang === 'en'
			? {
					title: '🕯️ The game restarted by itself',
					hint: 'Help dad: send the flight log of the last session.',
					send: '📤 Send',
					copyBtn: '📋 Copy',
					details: '🔎 Details',
					done: 'Copied ✓'
				}
			: {
					title: '🕯️ Il gioco si è riavviato da solo',
					hint: 'Aiuta papà: invia il diario di bordo della scorsa partita.',
					send: '📤 Invia',
					copyBtn: '📋 Copia',
					details: '🔎 Dettagli',
					done: 'Copiato ✓'
				};

	/** The previous session's last heartbeat — the crash scene in one line. */
	function lastBeat(entries: LogEntry[]): LogEntry | null {
		for (let i = entries.length - 1; i >= 0; i--) if (entries[i].k === 'hb') return entries[i];
		return null;
	}

	const last = info.prev[info.prev.length - 1] ?? null;
	const beat = lastBeat(info.prev);
	const summary = (() => {
		const parts = [`build ${info.meta.v}`];
		if (last) parts.push(fmtDur(last.t));
		const d = beat?.d;
		if (d) {
			if (typeof d.el === 'number') parts.push(`DOM ${d.el}`);
			if (typeof d.aC === 'number' && typeof d.aD === 'number') parts.push(`audio ${d.aD}/${d.aC}`);
			if (typeof d.k === 'number') parts.push(`isolato ${d.k}`);
		}
		return parts.join(' · ');
	})();

	let feedback = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;
	function flash(message: string): void {
		feedback = message;
		clearTimeout(timer);
		timer = setTimeout(() => (feedback = ''), 1800);
	}

	async function onSend(): Promise<void> {
		const shared = await shareText(copy.title, crashlog.format());
		if (shared) flash(copy.done);
	}
	async function onCopy(): Promise<void> {
		flash((await copyText(crashlog.format())) ? copy.done : '✗');
	}
</script>

<div class="crash" role="status">
	<p class="crash-title">{copy.title}</p>
	<p class="crash-hint">{copy.hint}</p>
	<p class="crash-sum">{summary}{feedback ? ` · ${feedback}` : ''}</p>
	<div class="crash-actions">
		<button type="button" class="crash-btn primary" onclick={onSend}>{copy.send}</button>
		<button type="button" class="crash-btn" onclick={onCopy}>{copy.copyBtn}</button>
		<button type="button" class="crash-btn" onclick={onOpenLogs}>{copy.details}</button>
		<button type="button" class="crash-x" aria-label="chiudi" onclick={onDismiss}>✕</button>
	</div>
</div>

<style>
	.crash {
		position: relative;
		width: 100%;
		max-width: 440px;
		padding: 11px 34px 11px 14px;
		background: color-mix(
			in srgb,
			var(--amber) 10%,
			color-mix(in srgb, var(--night-0) 72%, transparent)
		);
		border: 1px solid color-mix(in srgb, var(--amber) 45%, transparent);
		border-radius: 14px;
		text-align: center;
	}

	.crash-title {
		font-size: 13px;
		font-weight: 700;
		color: var(--cream);
	}

	.crash-hint {
		font-size: 11px;
		opacity: 0.85;
		margin-top: 3px;
	}

	.crash-sum {
		font-size: 10px;
		opacity: 0.65;
		margin-top: 4px;
	}

	.crash-actions {
		display: flex;
		justify-content: center;
		gap: 7px;
		margin-top: 8px;
		flex-wrap: wrap;
	}

	.crash-btn {
		font-family: inherit;
		font-size: 12px;
		font-weight: 600;
		color: var(--cream);
		background: rgba(247, 236, 217, 0.1);
		border: 1px solid var(--cream-line);
		border-radius: var(--r-pill);
		padding: 6px 12px;
		cursor: pointer;
	}

	.crash-btn.primary {
		color: var(--ink);
		background: linear-gradient(180deg, var(--amber), var(--amber-deep));
		border: none;
	}

	.crash-btn:focus-visible,
	.crash-x:focus-visible {
		outline: 3px solid var(--amber);
		outline-offset: 2px;
	}

	.crash-x {
		position: absolute;
		top: 4px;
		right: 6px;
		font-family: inherit;
		font-size: 12px;
		color: var(--cream);
		opacity: 0.7;
		background: none;
		border: none;
		cursor: pointer;
		padding: 6px;
	}
</style>
