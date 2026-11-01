import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const serverRoot = path.resolve(import.meta.dirname, "../../..");
const repoRoot = path.resolve(serverRoot, "../..");

interface ServerPackageJson {
  exports: Record<string, string | { default: string; types: string }>;
  imports?: Record<string, string>;
}

function readServerPackageJson(): ServerPackageJson {
  // SAFETY: This reads the repository-owned package manifest whose export shape is asserted below.
  return JSON.parse(
    readFileSync(path.join(serverRoot, "package.json"), "utf-8"),
  ) as ServerPackageJson;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true })
    .map(String)
    .filter((file) => /\.[cm]?[jt]sx?$/.test(file))
    .map((file) => path.join(directory, file));
}

const exportSourcesSchema = z.record(
  z.string(),
  z.union([z.string(), z.object({ default: z.string() }).transform((target) => target.default)]),
);

/** Export name → source file implementing it (the `default` condition for conditional targets). */
function readServerExportSources(): Record<string, string> {
  return exportSourcesSchema.parse(
    JSON.parse(readFileSync(path.join(serverRoot, "package.json"), "utf-8")).exports,
  );
}

/** Static, non type-only `import`/`export ... from` specifiers. */
const staticRuntimeImportPattern =
  /^\s*(?:import|export)\s+(?!type\b)[^"';]*?\sfrom\s*["']([^"']+)["']/gm;

describe("@app/server package boundary", () => {
  it("keeps every workspace package independent from HTTP transport and applications", () => {
    const packagesRoot = path.join(repoRoot, "packages");
    const packageRoots = readdirSync(packagesRoot)
      .map((name) => path.join(packagesRoot, name))
      .filter((packageRoot) => existsSync(path.join(packageRoot, "package.json")));
    const violations = packageRoots.flatMap((packageRoot) => {
      const packageJson = readFileSync(path.join(packageRoot, "package.json"), "utf-8");
      const manifestViolations = /"(?:@hono\/[^"/]+|hono|@app\/server)"/.test(packageJson)
        ? [path.relative(repoRoot, path.join(packageRoot, "package.json"))]
        : [];
      const sourceViolations = sourceFiles(path.join(packageRoot, "src")).flatMap((file) => {
        const source = readFileSync(file, "utf-8");
        const importsHttpOrApplication =
          /(?:from\s+|import\()["'](?:@hono\/|hono["'/]|@app\/server|(?:\.\.\/)+apps\/)/.test(
            source,
          );
        const isRouteModule = /(?:^|\/)route\.[cm]?[jt]sx?$/.test(file);
        return importsHttpOrApplication || isRouteModule ? [path.relative(repoRoot, file)] : [];
      });
      return [...manifestViolations, ...sourceViolations];
    });

    expect(packageRoots.length).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  it("keeps workspace package dependencies flowing down the documented layers", () => {
    // Mirrors the layer table in packages/README.md; a package may depend only on lower layers
    // (contract packages may also depend on each other).
    const layerByPackage = new Map<string, number>([
      ["@app/ai-runtime", 1],
      ["@app/database", 1],
      ["@app/db-schema", 0],
      ["@app/feishu", 1],
      ["@app/job-queues", 2],
      ["@app/meeting-live-transcript", 0],
      ["@app/meeting-media", 1],
      ["@app/meeting-processing", 4],
      ["@app/object-storage", 1],
      ["@app/recruiting", 3],
      ["@app/recruiting-workflows", 5],
      ["@app/resume-processing", 4],
      ["@app/shared", 0],
    ]);
    const manifestSchema = z.object({
      dependencies: z.record(z.string(), z.string()).optional(),
      name: z.string(),
    });
    const packagesRoot = path.join(repoRoot, "packages");
    const manifests = readdirSync(packagesRoot)
      .map((name) => path.join(packagesRoot, name, "package.json"))
      .filter((manifestPath) => existsSync(manifestPath))
      .map((manifestPath) => manifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf-8"))));
    const violations = manifests.flatMap(({ dependencies = {}, name }) => {
      const layer = layerByPackage.get(name);
      if (layer === undefined) {
        return [`${name} has no documented layer`];
      }
      return Object.keys(dependencies).flatMap((dependency) => {
        const dependencyLayer = layerByPackage.get(dependency);
        if (dependencyLayer === undefined) {
          return [];
        }
        const allowed = dependencyLayer < layer || (layer === 0 && dependencyLayer === 0);
        return allowed ? [] : [`${name} -> ${dependency}`];
      });
    });

    expect(violations).toEqual([]);
  });

  it("keeps resume processing exports explicit and free of server-shaped mirror paths", () => {
    const packageRoot = path.join(repoRoot, "packages/resume-processing");
    // SAFETY: This parses the repository-owned resume-processing manifest whose export shape is asserted below.
    const packageJson = JSON.parse(
      readFileSync(path.join(packageRoot, "package.json"), "utf-8"),
    ) as ServerPackageJson;
    const exportNames = Object.keys(packageJson.exports);
    const mirroredSources = sourceFiles(path.join(packageRoot, "src")).flatMap((file) => {
      const relative = path.relative(packageRoot, file).replaceAll("\\", "/");
      return /(?:^|\/)runtime\/server\/(?:routes\/)?/.test(relative) ? [relative] : [];
    });

    expect(exportNames.some((name) => name.includes("*"))).toBe(false);
    expect(
      exportNames.some((name) => /(?:internal|runtime|compat|server\/routes)/.test(name)),
    ).toBe(false);
    expect(mirroredSources).toEqual([]);
  });

  it("uses only explicit package entrypoints", () => {
    const packageJson = readServerPackageJson();

    expect(packageJson.imports).toBeUndefined();
    expect(Object.keys(packageJson.exports).some((key) => key.includes("*"))).toBe(false);
    expect(JSON.stringify(packageJson.exports)).not.toContain("*");
    const privateEntryPattern =
      /^\.\/(?:server|lib|src|routes|infrastructure|access|context|agents|integrations|middlewares|interview-notifications)(?:\/|$)/;
    expect(Object.keys(packageJson.exports).filter((key) => privateEntryPattern.test(key))).toEqual(
      [],
    );
  });

  it("exposes only the RPC contract and the Web host runtime", () => {
    expect(readServerExportSources()).toEqual({
      "./rpc-client": "./src/rpc-client.ts",
      "./web/runtime": "./src/exports/web/runtime.ts",
    });
  });

  it("lets the Web host load the environment contract without evaluating the backend", () => {
    const runtimeSource = readFileSync(
      path.join(serverRoot, "src/exports/web/runtime.ts"),
      "utf-8",
    );
    const staticRuntimeImports = [...runtimeSource.matchAll(staticRuntimeImportPattern)].map(
      (match) => match[1],
    );

    expect(staticRuntimeImports).toEqual(["../../infrastructure/env"]);
  });

  it("registers the Server database before any Web host capability reaches shared packages", () => {
    const runtimeSource = readFileSync(
      path.join(serverRoot, "src/exports/web/runtime.ts"),
      "utf-8",
    );
    const capabilities = runtimeSource.split(/^export async function /m).slice(1);
    const withoutRegistration = capabilities.flatMap((body) =>
      body.includes("loadServerDatabase()") ? [] : [body.slice(0, body.indexOf("("))],
    );

    expect(capabilities.length).toBeGreaterThan(0);
    expect(withoutRegistration).toEqual([]);
  });

  it("keeps the Worker independent from the Server package", () => {
    const workerManifest = readFileSync(path.join(repoRoot, "apps/worker/package.json"), "utf-8");
    const workerImports = sourceFiles(path.join(repoRoot, "apps/worker/src")).flatMap((file) =>
      readFileSync(file, "utf-8").includes("@app/server") ? [path.relative(repoRoot, file)] : [],
    );

    expect(workerManifest).not.toContain('"@app/server"');
    expect(workerImports).toEqual([]);
  });

  it("keeps internal server paths private from web and worker", () => {
    const violations = ["apps/web/src", "apps/web/nitro", "apps/worker/src"].flatMap(
      (relativeDirectory) =>
        sourceFiles(path.join(repoRoot, relativeDirectory)).flatMap((file) => {
          const source = readFileSync(file, "utf-8");
          return /@app\/server\/(?:server|lib\/server|routes|infrastructure|access|context|agents|integrations|middlewares|interview-notifications)(?:\/|["'])/.test(
            source,
          )
            ? [path.relative(repoRoot, file)]
            : [];
        }),
    );

    expect(violations).toEqual([]);
  });

  it("keeps Studio web data access behind Hono RPC", () => {
    const packageJson = readServerPackageJson();
    const webSources = sourceFiles(path.join(repoRoot, "apps/web/src"));
    const studioExport = ["@app/server", "web", "studio"].join("/");
    const directStudioImports = webSources.flatMap((file) => {
      const source = readFileSync(file, "utf-8");
      return source.includes(studioExport) ? [path.relative(repoRoot, file)] : [];
    });

    expect(packageJson.exports).not.toHaveProperty("./web/studio");
    expect(directStudioImports).toEqual([]);
  });

  it("loads page bootstrap data through page-permission RPC endpoints", () => {
    const cases = [
      ["forms", "forms.bootstrap", 'requirePermission("page", "questionBank")'],
      [
        "interview-questions",
        '["interview-questions"].bootstrap',
        'requirePermission("page", "questionBank")',
      ],
      ["interviewers", "interviewers.bootstrap", 'requirePermission("page", "interviewers")'],
      [
        "job-descriptions",
        '["job-descriptions"].bootstrap',
        'requirePermission("page", "jobDescriptions")',
      ],
    ] as const;

    for (const [capability, rpcAccess, permission] of cases) {
      const webSource = readFileSync(
        path.join(repoRoot, `apps/web/src/lib/start/studio/${capability}.server.ts`),
        "utf-8",
      );
      const routeSource = readFileSync(
        path.join(serverRoot, `src/routes/studio/routes/${capability}/route.ts`),
        "utf-8",
      );

      expect(webSource).toContain(rpcAccess);
      expect(routeSource).toContain(permission);
    }
  });

  it("keeps raw auth and database access out of the web host runtime", () => {
    const runtimeSource = readFileSync(
      path.join(serverRoot, "src/exports/web/runtime.ts"),
      "utf-8",
    );

    expect(runtimeSource).not.toMatch(/export\s*\{[^}]*\b(?:auth|db)\b/);
  });

  it("avoids source aliases and package self-imports inside server source", () => {
    const violations = sourceFiles(path.join(serverRoot, "src")).flatMap((file) => {
      const source = readFileSync(file, "utf-8");
      return /#(?:server|lib\/server)\/|@server\/|@app\/server\//.test(source)
        ? [path.relative(repoRoot, file)]
        : [];
    });

    expect(violations).toEqual([]);
  });
});
