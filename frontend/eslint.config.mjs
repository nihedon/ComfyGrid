import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import svelteParser from 'svelte-eslint-parser';
import tseslint from 'typescript-eslint';

export default [
    js.configs.recommended,
    ...tseslint.configs.recommended,
    ...svelte.configs.recommended,
    prettier,
    {
        files: ['**/*.svelte'],
        languageOptions: {
            parser: svelteParser,
            parserOptions: {
                parser: tseslint.parser,
                svelteFeatures: { runes: true },
            },
        },
    },
    {
        files: ['**/*.svelte.ts'],
        languageOptions: {
            parser: tseslint.parser,
        },
    },
    {
        rules: {
            'no-restricted-syntax': 'error',
        },
    },
    {
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
    },
    {
        ignores: ['build/', 'dist/', 'node_modules/'],
    },
];
