import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    exclude: ["e2e/**", "**/node_modules/**"],
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    name: "unit:apps/mastra-studio",
    server: {
      deps: {
        inline: ["@mastra/playground-ui"],
      },
    },
    setupFiles: ["./vitest.setup.ts"],
  },
});
