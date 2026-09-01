import { defineConfig } from "vitest/config";

const verbose =
  process.env.VITEST_VERBOSE === "1" ||
  process.env.VITEST_VERBOSE === "true" ||
  process.env.VITEST_REPORTER === "verbose";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["{src,test}/**/*.{test,spec}.ts"],
    maxWorkers: 1,
    reporters: verbose ? ["verbose"] : ["default"],
    silent: verbose ? false : "passed-only",
    testTimeout: 30_000,
  },
});
