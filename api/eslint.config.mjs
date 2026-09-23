import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', '.npm/**', 'logs/**'] },
  js.configs.recommended,
  { languageOptions: { globals: globals.node } },
  {
    files: ['src/**/*.ts'],
    extends: [tseslint.configs.recommended],
    rules: {
      eqeqeq: ['error', 'always'],
    },
  },
);
