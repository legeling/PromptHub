import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// 纯 Web 开发配置（不包含 Electron）
export default defineConfig({
  plugins: [react()],
  root: "src/renderer",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../../packages/shared"),
      "@prompthub/shared": path.resolve(__dirname, "../../packages/shared"),
      "@prompthub/db": path.resolve(__dirname, "../../packages/db/src"),
      "@renderer": path.resolve(__dirname, "src/renderer"),
    },
  },
  server: {
    port: 5173,
  },
});
