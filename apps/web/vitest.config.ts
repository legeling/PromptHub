/// <reference types="vitest" />
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**/*', 'dist/**/*'],
    coverage: {
      exclude: ['scripts/**/*'],
    },
    environmentMatchGlobs: [
      ['src/client/**/*.test.ts', 'jsdom'],
      ['src/client/**/*.test.tsx', 'jsdom'],
      ['src/client/**/*.spec.ts', 'jsdom'],
      ['src/client/**/*.spec.tsx', 'jsdom'],
    ],
  },
  resolve: {
    alias: {
      '@prompthub/shared': path.resolve(__dirname, '../../packages/shared/types'),
      '@prompthub/db': path.resolve(__dirname, '../../packages/db/src'),
      '@desktop-renderer-app': path.resolve(
        __dirname,
        '../desktop/src/renderer/App.tsx',
      ),
      '@desktop-toast-provider': path.resolve(
        __dirname,
        '../desktop/src/renderer/components/ui/Toast.tsx',
      ),
      '@desktop-renderer-i18n': path.resolve(
        __dirname,
        'src/client/i18n.ts',
      ),
      '@desktop-renderer-globals-css': path.resolve(
        __dirname,
        '../desktop/src/renderer/styles/globals.css',
      ),
    },
  },
});
