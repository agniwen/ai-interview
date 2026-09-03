import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

const desktopRoot = import.meta.dirname;
const rendererSrc = resolve(desktopRoot, "src/renderer/src");

export function createDesktopConfig(_mode: string) {
  return {
    main: {
      build: {
        externalizeDeps: {
          exclude: ["@app/meeting-live-transcript"],
        },
      },
      envDir: desktopRoot,
      envPrefix: ["VITE_", "SENTRY_DESKTOP_DSN", "SENTRY_DSN", "SENTRY_RELEASE"],
    },
    preload: { envDir: desktopRoot },
    renderer: {
      build: {
        // AudioWorklet modules must remain same-origin files under the packaged renderer CSP.
        assetsInlineLimit: 0,
      },
      // DSNs are safe to expose; do not broaden this to SENTRY_ because upload
      // auth tokens must never enter renderer bundles.
      envDir: desktopRoot,
      envPrefix: ["VITE_", "SENTRY_DESKTOP_DSN", "SENTRY_DSN", "SENTRY_RELEASE"],
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          "@": rendererSrc,
          "@renderer": rendererSrc,
        },
      },
    },
  };
}

export default defineConfig(({ mode }) => createDesktopConfig(mode));
