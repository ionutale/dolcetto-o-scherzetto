<script lang="ts">
	/**
	 * The black-box viewer: the full flight log (previous + current session),
	 * scrollable and selectable, with copy / share / clear. Parent-facing by
	 * design — opened by triple-tapping the build line on the title screen, or
	 * with `?debug=logs`.
	 */
	import { crashlog } from '$lib/diagnostics/crashlog';
	import { settings } from '$lib/persist/settings';
	import { copyText, shareText } from '$lib/diagnostics/share-text';

	interface Props {
		open?: boolean;
		onClose?: () => void;
	}
	let { open = false, onClose = () => {} }: Props = $props();

	const lang = settings.read().lang;
	const copy =
		lang === 'en'
			? {
					title: 'Black box — flight log',
					copy: '📋 Copy',
					send: '📤 Send',
					clear: '🧹 Clear archive',
					close: '✕ Close',
					done: 'Copied ✓',
					cleared: 'Archive cleared'
				}
			: {
					title: 'Scatola nera — diario di bordo',
					copy: '📋 Copia',
					send: '📤 Invia',
					clear: '🧹 Pulisci archivio',
					close: '✕ Chiudi',
					done: 'Copiato ✓',
					cleared: 'Archivio pulito'
				};

	let text = $state('');
	let feedback = $state('');
	let timer: ReturnType<typeof setTimeout> | undefined;

	$effect(() => {
		if (open) text = crashlog.format();
	});

	function flash(message: string): void {
		feedback = message;
		clearTimeout(timer);
		timer = setTimeout(() => (feedback = ''), 1800);
	}

	async function onCopy(): Promise<void> {
		flash((await copyText(text)) ? copy.done : '✗');
	}
	async function onSend(): Promise<void> {
		await shareText(copy.title, text);
	}
	function onClear(): void {
		crashlog.clearPrev();
		text = crashlog.format();
		flash(copy.cleared);
	}
</script>

{#if open}
	<div class="bb" role="dialog" aria-label={copy.title}>
		<div class="bb-card">
			<div class="bb-head">
				<h2>{copy.title}</h2>
				<span class="bb-fb">{feedback}</span>
			</div>
			<pre class="bb-pre" id="blackboxText">{text}</pre>
			<div class="bb-actions">
				<button type="button" onclick={onCopy}>{copy.copy}</button>
				<button type="button" onclick={onSend}>{copy.send}</button>
				<button type="button" onclick={onClear}>{copy.clear}</button>
				<button type="button" onclick={onClose}>{copy.close}</button>
			</div>
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

	.bb-actions button:focus-visible {
		outline: 3px solid var(--amber);
		outline-offset: 2px;
	}
</style>
