import path from "node:path";
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    extends: "./vitest.config.ts",
    test: {
      name: "integration",
      environment: "node",
      include: ["tests/integration/**/*.{test,spec}.{ts,tsx}"],
      setupFiles: ["./tests/setup-runtime.ts"],
    },
  },
  {
    extends: "./vitest.config.ts",
    test: {
      name: "unit",
      environment: "jsdom",
      include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
      setupFiles: ["./tests/setup.ts"],
    },
    resolve: {
      alias: {
        "@tanstack/react-virtual": path.resolve(
          __dirname,
          "tests/mocks/tanstack-react-virtual.ts",
        ),
      },
    },
  },
]);
