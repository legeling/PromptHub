import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./tests/helpers/settings-keyring.ts"],
    // Real SQLite migration/reopen workflows compete for CPU and disk when
    // Vitest starts one worker per core alongside the release build.
    minWorkers: 2,
    maxWorkers: 4,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
