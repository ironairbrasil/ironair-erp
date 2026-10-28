import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: root, recommendedConfig: js.configs.recommended });

const config = [
  { ignores: ['.next/**', '.next-*/**', 'node_modules/**', 'coverage/**', 'public/ironair-tracker.js', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  { rules: { '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }], '@next/next/no-html-link-for-pages': 'off' } },
  {
    files: ['app/page.tsx', 'app/performance-view.tsx', 'app/landing/page.tsx', 'app/login/page.tsx', 'components/legal-page.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@next/next/no-img-element': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
];
export default config;
