import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const rendererSrc = resolve(import.meta.dirname, "src/renderer/src");

export default defineConfig({
  resolve: {
    alias: {
      "@": rendererSrc,
      "@renderer": rendererSrc,
    },
  },
});
