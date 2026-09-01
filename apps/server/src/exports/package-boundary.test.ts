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
  it("uses only explicit package entrypoints", () => {
    const packageJson = readServerPackageJson();

    expect(packageJson.imports).toBeUndefined();
    expect(Object.keys(packageJson.exports).some((key) => key.includes("*"))).toBe(false);
    expect(JSON.stringify(packageJson.exports)).not.toContain("*");
  });

  it("does not re-export capabilities already owned by the Worker", () => {
    const packageJson = readServerPackageJson();

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

  it("uses relative imports instead of package aliases or self-imports", () => {
    const violations = sourceFiles(path.join(serverRoot, "src")).flatMap((file) => {
      const source = readFileSync(file, "utf-8");
      return /#(?:server|lib\/server)\/|@app\/server\//.test(source)
        ? [path.relative(repoRoot, file)]
        : [];
    });

    expect(violations).toEqual([]);
  });
});
