<main class="hello">
	<span class="hello__chip">Dolcetto o Scherzetto</span>
	<p class="hello__marker">Dolcetto o Scherzetto — scaffold OK</p>
</main>

<style>
	/* Restyled with tokens only — the night gradient and cream ink come from
	 * `body` in app.css, so this page carries no colour of its own beyond the
	 * amber chip. */
	.hello {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		padding: var(--space-6);
		text-align: center;
	}

	.hello__chip {
		display: inline-flex;
		align-items: center;
		background: var(--amber);
		color: var(--ink);
		font-weight: 600;
		padding: var(--space-1) var(--space-4);
		border-radius: var(--r-pill);
		box-shadow: 0 4px 14px var(--amber-glow);
	}

	.hello__marker {
		font-size: 1.15rem;
		font-weight: 500;
	}
</style>
