import os from "node:os";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

const __dirname = import.meta.dirname;

loadEnv({ path: path.resolve(__dirname, ".env.local"), quiet: true });
loadEnv({ path: path.resolve(__dirname, ".env"), quiet: true });

const verbose =
  process.env.VITEST_VERBOSE === "1" ||
  process.env.VITEST_VERBOSE === "true" ||
  process.env.VITEST_REPORTER === "verbose";

// Parallel strategy (Vitest 4):
// - pool "forks" + fileParallelism: each file runs in a worker process with its
//   own postgres.js pool (no shared client across concurrent files in-process)
// - cap maxWorkers so we don't open dozens of connections to one local Postgres
// - integration fixtures must use unique IDs per worker (see test-utils/fixture-id.ts)
const cpuCount = os.availableParallelism?.() ?? os.cpus().length;
const maxWorkers = Math.max(1, Math.min(4, Math.floor(cpuCount / 2) || 1));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@arc\/ai-recruitment-copilot-backend\/lib\/server\/(.*)$/,
        replacement: path.resolve(__dirname, "src/lib/server/$1"),
      },
      {
        find: /^@arc\/ai-recruitment-copilot-backend\/server\/(.*)$/,
        replacement: path.resolve(__dirname, "src/server/$1"),
      },
    ],
  },
  test: {
    coverage: {
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      include: ["src/**/*.{ts,tsx}"],
      provider: "v8",
      reporter: ["text", "json-summary"],
    },
    environment: "node",
    fileParallelism: true,
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
    maxWorkers,
    pool: "forks",
    // VITEST_VERBOSE=1 → list every test; default hides console from passed tests.
    reporters: verbose ? ["verbose"] : ["default"],
    silent: verbose ? false : "passed-only",
    // Real DB round-trips are routinely >5s under suite load.
    testTimeout: 30_000,
  },
});
