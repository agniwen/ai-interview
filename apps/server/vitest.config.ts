import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";
import { envFileNames, resolveServerEnvDir } from "./src/standalone/env";

const __dirname = import.meta.dirname;
const envDir = resolveServerEnvDir("test");
for (const fileName of envFileNames("test")) {
  loadEnv({ path: path.resolve(envDir, fileName), quiet: true });
}
process.env.BETTER_AUTH_SECRET ||= "test-only-backend-vitest-secret";

const verbose =
  process.env.VITEST_VERBOSE === "1" ||
  process.env.VITEST_VERBOSE === "true" ||
  process.env.VITEST_REPORTER === "verbose";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@server\/(.*)$/,
        replacement: path.resolve(__dirname, "src/$1"),
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
