import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

const rendererSrc = resolve("src/renderer/src");

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    build: {
      // AudioWorklet modules must remain same-origin files under the packaged renderer CSP.
      assetsInlineLimit: 0,
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": rendererSrc,
        "@renderer": rendererSrc,
      },
    },
  },
});
