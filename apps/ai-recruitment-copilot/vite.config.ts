import { createRequire } from "node:module";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import babel from "@rolldown/plugin-babel";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import {
  isolateMastraPlaygroundCss,
  isMastraPlaygroundStylesheet,
} from "./src/components/features/mastra-studio/css/isolate-playground-css";

const requireFromQueuePackage = createRequire(
  new URL("../../packages/resume-parse-queue/package.json", import.meta.url),
);
const requireFromBullmq = createRequire(requireFromQueuePackage.resolve("bullmq/package.json"));
const tslibEsmEntry = requireFromBullmq.resolve("tslib/tslib.es6.mjs");
const bullmqDependencyPathPattern =
  /[/\\]node_modules[/\\](?:\.pnpm[/\\])?bullmq@|[/\\]node_modules[/\\]bullmq[/\\]/;
const buildTime = new Date().toISOString();
const mastraStudioCssIsolation = (): Plugin => ({
  enforce: "pre",
  name: "arc-mastra-studio-css-isolation",
  transform(code, id) {
    if (!isMastraPlaygroundStylesheet(id)) {
      return null;
    }

    return { code: isolateMastraPlaygroundCss(code), map: null };
  },
});

export default defineConfig({
  define: {
    __ARC_BUILD_TIME__: JSON.stringify(buildTime),
  },
  envPrefix: ["NEXT_PUBLIC_"],
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
    mastraStudioCssIsolation(),
    {
      enforce: "pre",
      name: "arc-bullmq-tslib-esm",
      resolveId(source, importer) {
        if (source === "tslib" && importer && bullmqDependencyPathPattern.test(importer)) {
          return tslibEsmEntry;
        }

        return null;
      },
    },
    tailwindcss(),
    tanstackStart({
      pages: [
        {
          path: "/",
          prerender: { enabled: true, outputPath: "/index.html" },
        },
      ],
      prerender: {
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        enabled: true,
      },
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
    // Playground UI subpath exports import package-owned CSS. Keep the package
    // in Vite's SSR graph so dev SSR transforms those imports instead of
    // handing them to Node's native ESM loader.
    noExternal: [/^@mastra\/playground-ui(?:\/|$)/],
  },
});
