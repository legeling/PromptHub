/// <reference types="vitest" />
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Wrangler does not await queued file logs on dispose. Keep errors on the
    // console without allowing background writes during fixture cleanup.
    env: { WRANGLER_WRITE_LOGS: "false" },
    include: ["src/**/*.{test,spec}.ts", "tests/**/*.{test,spec}.ts"],
    exclude: ["node_modules/**/*", "dist/**/*"],
  },
  resolve: {
    alias: {
      "@prompthub/shared": path.resolve(__dirname, "../../packages/shared"),
    },
  },
});
