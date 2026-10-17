import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
	{
		ignores: [
			'.svelte-kit/',
			'build/',
			'.vercel/',
			'node_modules/',
			'prototypes/',
			'.scratch/',
			'.superpowers/',
			// The T28 voice tree: authored inventories + generated clips/manifests
			// and the studio's render helper, none governed by the app lint.
			'voice/',
			'static/voice/'
		]
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		}
	},
	{
		// Svelte 5 runes modules: parsed as plain JS by default, so give them
		// the TS parser explicitly (the documented eslint-plugin-svelte setup).
		files: ['**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parser: ts.parser
		},
		rules: {
			'no-undef': 'off'
		}
	}
);
