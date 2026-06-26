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

export default defineConfig({
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
          prerender: { enabled: true, outputPath: "/index.html" },
        },
      ],
      prerender: {
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        enabled: true,
      },
      router: {
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
