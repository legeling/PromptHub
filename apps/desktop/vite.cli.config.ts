import path from "path";
import { builtinModules } from "module";
import { defineConfig } from "vite";

const externalModules = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
  "node-sqlite3-wasm",
]);

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../../packages/shared"),
      "@prompthub/shared": path.resolve(__dirname, "../../packages/shared"),
      "@prompthub/db": path.resolve(__dirname, "../../packages/db/src"),
      "@renderer": path.resolve(__dirname, "src/renderer"),
    },
  },
  build: {
    outDir: "out/cli",
    emptyOutDir: false,
    minify: false,
    target: "node22",
    lib: {
      entry: path.resolve(__dirname, "src/cli/index.ts"),
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
