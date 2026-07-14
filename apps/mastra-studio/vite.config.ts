import fs from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import ts from "typescript";
import type { Plugin, PluginOption, UserConfig } from "vite";
import { defineConfig } from "vite";

const studioStandalonePlugin = (
  targetPort: string,
  targetHost: string,
  basePath: string,
): PluginOption => ({
  name: "studio-standalone-plugin",
  transformIndexHtml(html: string) {
    return html
      .replaceAll("%%MASTRA_SERVER_HOST%%", targetHost)
      .replaceAll("%%MASTRA_SERVER_PORT%%", targetPort)
      .replaceAll("%%MASTRA_API_PREFIX%%", process.env.MASTRA_API_PREFIX || "/api")
      .replaceAll("%%MASTRA_HIDE_CLOUD_CTA%%", "true")
      .replaceAll("%%MASTRA_STUDIO_BASE_PATH%%", basePath)
      .replaceAll("%%MASTRA_SERVER_PROTOCOL%%", "http")
      .replaceAll("%%MASTRA_CLOUD_API_ENDPOINT%%", "")
      .replaceAll("%%MASTRA_AUTO_DETECT_URL%%", "true")
      .replaceAll("%%MASTRA_EXPERIMENTAL_FEATURES%%", process.env.EXPERIMENTAL_FEATURES || "false")
      .replaceAll("%%MASTRA_EXPERIMENTAL_UI%%", process.env.MASTRA_EXPERIMENTAL_UI || "false")
      .replaceAll("%%MASTRA_AGENT_SIGNALS%%", process.env.MASTRA_AGENT_SIGNALS ?? "true")
      .replaceAll("%%MASTRA_SIGNALS_UI%%", process.env.MASTRA_SIGNALS_UI || "false")
      .replaceAll("%%MASTRA_ORGANIZATION_ID%%", process.env.MASTRA_ORGANIZATION_ID || "")
      .replaceAll("%%MASTRA_PLATFORM_PROJECT_ID%%", process.env.MASTRA_PLATFORM_PROJECT_ID || "")
      .replaceAll(
        "%%MASTRA_PLATFORM_OBSERVABILITY_ENDPOINT%%",
        process.env.MASTRA_PLATFORM_OBSERVABILITY_ENDPOINT || "",
      );
  },
});

// @mastra/core dist chunks contain Node.js builtins (stream, fs, crypto, etc.)
// from server-only code (voice, workspace tools) that shares chunks with
// browser-safe code. These code paths are never called in the browser —
// stub them so Rollup can resolve the imports without erroring.
// enforce: 'pre' ensures this runs before Vite's built-in vite:resolve which
// would otherwise replace them with __vite-browser-external (no named exports).
// Node-only npm packages imported by @mastra/core server-only code (e.g. sandbox).
// These are never called in the browser — stub them alongside Node builtins.
const nodeOnlyPackages = new Set(["execa"]);

const stubNodeBuiltinsPlugin: Plugin = {
  apply: "build",
  enforce: "pre",
  load(id) {
    if (id.startsWith("\0node-stub:")) {
      return { code: "export default {}", syntheticNamedExports: true };
    }
  },
  name: "stub-node-builtins",
  resolveId(source) {
    if (nodeOnlyPackages.has(source)) {
      return { id: `\0node-stub:${source}`, moduleSideEffects: false };
    }
    const mod = source.startsWith("node:") ? source.slice(5) : source;
    const baseMod = mod.split("/")[0];
    if (builtinModules.includes(baseMod)) {
      return { id: `\0node-stub:${source}`, moduleSideEffects: false };
    }
  },
};

