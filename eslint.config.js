import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

// SPEC 4.2: src/sim is pure and headless. It must not import presentation layers
// or touch browser globals.
const simRestrictedImports = {
  patterns: [
    {
      group: [
        '**/render',
        '**/render/**',
        '**/audio',
        '**/audio/**',
        '**/ui',
        '**/ui/**',
        '**/input',
        '**/input/**',
      ],
      message:
        'src/sim must stay headless: no imports from render, audio, ui, or input (SPEC 4.2).',
    },
  ],
};

const simRestrictedGlobals = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'requestAnimationFrame',
  'AudioContext',
];

export default defineConfig(
  {
    ignores: [
      'dist/',
      'node_modules/',
      '.tmp/',
      'coverage/',
      'test-results/',
      'playwright-report/',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
  },
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', simRestrictedImports],
      'no-restricted-globals': ['error', ...simRestrictedGlobals],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
