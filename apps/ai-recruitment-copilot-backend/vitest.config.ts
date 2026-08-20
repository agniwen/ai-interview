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
    // Recovery DAOs intentionally scan global pending work. Unique fixture IDs therefore
    // cannot isolate parallel integration files sharing one PostgreSQL database.
    fileParallelism: false,
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
    maxWorkers: 1,
    pool: "forks",
    // VITEST_VERBOSE=1 → list every test; default hides console from passed tests.
    reporters: verbose ? ["verbose"] : ["default"],
    silent: verbose ? false : "passed-only",
    // Real DB round-trips are routinely >5s under suite load.
    testTimeout: 30_000,
  },
});
