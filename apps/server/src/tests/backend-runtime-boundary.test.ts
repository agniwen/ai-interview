import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../");

function readSource(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf-8");
}

function collectSourceFiles(relativeDir: string): string[] {
  const absoluteDir = path.join(root, relativeDir);
  return readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(relativePath);
    }
    return entry.isFile() && /\.[cm]?tsx?$/.test(entry.name) ? [relativePath] : [];
  });
}

const webFrameworkRuntimeImportPattern =
  /(?:from\s+|import\s*\(?\s*)["'](?:next\/(?:cache|headers|navigation|server)|server-only|@tanstack\/(?:react-start|start-server-core|react-router|router-core)(?:\/[^"']*)?)["']/;
const frontendImportPattern =
  /(?:from\s+["']@\/|import\s+["']@\/|vi\.mock\(["']@\/|vi\.importActual(?:<[^>]+>)?\(["']@\/)/;

describe("backend runtime boundary", () => {
  it("keeps Hono server modules free of web framework runtime imports", () => {
    const offenders = collectSourceFiles(".").filter((file) =>
      webFrameworkRuntimeImportPattern.test(readSource(file)),
    );

    expect(offenders).toEqual([]);
  });

  it("keeps Hono server modules free of frontend app-local imports", () => {
    const offenders = collectSourceFiles(".").filter((file) =>
      frontendImportPattern.test(readSource(file)),
    );

    expect(offenders).toEqual([]);
  });

  it("keeps Better Auth configuration independent from web framework request primitives", () => {
    expect(readSource("infrastructure/auth.ts")).not.toMatch(webFrameworkRuntimeImportPattern);
  });

  it("keeps backend infrastructure loadable outside web framework runtimes", () => {
    const offenders = collectSourceFiles("infrastructure").filter((file) =>
      webFrameworkRuntimeImportPattern.test(readSource(file)),
    );

    expect(offenders).toEqual([]);
  });
});
