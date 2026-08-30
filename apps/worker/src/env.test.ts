import { describe, expect, it } from "vitest";
import { envFiles, mergeWorkerEnvValues, selectEnvFiles } from "./env";

const currentFiles = ["../web/.env.local", "../web/.env"] as const;
const legacyFiles = ["../legacy/.env.local", "../legacy/.env"] as const;

function currentEnvExists(filePath: string): boolean {
  return filePath.endsWith("/web/.env");
}

function legacyEnvExists(filePath: string): boolean {
  return filePath.endsWith("/legacy/.env");
}

describe("selectEnvFiles", () => {
  it("uses Vite's mode-specific precedence", () => {
    expect(envFiles("../web", "production")).toEqual([
      "../web/.env.production.local",
      "../web/.env.production",
      "../web/.env.local",
      "../web/.env",
    ]);
  });

  it("prefers the current app env files", () => {
    expect(selectEnvFiles(currentFiles, legacyFiles, currentEnvExists)).toBe(currentFiles);
  });

  it("falls back to legacy app env files", () => {
    expect(selectEnvFiles(currentFiles, legacyFiles, legacyEnvExists)).toBe(legacyFiles);
  });

  it("recognizes a mode-specific env file", () => {
    const productionFiles = ["../web/.env.production.local", "../web/.env.production"];
    expect(
      selectEnvFiles(productionFiles, legacyFiles, (filePath) =>
        filePath.endsWith("/.env.production"),
      ),
    ).toBe(productionFiles);
  });
});

describe("mergeWorkerEnvValues", () => {
  it("lets a legacy worker env override web defaults", () => {
    expect(
      mergeWorkerEnvValues(
        {},
        { DATABASE_URL: "postgres://web", REDIS_URL: "redis://web" },
        { DATABASE_URL: "postgres://worker" },
        new Map(),
      ),
    ).toMatchObject({ DATABASE_URL: "postgres://worker", REDIS_URL: "redis://web" });
  });

  it("preserves an explicit shell value that did not come from an env file", () => {
    expect(
      mergeWorkerEnvValues(
        { DATABASE_URL: "postgres://shell" },
        { DATABASE_URL: "postgres://web" },
        { DATABASE_URL: "postgres://worker" },
        new Map([["DATABASE_URL", new Set(["postgres://web", "postgres://worker"])]]),
      ).DATABASE_URL,
    ).toBe("postgres://shell");
  });

  it("replaces a Bun-preloaded lower-priority file value", () => {
    expect(
      mergeWorkerEnvValues(
        { DATABASE_URL: "postgres://web" },
        { DATABASE_URL: "postgres://web" },
        { DATABASE_URL: "postgres://worker" },
        new Map([["DATABASE_URL", new Set(["postgres://web", "postgres://worker"])]]),
      ).DATABASE_URL,
    ).toBe("postgres://worker");
  });
});
