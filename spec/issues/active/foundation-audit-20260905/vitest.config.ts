import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../../../..");

export default defineConfig({
  root,
  test: {
    include: ["spec/issues/active/foundation-audit-20260905/*.audit.ts"],
    environment: "node",
    setupFiles: [path.join(directory, "setup.ts")],
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
    testTimeout: 60000,
  },
  resolve: {
    alias: {
      "@prompthub/core": path.join(root, "packages/core/src"),
      "@prompthub/db": path.join(root, "packages/db/src"),
      "@prompthub/shared": path.join(root, "packages/shared"),
    },
  },
});
