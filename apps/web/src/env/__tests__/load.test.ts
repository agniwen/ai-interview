import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvFileChain } from "../load";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("loadEnvFileChain", () => {
  it("lets a mode file replace a preloaded base value when a higher local file omits the key", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "arc-web-env-"));
    temporaryDirectories.push(directory);
    const modeLocal = path.join(directory, ".env.development.local");
    const mode = path.join(directory, ".env.development");
    const base = path.join(directory, ".env");
    writeFileSync(modeLocal, "LOCAL_ONLY=present\n");
    writeFileSync(mode, "DATABASE_URL=postgres://mode\n");
    writeFileSync(base, "DATABASE_URL=postgres://base\n");
    const processEnv = { DATABASE_URL: "postgres://base" };

    loadEnvFileChain([modeLocal, mode, base], { processEnv, replacePreloaded: true });

    expect(processEnv).toEqual({
      DATABASE_URL: "postgres://mode",
      LOCAL_ONLY: "present",
    });
  });

  it("preserves an explicit shell value that differs from every env file", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "arc-web-env-"));
    temporaryDirectories.push(directory);
    const mode = path.join(directory, ".env.development");
    const base = path.join(directory, ".env");
    writeFileSync(mode, "DATABASE_URL=postgres://mode\n");
    writeFileSync(base, "DATABASE_URL=postgres://base\n");
    const processEnv = { DATABASE_URL: "postgres://shell" };

    loadEnvFileChain([mode, base], { processEnv, replacePreloaded: true });

    expect(processEnv.DATABASE_URL).toBe("postgres://shell");
  });
});
