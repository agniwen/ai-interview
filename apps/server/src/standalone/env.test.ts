import path from "node:path";
import { describe, expect, it } from "vitest";
import { envFileNames, resolveEnvDir } from "./env";

const currentRoot = path.resolve("/workspace/apps/server");
const legacyRoot = path.resolve("/workspace/apps/ai-recruitment-copilot-backend");

function fileExists(...existingFiles: string[]) {
  const files = new Set(existingFiles);
  return (filePath: string) => files.has(filePath);
}

describe("resolveEnvDir", () => {
  it("uses Vite's mode-specific precedence", () => {
    expect(envFileNames("production")).toEqual([
      ".env.production.local",
      ".env.production",
      ".env.local",
      ".env",
    ]);
  });

  it("uses the current directory whenever it contains an env file", () => {
    expect(
      resolveEnvDir(
        currentRoot,
        legacyRoot,
        fileExists(path.join(currentRoot, ".env.local"), path.join(legacyRoot, ".env")),
      ),
    ).toBe(currentRoot);
  });

  it("uses the legacy directory only when the current directory has no env file", () => {
    expect(resolveEnvDir(currentRoot, legacyRoot, fileExists(path.join(legacyRoot, ".env")))).toBe(
      legacyRoot,
    );
  });

  it("uses a mode-specific env file from the legacy directory", () => {
    expect(
      resolveEnvDir(
        currentRoot,
        legacyRoot,
        fileExists(path.join(legacyRoot, ".env.production.local")),
        "production",
      ),
    ).toBe(legacyRoot);
  });
});
