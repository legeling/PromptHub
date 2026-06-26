import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";
import path from "path";
import type { Plugin } from "vite";

process.env.BROWSERSLIST_IGNORE_OLD_DATA = "1";

const mainExternalModules = new Set([
  "node-sqlite3-wasm",
  "electron",
  "@aws-sdk/client-s3",
  "http-proxy-agent",
  "https-proxy-agent",
  "socks-proxy-agent",
  "undici",
]);

const aliases = {
  "@": path.resolve(__dirname, "src"),
  "@prompthub/core": path.resolve(__dirname, "../../packages/core/src"),
  "@shared": path.resolve(__dirname, "../../packages/shared"),
  "@prompthub/shared": path.resolve(__dirname, "../../packages/shared"),
  "@prompthub/db": path.resolve(__dirname, "../../packages/db/src"),
  "@renderer": path.resolve(__dirname, "src/renderer"),
};

// When BUILD_ANALYZE=1 is set, emit a treemap report alongside the renderer
// build for offline inspection. The report is written to dist-stats/ and is
// gitignored. We load rollup-plugin-visualizer lazily because it ships ESM
// only; importing it eagerly breaks vite-plugin-electron's CJS config loader.
// 当 BUILD_ANALYZE=1 时，在 renderer 构建产物旁生成 treemap 报告，便于离线
// 体积审计。报告写入 dist-stats/，已加入 .gitignore。visualizer 仅提供 ESM，
// 因此需要按需懒加载，避免污染 vite-plugin-electron 的 CJS 配置加载链路。
const isBundleAnalyze = process.env.BUILD_ANALYZE === "1";

async function resolveAnalyzePlugins(): Promise<Plugin[]> {
  if (!isBundleAnalyze) return [];
  const { visualizer } = await import("rollup-plugin-visualizer");
  return [
    visualizer({
      filename: path.resolve(__dirname, "dist-stats/renderer.html"),
      template: "treemap",
      gzipSize: true,
      brotliSize: true,
      open: false,
    }) as Plugin,
  ];
}

export default defineConfig(async () => ({
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
          resolve: {
            alias: aliases,
          },
          build: {
            outDir: "out/main",
            rollupOptions: {
              // Keep native/runtime-only main-process deps out of the bundle.
              external: (id) =>
                mainExternalModules.has(id) ||
                [...mainExternalModules].some((item) => id.startsWith(`${item}/`)),
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
          resolve: {
            alias: aliases,
          },
          build: {
            outDir: "out/preload",
          },
        },
      },
    ]),
    renderer(),
    ...(await resolveAnalyzePlugins()),
  ],
  resolve: {
    alias: aliases,
  },
  optimizeDeps: {
    include: ["fflate"],
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
}));
