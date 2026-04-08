// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from 'eslint-plugin-storybook';

import svelte from 'eslint-plugin-svelte';

export default [{
  ignores: [
    'node_modules/**',
    'dist/**',
    'build/**',
    'html/**',
    'storybook-static/**',
    '.storybook/**',
    '*.min.js',
    '*.bundle.js',
    'vite.config.js',
    'svelte.config.js',
    'coverage/**',
    '.env',
    '.env.*'
  ]
}, ...svelte.configs['flat/recommended'], {
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    globals: {
      window: 'readonly',
      document: 'readonly',
      console: 'readonly',
      fetch: 'readonly',
      WebSocket: 'readonly'
    }
  },
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    'semi': ['error', 'always'],
    'quotes': ['error', 'single', { avoidEscape: true }],
    'indent': ['error', 2],
    'comma-dangle': ['error', 'never'],
    'eol-last': ['error', 'always'],
    // Disable Svelte 5 runes rules (project uses Svelte 4)
    'svelte/prefer-svelte-reactivity': 'off',
    'svelte/no-immutable-reactive-statements': 'off',
    'svelte/no-at-html-tags': 'warn'
  }
}, ...storybook.configs['flat/recommended']];
