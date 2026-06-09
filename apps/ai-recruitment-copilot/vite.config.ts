import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  optimizeDeps: {
    include: [
      "@tanstack/react-form",
      "@tanstack/react-query",
      "@tanstack/react-router",
      "@tanstack/react-router-ssr-query",
      "clsx",
      "date-fns",
      "dayjs",
      "lucide-react",
      "sonner",
      "tailwind-merge",
      "zod",
    ],
  },
  plugins: [
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
