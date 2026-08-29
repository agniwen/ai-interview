import { createRequire } from "node:module";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import babel from "@rolldown/plugin-babel";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { paraglideCompilerOptions } from "./paraglide.config";
import { shouldResolveTslibAsEsm } from "./src/build/tslib-esm-resolution";

const requireFromQueuePackage = createRequire(
  new URL("../../packages/resume-parse-queue/package.json", import.meta.url),
);
const requireFromBullmq = createRequire(requireFromQueuePackage.resolve("bullmq/package.json"));
const tslibEsmEntry = requireFromBullmq.resolve("tslib/tslib.es6.mjs");
// Keep the dev config stable: Vite includes define values in its dependency cache key.
const buildTime = process.env.NODE_ENV === "production" ? new Date().toISOString() : "development";
export default defineConfig({
  define: {
    __ARC_BUILD_TIME__: JSON.stringify(buildTime),
  },
  // Sentry DSNs are public ingestion identifiers. Keep the allowlist exact so
  // an upload auth token can never be bundled into browser code.
  envPrefix: ["NEXT_PUBLIC_", "SENTRY_DSN", "SENTRY_RELEASE", "SENTRY_WEB_DSN"],
  optimizeDeps: {
    include: [
      "@assistant-ui/react",
      "@assistant-ui/react-lexical",
      "@base-ui/react",
      "@base-ui/react/**",
      "@date-fns/tz",
      // No package-root export; prebundle the deep paths assistant-ui uses.
      "@lexical/react/LexicalComposer",
      "@lexical/react/LexicalComposerContext",
      "@lexical/react/LexicalContentEditable",
      "@lexical/react/LexicalErrorBoundary",
      "@lexical/react/LexicalHistoryPlugin",
      "@lexical/react/LexicalPlainTextPlugin",
      "@tanstack/react-form",
      "@tanstack/react-query",
      "@tanstack/react-router",
      "@tanstack/react-router-ssr-query",
      "@tanstack/react-store",
      "@radix-ui/react-visually-hidden",
      "better-auth/client/plugins",
      "better-auth/react",
      "clsx",
      "cmdk",
      "dayjs",
      "lexical",
      "react",
      "react/compiler-runtime",
      "react/jsx-runtime",
      "react-day-picker",
      "react-dom",
      "react-dom/client",
      "semver",
      "sonner",
      "tailwind-merge",
      "zod",
      "zustand",
      "zustand/middleware",
    ],
  },
  plugins: [
    paraglideVitePlugin(paraglideCompilerOptions),
    {
      enforce: "pre",
      name: "arc-server-tslib-esm",
      resolveId(source, importer) {
        if (shouldResolveTslibAsEsm(source, importer)) {
          return tslibEsmEntry;
        }

        return null;
      },
    },
    tailwindcss(),
    tanstackStart({
      router: {
        // Ignore non-route artifacts under `src/routes` so colocated tests
        // (or future helpers) never become pages. Defaults already skip names
        // prefixed with `-`; this also drops `__tests__` / `__test__` dirs and
        // `*.test.*` / `*.spec.*` files even without that prefix.
        // See: https://tanstack.com/router/latest/docs/api/file-based-routing
        routeFileIgnorePattern: "(__tests__|__test__|\\.test\\.|\\.spec\\.)",
        routesDirectory: "routes",
      },
      server: {
        build: {
          inlineCss: true,
        },
      },
      srcDirectory: "src",
    }),
    viteReact(),
    babel({
      presets: [reactCompilerPreset()],
    }),
    nitro({
      preset: "bun",
      routeRules: {
        "/**": {
          headers: {
            "cache-control": "no-cache",
          },
        },
        "/api/app-version": {
          headers: {
            "cache-control": "no-store",
          },
        },
        "/assets/**": {
          headers: {
            "cache-control": "public, max-age=31536000, immutable",
          },
        },
      },
    }),
  ],
  preview: {
    strictPort: process.env.TSS_PRERENDERING !== "true",
  },
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 3000,
    strictPort: true,
  },
  ssr: {
    noExternal: ["avvvatars-react"],
    optimizeDeps: {
      // Flatten React Start's transitive export-star chain for the SSR module
      // runner. The server entry is loaded dynamically for the same HMR cycle.
      include: ["@tanstack/react-start"],
    },
  },
});
