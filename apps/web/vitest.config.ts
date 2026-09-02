// 中文：vitest 配置，覆盖 src/** 下的所有 *.test.ts(x)
// English: vitest config covering all *.test.ts(x) under src/**
import path from "node:path";
import { defineConfig } from "vitest/config";
import { loadWebProcessEnv } from "./src/env/load";

const __dirname = import.meta.dirname;

// 中文：.env 与本配置同目录，显式指向避免被 cwd 影响。
// English: .env sits next to this config; resolve it explicitly so cwd doesn't matter.
loadWebProcessEnv("test");

const verbose =
  process.env.VITEST_VERBOSE === "1" ||
  process.env.VITEST_VERBOSE === "true" ||
  process.env.VITEST_REPORTER === "verbose";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.{ts,tsx}"],
    // VITEST_VERBOSE=1 → list every test; default hides console from passed tests.
    reporters: verbose ? ["verbose"] : ["default"],
    silent: verbose ? false : "passed-only",
    // Route and SSR tests import the full TanStack graph and can exceed Vitest's
    // five-second default when the complete workspace suite runs concurrently.
    testTimeout: 15_000,
  },
});
