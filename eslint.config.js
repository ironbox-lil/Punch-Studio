import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';

export default ts.config(
  {
    ignores: [
      'dist/**',
      'dist-server/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'artifacts/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
);
