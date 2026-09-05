import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const serverRoot = path.resolve(import.meta.dirname, "../..");
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

describe("@app/server package boundary", () => {
  it("keeps reusable processing packages independent from HTTP and application packages", () => {
    const packageRoots = [
      path.join(repoRoot, "packages/meeting-processing"),
      path.join(repoRoot, "packages/resume-processing"),
    ];
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
  });

  it("does not re-export capabilities already owned by the Worker", () => {
    const packageJson = readServerPackageJson();

    expect(Object.keys(packageJson.exports).some((key) => key.startsWith("./worker/"))).toBe(false);
    expect(packageJson.exports).not.toHaveProperty("./worker/meeting-answer");
    expect(packageJson.exports).not.toHaveProperty("./worker/meeting-operations");
    expect(packageJson.exports).not.toHaveProperty("./worker/meeting-playback");
    expect(packageJson.exports).not.toHaveProperty("./worker/runtime");
  });

  it("keeps internal server paths private from web and worker", () => {
    const violations = ["apps/web/src", "apps/web/server", "apps/worker/src"].flatMap(
      (relativeDirectory) =>
        sourceFiles(path.join(repoRoot, relativeDirectory)).flatMap((file) => {
          const source = readFileSync(file, "utf-8");
          return /@app\/server\/(?:server|lib\/server)\//.test(source)
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
      ["forms", "forms.bootstrap", 'requirePermission("page", "forms")'],
      [
        "interview-questions",
        '["interview-questions"].bootstrap',
        'requirePermission("page", "interviewQuestions")',
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
        path.join(serverRoot, `src/server/routes/studio/routes/${capability}/route.ts`),
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
