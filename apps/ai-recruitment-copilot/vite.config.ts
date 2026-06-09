import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  optimizeDeps: {
    include: ["posthog-js"],
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
      srcDirectory: "src",
    }),
    viteReact(),
    nitro(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 3000,
  },
});
