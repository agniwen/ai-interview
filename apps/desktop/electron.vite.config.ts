import { existsSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

const desktopRoot = import.meta.dirname;
const legacyDesktopRoot = resolve(desktopRoot, "../ai-recruitment-copilot-desktop");
const rendererSrc = resolve(desktopRoot, "src/renderer/src");

function envFileNames(mode: string): string[] {
  return [`.env.${mode}.local`, `.env.${mode}`, ".env.local", ".env"];
}

export function createDesktopConfig(mode: string) {
  const hasCurrentEnv = envFileNames(mode).some((fileName) =>
    existsSync(resolve(desktopRoot, fileName)),
  );
  const hasLegacyEnv = envFileNames(mode).some((fileName) =>
    existsSync(resolve(legacyDesktopRoot, fileName)),
  );
  const envDir = hasCurrentEnv || !hasLegacyEnv ? desktopRoot : legacyDesktopRoot;

  return {
    main: {
      build: {
        externalizeDeps: {
          exclude: ["@app/meeting-live-transcript"],
        },
      },
      envDir,
      envPrefix: ["VITE_", "SENTRY_DESKTOP_DSN", "SENTRY_DSN", "SENTRY_RELEASE"],
    },
    preload: { envDir },
    renderer: {
      build: {
        // AudioWorklet modules must remain same-origin files under the packaged renderer CSP.
        assetsInlineLimit: 0,
      },
      // DSNs are safe to expose; do not broaden this to SENTRY_ because upload
      // auth tokens must never enter renderer bundles.
      envDir,
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
