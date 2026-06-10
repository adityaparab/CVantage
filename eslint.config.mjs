// CVantage — root ESLint flat config (ESLint 9+).
// Zero-warning policy: all lint scripts run with --max-warnings 0.
// Type-aware rules (projectService) are enabled per-workspace as the
// TypeScript scaffolds land (server: #10 / frontend: #58 / shared: #31).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'cvantage-mockup.html',
      // Canonical schema reference — linted when ported into server/ (issue #12).
      'database/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Common rules for all source files.
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    plugins: {
      'import-x': importX,
      'unused-imports': unusedImports,
    },
    rules: {
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-duplicates': 'error',
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },

  // Node contexts: server, shared, tooling scripts, root configs.
  {
    files: [
      'server/**/*.{ts,js,cjs}',
      'shared/**/*.{ts,js,cjs}',
      'scripts/**/*.{mjs,js}',
      '*.{mjs,js,cjs}',
    ],
    languageOptions: { globals: { ...globals.node } },
  },

  // Configuration discipline (issue #11 / 1.2): the validated AppConfigService
  // is the only sanctioned reader of environment values in server code.
  {
    files: ['server/**/*.ts'],
    ignores: [
      'server/src/config/**',
      'server/src/scripts/**', // CLI entrypoints validate via validateEnv(process.env)
      'server/**/*.spec.ts',
      'server/test/**',
    ],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read configuration via AppConfigService (server/src/config) instead.',
        },
      ],
    },
  },

  // React (frontend only).
  {
    files: ['frontend/**/*.{ts,tsx,js,jsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Keep Prettier the single source of formatting truth.
  prettier,
);
