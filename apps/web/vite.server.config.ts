import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@prompthub/shared': path.resolve(currentDir, '../../packages/shared/types/index.ts'),
      '@prompthub/db': path.resolve(currentDir, '../../packages/db/src/index.ts'),
    },
  },
  build: {
    ssr: 'src/index.ts',
    outDir: 'dist/server',
    emptyOutDir: false,
    sourcemap: true,
    target: 'node24',
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
      },
      external: [/^node:/, 'node-sqlite3-wasm', 'bcryptjs', 'svg-captcha'],
    },
  },
  ssr: {
    noExternal: true,
    external: ['node-sqlite3-wasm', 'bcryptjs', 'svg-captcha'],
  },
});
