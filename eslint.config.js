import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: ['dist/', 'dist-test/', 'public/assets/rooms/', 'playwright-report/', 'test-results/'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
  },
  {
    // Node-side files: configs, build tools, and tests.
    files: ['*.config.js', 'tools/**/*.js', 'tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettier,
];
