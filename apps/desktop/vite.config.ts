import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: "src/main/index.ts",
        onstart(args) {
          // Start Electron, vite-plugin-electron will auto-set VITE_DEV_SERVER_URL
          // 启动 Electron，vite-plugin-electron 会自动设置 VITE_DEV_SERVER_URL
          // Override default argv to remove "--no-sandbox" which causes
          // "不支持的资源类型: --no-sandbox" on macOS with Electron 33.
          // The default startup() uses [".", "--no-sandbox"] but --no-sandbox
          // is a Linux-only Chromium flag and unnecessary on macOS/Windows.
          // 覆盖默认 argv，移除 "--no-sandbox" 参数。该参数仅适用于 Linux，
          // 在 macOS/Windows 上会导致 Electron 启动失败。
          args.startup(["."]);
        },
        vite: {
          build: {
            outDir: "out/main",
            rollupOptions: {
              external: ["node-sqlite3-wasm", "electron"],
            },
          },
        },
      },
      {
        entry: "src/preload/index.ts",
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: "out/preload",
          },
        },
      },
    ]),
    renderer(),
  ],
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
    outDir: "out/renderer",
    // Performance: Disable sourcemap in production to reduce bundle size
    // 性能：生产环境禁用 sourcemap 以减少打包体积
    sourcemap: process.env.NODE_ENV === "development",
    rollupOptions: {
      output: {
        // Manual chunks for better code splitting and caching
        // 手动分块以获得更好的代码分割和缓存
        manualChunks: {
          // Core React libraries
          // React 核心库
          "react-vendor": ["react", "react-dom"],
          // UI/Animation libraries
          // UI/动画库
          "ui-vendor": [
            "framer-motion",
            "@dnd-kit/core",
            "@dnd-kit/sortable",
            "@dnd-kit/utilities",
          ],
          // Markdown rendering libraries
          // Markdown 渲染库
          "markdown-vendor": [
            "react-markdown",
            "remark-gfm",
            "rehype-highlight",
            "rehype-sanitize",
          ],
          // i18n libraries
          // 国际化库
          "i18n-vendor": ["i18next", "react-i18next"],
          // Icon library (large)
          // 图标库（较大）
          icons: ["lucide-react"],
        },
      },
    },
  },
});
