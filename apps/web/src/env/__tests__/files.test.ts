import path from "node:path";
import { describe, expect, it } from "vitest";
import { envFileNames, resolveEnvDir } from "../files";

const currentRoot = path.resolve("/workspace/apps/web");
const legacyRoot = path.resolve("/workspace/apps/ai-recruitment-copilot");

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

  it("prefers the new app directory when both directories contain env files", () => {
    expect(
      resolveEnvDir(
        currentRoot,
        legacyRoot,
        fileExists(path.join(currentRoot, ".env"), path.join(legacyRoot, ".env.local")),
      ),
    ).toBe(currentRoot);
  });

  it("falls back to the legacy app directory when the new directory has no env file", () => {
    expect(resolveEnvDir(currentRoot, legacyRoot, fileExists(path.join(legacyRoot, ".env")))).toBe(
      legacyRoot,
    );
  });

  it("returns the new app directory when neither directory has an env file", () => {
    expect(resolveEnvDir(currentRoot, legacyRoot, fileExists())).toBe(currentRoot);
  });

  it("falls back for a mode-specific env file in the legacy directory", () => {
    expect(
      resolveEnvDir(
        currentRoot,
        legacyRoot,
        fileExists(path.join(legacyRoot, ".env.production")),
        "production",
      ),
    ).toBe(legacyRoot);
  });
});
