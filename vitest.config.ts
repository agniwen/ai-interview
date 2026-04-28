// 中文：根目录 vitest 配置，覆盖 src/** 下的所有 *.test.ts(x)
// English: root vitest config covering all *.test.ts(x) under src/**
import path from "node:path";
import { defineConfig } from "vitest/config";

const __dirname = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
