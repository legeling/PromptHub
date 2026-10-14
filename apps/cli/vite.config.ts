import path from "path";
import { builtinModules } from "module";
import { defineConfig } from "vitest/config";

const externalModules = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
  "node-sqlite3-wasm",
  "@napi-rs/keyring",
]);

export default defineConfig({
  test: {
    // Each test file runs in its own worker, so process-wide runtime paths, cwd,
    // HOME, and database handles stay isolated while independent files run in
    // parallel. Tests inside a file remain serial.
    fileParallelism: true,
    // Keep enough parallelism to amortize the database template while leaving
    // headroom for the release harness' concurrent static check.
    maxWorkers: 4,
    minWorkers: 2,
    globalSetup: "./tests/global-setup.ts",
    setupFiles: "./tests/setup.ts",
    // Real subprocess and SQLite workflows routinely exceed Vitest's 5s default.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@prompthub/core": path.resolve(__dirname, "../../packages/core/src"),
      "@prompthub/shared": path.resolve(__dirname, "../../packages/shared"),
      "@prompthub/db": path.resolve(__dirname, "../../packages/db/src"),
    },
  },
  build: {
    outDir: "out",
    minify: false,
    target: "node24",
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      formats: ["cjs"],
      fileName: () => "prompthub.cjs",
    },
    rollupOptions: {
      external: (id) =>
        externalModules.has(id) ||
        [...externalModules].some((item) => id.startsWith(`${item}/`)),
      output: {
        banner: "#!/usr/bin/env node",
      },
    },
  },
});
