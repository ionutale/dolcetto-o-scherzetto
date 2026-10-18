import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { execSync } from 'node:child_process';

/** The short commit this build came from — Vercel's env, else local git. */
function buildId(): string {
	try {
		const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
		if (fromVercel) return fromVercel.slice(0, 7);
		const local = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
		return local || 'dev';
	} catch {
		return 'dev';
	}
}

export default defineConfig({
	define: {
		// The deployed build's identity, baked for the black box's header
		// (diagnostics/crashlog): Vercel's git env where present, the local
		// commit otherwise — CLI deploys do not always carry Vercel's git env,
		// and 'dev' appears only outside a checkout.
		__APP_VERSION__: JSON.stringify(buildId())
	},
	plugins: [sveltekit()],
	server: {
		// Worktrees and dev artifacts live inside the repo root. Without this, a
		// file write in a sibling worktree (or a test run writing test-results)
		// triggers an HMR full-reload that wipes the state of every page connected
		// to the dev server — including an e2e run's page, mid-test.
		watch: {
			ignored: [
				'**/.worktrees/**',
				'**/.superpowers/**',
				'**/test-results/**',
				'**/playwright-report/**'
			]
		}
	},
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts']
	}
});
