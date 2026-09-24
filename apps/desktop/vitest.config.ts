/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    include: [],
    exclude: ["tests/e2e/**/*", "node_modules/**/*"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    minWorkers: 1,
    maxWorkers: 2,
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@renderer": path.resolve(__dirname, "src/renderer"),
      "@prompthub/core": path.resolve(__dirname, "../../packages/core/src"),
      "@shared": path.resolve(__dirname, "../../packages/shared"),
      "@prompthub/shared": path.resolve(__dirname, "../../packages/shared"),
      "@prompthub/db": path.resolve(__dirname, "../../packages/db/src"),
    },
  },
});
