import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// MCP 宿主以沙箱 iframe 加载 `ui://` 资源，不能引用外部脚本或样式；
// 构建产物由 scripts/emit-html-module.ts 内联为单个 HTML 字符串。
export default defineConfig({
  build: {
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    outDir: "dist/view",
  },
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
  },
});
