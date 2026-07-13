import { createRequire } from "node:module";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import babel from "@rolldown/plugin-babel";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const requireFromQueuePackage = createRequire(
  new URL("../../packages/resume-parse-queue/package.json", import.meta.url),
);
const requireFromBullmq = createRequire(requireFromQueuePackage.resolve("bullmq/package.json"));
const tslibEsmEntry = requireFromBullmq.resolve("tslib/tslib.es6.mjs");
const bullmqDependencyPathPattern =
  /[/\\]node_modules[/\\](?:\.pnpm[/\\])?bullmq@|[/\\]node_modules[/\\]bullmq[/\\]/;
const buildTime = new Date().toISOString();

export default defineConfig({
  define: {
    __ARC_BUILD_TIME__: JSON.stringify(buildTime),
  },
  envPrefix: ["NEXT_PUBLIC_"],
  optimizeDeps: {
    include: [
      "@tanstack/react-form",
      "@tanstack/react-query",
      "@tanstack/react-router",
      "@tanstack/react-router-ssr-query",
      "@tanstack/react-store",
      "better-auth/client/plugins",
      "better-auth/react",
      "clsx",
      "dayjs",
      "sonner",
      "tailwind-merge",
      "zod",
    ],
  },
  plugins: [
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
          // The home loader is request-scoped and Nitro prerender currently leaves
          // Rolldown workers alive after crawling this route.
          prerender: { enabled: false, outputPath: "/index.html" },
        },
      ],
      prerender: {
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        enabled: false,
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
        "/assets/**": {
          headers: {
            "cache-control": "public, max-age=31536000, immutable",
          },
        },
      },
    }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 3000,
    strictPort: true,
  },
});
