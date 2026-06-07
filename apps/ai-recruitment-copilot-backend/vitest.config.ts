import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

const __dirname = import.meta.dirname;

loadEnv({ path: path.resolve(__dirname, ".env.local"), quiet: true });
loadEnv({ path: path.resolve(__dirname, ".env"), quiet: true });

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
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
