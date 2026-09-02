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

  it("keeps the Worker independent from the server application package", () => {
    const workerRoot = path.join(repoRoot, "apps/worker");
    const workerPackageJson = readFileSync(path.join(workerRoot, "package.json"), "utf-8");
    const sourceViolations = sourceFiles(path.join(workerRoot, "src")).flatMap((file) => {
      const source = readFileSync(file, "utf-8");
      return /@app\/server(?:\/|["'])/.test(source) ? [path.relative(repoRoot, file)] : [];
    });

    expect(workerPackageJson).not.toContain('"@app/server"');
    expect(sourceViolations).toEqual([]);
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
    const violations = ["apps/web/src", "apps/worker/src"].flatMap((relativeDirectory) =>
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

  it("exposes only the web host runtime from the server package", () => {
    const packageJson = readServerPackageJson();
    const webExports = Object.keys(packageJson.exports).filter((key) => key.startsWith("./web/"));
    const runtimeSource = readFileSync(
      path.join(serverRoot, "src/exports/web/runtime.ts"),
      "utf-8",
    );

    expect(webExports).toEqual(["./web/runtime"]);
    expect(runtimeSource).not.toMatch(/export\s*\{[^}]*\b(?:auth|db)\b/);
  });

  it("avoids hash aliases and package self-imports inside server source", () => {
    const violations = sourceFiles(path.join(serverRoot, "src")).flatMap((file) => {
      const source = readFileSync(file, "utf-8");
      return /#(?:server|lib\/server)\/|@app\/server\//.test(source)
        ? [path.relative(repoRoot, file)]
        : [];
    });

    expect(violations).toEqual([]);
  });
});
