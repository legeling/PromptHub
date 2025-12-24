/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './tests/setup.ts',
        include: ['tests/**/*.{test,spec}.{ts,tsx}'],
        exclude: ['tests/e2e/**/*', 'node_modules/**/*'],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
            '@renderer': path.resolve(__dirname, 'src/renderer'),
            '@shared': path.resolve(__dirname, 'src/shared'),
        },
    },
});
