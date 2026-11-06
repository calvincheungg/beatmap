import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'public/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-exports': ['error', { restrictDefaultExports: { direct: true, named: true, defaultFrom: true } }],
    },
  },
  // Config files must use default exports.
  { files: ['*.config.{js,ts}'], rules: { 'no-restricted-exports': 'off' } },
);
