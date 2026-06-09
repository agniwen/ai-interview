// 中文：vitest 配置，覆盖 src/** 下的所有 *.test.ts(x)
// English: vitest config covering all *.test.ts(x) under src/**
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

const __dirname = import.meta.dirname;

// 中文：.env 与本配置同目录，显式指向避免被 cwd 影响。
// English: .env sits next to this config; resolve it explicitly so cwd doesn't matter.
loadEnv({ path: path.resolve(__dirname, ".env") });

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