const routesManifestPlugin = (): Plugin => {
  const getPropertyName = (name: ts.PropertyName) => {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
      return name.text;
    }

    return;
  };

  const collectRouteRoots = async (sourcePath: string) => {
    const sourceText = await fs.readFile(sourcePath, "utf-8");
    const sourceFile = ts.createSourceFile(
      sourcePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const arraysByName = new Map<string, ts.Expression>();

    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        arraysByName.set(node.name.text, node.initializer);
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    const collectedRoots = new Set<string>();
    const visitedArrayExpressions = new Set<ts.ArrayLiteralExpression>();

    const getRootSegment = (routePath: string) => {
      if (!routePath.startsWith("/")) {
        return;
      }

      const normalizedPath = routePath.slice(1);
      const [rootSegment] = normalizedPath.split("/");
      return rootSegment || undefined;
    };

    const collectFromExpression = (
      expression: ts.Expression | undefined,
      inheritedRoot?: string,
    ) => {
      if (!expression) {
        return;
      }

      if (ts.isArrayLiteralExpression(expression)) {
        if (visitedArrayExpressions.has(expression)) {
          return;
        }

        visitedArrayExpressions.add(expression);

        for (const element of expression.elements) {
          collectFromArrayElement(element, inheritedRoot);
        }

        return;
      }

      if (ts.isIdentifier(expression)) {
        collectFromExpression(arraysByName.get(expression.text), inheritedRoot);
        return;
      }

      if (ts.isParenthesizedExpression(expression)) {
        collectFromExpression(expression.expression, inheritedRoot);
        return;
      }

      if (ts.isConditionalExpression(expression)) {
        collectFromExpression(expression.whenTrue, inheritedRoot);
        collectFromExpression(expression.whenFalse, inheritedRoot);
        return;
      }

      if (ts.isSpreadElement(expression)) {
        collectFromExpression(expression.expression, inheritedRoot);
      }
    };

    const collectFromArrayElement = (
      element: ts.Expression | ts.SpreadElement,
      inheritedRoot?: string,
    ) => {
      if (ts.isObjectLiteralExpression(element)) {
        collectFromObjectLiteral(element, inheritedRoot);
        return;
      }

      if (ts.isSpreadElement(element)) {
        collectFromExpression(element.expression, inheritedRoot);
        return;
      }

      if (ts.isConditionalExpression(element)) {
        collectFromExpression(element.whenTrue, inheritedRoot);
        collectFromExpression(element.whenFalse, inheritedRoot);
        return;
      }

      if (ts.isParenthesizedExpression(element)) {
        collectFromExpression(element.expression, inheritedRoot);
      }
    };

    const collectFromObjectLiteral = (
      objectLiteral: ts.ObjectLiteralExpression,
      inheritedRoot?: string,
    ) => {
      let routeRoot = inheritedRoot;

      for (const property of objectLiteral.properties) {
        if (!ts.isPropertyAssignment(property)) {
          continue;
        }

        const propertyName = getPropertyName(property.name);

        if (propertyName === "path" && ts.isStringLiteralLike(property.initializer)) {
          routeRoot = getRootSegment(property.initializer.text) ?? inheritedRoot;

          if (routeRoot) {
            collectedRoots.add(routeRoot);
          }
        }
      }

      for (const property of objectLiteral.properties) {
        if (!ts.isPropertyAssignment(property)) {
          continue;
        }

        if (getPropertyName(property.name) === "children") {
          collectFromExpression(property.initializer, routeRoot);
        }
      }
    };

    collectFromExpression(arraysByName.get("routes"));

    return [...collectedRoots].toSorted();
  };

  let resolvedConfig: { root: string; build: { outDir: string } } | undefined;

  return {
    apply: "build",
    configResolved(config) {
      resolvedConfig = config;
    },
    name: "routes-manifest",
    async writeBundle() {
      const root = resolvedConfig?.root ?? __dirname;
      const outDir = path.resolve(root, resolvedConfig?.build?.outDir ?? "dist");
      const sourcePath = path.resolve(root, "src", "App.tsx");
      const outputPath = path.join(outDir, "routes-manifest.json");
      const manifest = `${JSON.stringify(await collectRouteRoots(sourcePath), null, 2)}\n`;

      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(outputPath, manifest, "utf-8");
    },
  };
};

export default defineConfig(({ mode }) => {
  const studioBasePath = process.env.MASTRA_STUDIO_BASE_PATH?.replace(/\/$/, "") || "";
  const commonConfig: UserConfig = {
    base: studioBasePath ? `${studioBasePath}/` : "./",
    build: {
      cssCodeSplit: false,
    },
    define: {
      process: {
        env: {},
      },
    },
    plugins: [
      stubNodeBuiltinsPlugin,
      tailwindcss(),
      react(),
      routesManifestPlugin(),
      studioStandalonePlugin(
        process.env.PORT || "4111",
        process.env.HOST || "localhost",
        studioBasePath,
      ),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@internal-temp": path.resolve(__dirname, "./src/vendor/@mastra"),
      },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react-resizable-panels",
        "@tanstack/react-query",
      ],
    },
    server: {
      fs: {
        allow: [path.resolve(__dirname, "../..")],
      },
      hmr: studioBasePath
        ? {
            clientPort: Number(process.env.MASTRA_STUDIO_HMR_CLIENT_PORT || "5173"),
          }
        : undefined,
    },
  };

  if (mode === "development") {
    // Use environment variable for the target port, fallback to 4111
    const targetPort = process.env.PORT || "4111";
    const targetHost = process.env.HOST || "localhost";

    return {
      ...commonConfig,
      server: {
        ...commonConfig.server,
        proxy: {
          "/api": {
            changeOrigin: true,
            target: `http://${targetHost}:${targetPort}`,
          },
          // Custom server routes (e.g. @mastra/livekit's connection-details endpoint)
          // mount at the server root, outside the /api prefix, so forward them too.
          "/voice": {
            changeOrigin: true,
            target: `http://${targetHost}:${targetPort}`,
          },
        },
      },
    };
  }

  return {
    ...commonConfig,
  };
});
