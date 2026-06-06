import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../");

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

const nextRuntimeImportPattern =
  /(?:import\s+[^;]*\s+from\s+["']next\/(?:cache|headers|navigation|server)["']|import\s+["']next\/(?:cache|headers|navigation|server)["']|import\s+["']server-only["'])/;
const frontendImportPattern =
  /(?:from\s+["']@\/(?:app|components|lib\/client|lib\/server\/auth-session)(?:\/|["'])|import\s+["']@\/(?:app|components|lib\/client|lib\/server\/auth-session)(?:\/|["']))/;

const honoRuntimeLibServerDependencies = [
  "lib/server/auth.ts",
  "lib/server/auth-request-context.ts",
  "lib/server/candidate-forms-hash.ts",
  "lib/server/db/index.ts",
  "lib/server/db/pagination.ts",
  "lib/server/db/serialize.ts",
  "lib/server/interview-question-templates-hash.ts",
  "lib/server/resend.ts",
  "lib/server/resume-parse-pipeline.ts",
  "lib/server/s3.ts",
];

describe("Next runtime boundary", () => {
  it("keeps Hono server modules free of direct Next runtime imports", () => {
    const offenders = collectSourceFiles("server").filter((file) => {
      if (file.startsWith("server/adapters/next/")) {
        return false;
      }
      return nextRuntimeImportPattern.test(readSource(file));
    });

    expect(offenders).toEqual([]);
  });

  it("keeps Hono server modules free of frontend and Next-page-only imports", () => {
    const offenders = collectSourceFiles("server").filter((file) =>
      frontendImportPattern.test(readSource(file)),
    );

    expect(offenders).toEqual([]);
  });

  it("keeps Better Auth configuration free of next/headers", () => {
    expect(readSource("lib/server/auth.ts")).not.toMatch(nextRuntimeImportPattern);
  });

  it("keeps Hono runtime lib/server dependencies loadable outside Next", () => {
    const offenders = honoRuntimeLibServerDependencies.filter((file) =>
      nextRuntimeImportPattern.test(readSource(file)),
    );

    expect(offenders).toEqual([]);
  });
});
