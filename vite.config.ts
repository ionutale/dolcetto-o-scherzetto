import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
