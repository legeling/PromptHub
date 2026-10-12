import cliConfig from '../../../../../apps/cli/eslint.config.mjs';

export default [
  ...cliConfig,
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest', sourceType: 'module',
      globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly' },
    },
    rules: { 'no-undef': 'error', 'no-unused-vars': 'error', 'no-empty': 'error' },
  },
];
