<script lang="ts">
	/**
	 * The black-box panel (owner ask, 2026-10-18): the live/previous session
	 * view (what the hidden viewer always showed), the **crash archive list**
	 * (every interrupted session of the last three days), a per-session detail
	 * view, and a one-tap export of everything.
	 *
	 * Opened from the Settings card (`openLogs('list')`) or by triple-tapping
	 * the build line / `?debug` (`openLogs('current')`); hosted by the title.
	 * Parent-facing by design; the pre blocks are the only selectable text in
	 * the game.
	 */
	import { crashlog, formatSession, sessionSummary, stamp } from '$lib/diagnostics/crashlog';
	import type { ArchivedSession } from '$lib/diagnostics/crashlog';
	import { settings } from '$lib/persist/settings';
	import { copyText, shareFileOrCopy, shareText } from '$lib/diagnostics/share-text';
	import { closeLogs, logPanel } from './log-panel-state.svelte';

	const lang = settings.read().lang;
	const copy =
		lang === 'en'
			? {
					title: 'Black box — flight log',
					listTitle: 'Error log — last 3 days',
					detailTitle: 'Archived session',
					copy: '📋 Copy',
					send: '📤 Send',
					list: '📚 Archive',
					view: '👁 View',
					back: '← List',
					clear: '🧹 Clear archive',
					exportAll: '📤 Export all',
					empty: 'No interrupted sessions in the archive. 🎉',
					close: '✕ Close',
					done: 'Copied ✓',
					cleared: 'Archive cleared'
				}
			: {
					title: 'Scatola nera — diario di bordo',
					listTitle: 'Registro errori — ultimi 3 giorni',
					detailTitle: 'Sessione archiviata',
					copy: '📋 Copia',
					send: '📤 Invia',
					list: '📚 Archivio',
					view: '👁 Vedi',
					back: '← Elenco',
					clear: '🧹 Cancella archivio',
					exportAll: '📤 Esporta tutto',
					empty: 'Nessuna sessione interrotta in archivio. 🎉',
					close: '✕ Chiudi',
					done: 'Copiato ✓',
					cleared: 'Archivio pulito'
				};

	let mode = $state<'current' | 'list' | 'detail'>('current');
	let text = $state('');
	let list = $state<ArchivedSession[]>([]);
	let detail = $state<ArchivedSession | null>(null);
	let feedback = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;

	function flash(message: string): void {
		feedback = message;
		clearTimeout(timer);
		timer = setTimeout(() => (feedback = ''), 1800);
	}

	/** A fresh read: the archive list and the current-view text. */
	function refresh(): void {
		list = crashlog.history();
		text = crashlog.format();
	}

	/** Opening (re)sets the view from the latch and refreshes everything. */
	$effect(() => {
		if (logPanel.open) {
			mode = logPanel.view;
			detail = null;
			refresh();
		}
	});

	function viewSession(session: ArchivedSession): void {
		detail = session;
		mode = 'detail';
	}

	async function onCopy(body: string): Promise<void> {
		flash((await copyText(body)) ? copy.done : '✗');
	}
	async function onSend(body: string): Promise<void> {
		await shareText(copy.title, body);
	}
	async function onExport(): Promise<void> {
		await shareFileOrCopy('dolcetto-o-scherzetto-log.txt', crashlog.formatAll());
	}
	function onClear(): void {
		crashlog.clearArchive();
		refresh();
		flash(copy.cleared);
	}
</script>

