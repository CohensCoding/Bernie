import nextPlugin from '@next/eslint-plugin-next';

export default [
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
  // Next.js recommended + Core Web Vitals rules (flat config)
  nextPlugin.configs['core-web-vitals'],
];

