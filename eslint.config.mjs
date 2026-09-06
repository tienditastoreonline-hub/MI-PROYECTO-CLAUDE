// Flat config. En Next.js 16 `next lint` fue eliminado: se usa la CLI de ESLint
// y `eslint-config-next` ya exporta configuración plana, sin FlatCompat.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'docs/**', 'next-env.d.ts', 'supabase/**'],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // El aislamiento multi-tenant depende de no colar `any` en los payloads
      // que llegan de Vapi o de Google.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];

export default config;