{#if logPanel.open}
	<div class="bb" role="dialog" aria-label={copy.title}>
		<div class="bb-card">
			<div class="bb-head">
				<h2>
					{mode === 'list' ? copy.listTitle : mode === 'detail' ? copy.detailTitle : copy.title}
				</h2>
				<span class="bb-fb">{feedback}</span>
			</div>

			{#if mode === 'current'}
				<pre class="bb-pre" id="blackboxText">{text}</pre>
				<div class="bb-actions">
					<button type="button" onclick={() => onCopy(text)}>{copy.copy}</button>
					<button type="button" onclick={() => onSend(text)}>{copy.send}</button>
					<button type="button" onclick={() => (mode = 'list')}>{copy.list} ({list.length})</button>
					<button type="button" onclick={onClear}>{copy.clear}</button>
					<button type="button" onclick={closeLogs}>{copy.close}</button>
				</div>
			{:else if mode === 'list'}
				<div class="logrows" id="logList">
					{#if list.length === 0}
						<p class="bb-empty">{copy.empty}</p>
					{:else}
						{#each list as session, i (stamp(session.at) + i)}
							<div class="logrow">
								<span class="logrow-sum">⚠ {sessionSummary(session)}</span>
								<button type="button" onclick={() => viewSession(session)}>{copy.view}</button>
							</div>
						{/each}
					{/if}
				</div>
				<div class="bb-actions">
					<button type="button" onclick={onExport}>{copy.exportAll}</button>
					<button type="button" onclick={onClear}>{copy.clear}</button>
					<button type="button" onclick={closeLogs}>{copy.close}</button>
				</div>
			{:else if detail}
				<pre class="bb-pre" id="blackboxText">{formatSession(detail)}</pre>
				<div class="bb-actions">
					<button type="button" onclick={() => onCopy(formatSession(detail as ArchivedSession))}
						>{copy.copy}</button
					>
					<button type="button" onclick={() => onSend(formatSession(detail as ArchivedSession))}
						>{copy.send}</button
					>
					<button type="button" onclick={() => (mode = 'list')}>{copy.back}</button>
					<button type="button" onclick={closeLogs}>{copy.close}</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.bb {
		position: fixed;
		inset: 0;
		z-index: 400;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--night-0) 88%, transparent);
		padding: 14px;
	}

	.bb-card {
		display: flex;
		flex-direction: column;
		width: min(860px, 94vw);
		max-height: 88vh;
		padding: 12px 14px;
		background: var(--night-1);
		border: 1px solid var(--cream-line);
		border-radius: 14px;
	}

	.bb-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
	}

	.bb-head h2 {
		font-size: 15px;
		color: var(--cream);
	}

	.bb-fb {
		font-size: 12px;
		color: var(--amber);
	}

	/* Selectable on purpose — the game disables selection everywhere else. */
	.bb-pre {
		margin: 10px 0;
		padding: 10px;
		overflow: auto;
		flex: 1;
		min-height: 120px;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 11px;
		line-height: 1.45;
		color: var(--cream);
		background: color-mix(in srgb, var(--night-0) 70%, transparent);
		border-radius: 8px;
		white-space: pre-wrap;
		word-break: break-word;
		-webkit-user-select: text;
		user-select: text;
	}

	/* The archive list: one row per interrupted session, newest first. */
	.logrows {
		margin: 10px 0;
		overflow: auto;
		flex: 1;
		min-height: 120px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.logrow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 8px 10px;
		background: color-mix(in srgb, var(--night-0) 70%, transparent);
		border: 1px solid var(--cream-line);
		border-radius: 8px;
	}

	.logrow-sum {
		font-size: 12px;
		color: var(--cream);
		opacity: 0.9;
	}

	.logrow button {
		font-family: inherit;
		font-size: 12.5px;
		font-weight: 600;
		color: var(--cream);
		background: rgba(247, 236, 217, 0.1);
		border: 1px solid var(--cream-line);
		border-radius: var(--r-pill);
		padding: 6px 12px;
		cursor: pointer;
		white-space: nowrap;
	}

	.bb-empty {
		font-size: 13px;
		color: var(--cream);
		opacity: 0.8;
		padding: 24px 0;
		text-align: center;
	}

	.bb-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.bb-actions button {
		font-family: inherit;
		font-size: 13px;
		font-weight: 600;
		color: var(--cream);
		background: rgba(247, 236, 217, 0.1);
		border: 1px solid var(--cream-line);
		border-radius: var(--r-pill);
		padding: 7px 14px;
		cursor: pointer;
	}

	.bb-actions button:focus-visible,
	.logrow button:focus-visible {
		outline: 3px solid var(--amber);
		outline-offset: 2px;
	}
</style>
