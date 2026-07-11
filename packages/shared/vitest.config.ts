import { defineConfig } from "vitest/config";

const verbose =
  process.env.VITEST_VERBOSE === "1" ||
  process.env.VITEST_VERBOSE === "true" ||
  process.env.VITEST_REPORTER === "verbose";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["src/**/*.test.ts"],
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
    },
    environment: "node",
    globals: true,
    // VITEST_VERBOSE=1 → list every test; default hides console from passed tests.
    reporters: verbose ? ["verbose"] : ["default"],
    silent: verbose ? false : "passed-only",
  },
});
