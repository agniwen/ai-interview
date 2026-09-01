import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rawBackendEnvironment } from "./raw-backend-environment.js";

const SOURCE_ROOT = fileURLToPath(new URL("../", import.meta.url));
const ALLOWED_PRE_DI_BOUNDARIES = new Set([
  "background/background.config.ts",
  "bootstrap.ts",
  "config/backend-config.module.ts",
  "config/raw-backend-environment.ts",
  "instrument.ts",
  "openapi/write-openapi.ts",
]);

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return await sourceFiles(absolute);
      }
      return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [absolute] : [];
    }),
  );
  return nested.flat();
}

describe("raw backend environment compatibility boundary", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("retains a live view of process environment mutations", () => {
    vi.stubEnv("HOST", "127.0.0.1");
    expect(rawBackendEnvironment.HOST).toBe("127.0.0.1");

    vi.stubEnv("HOST", "0.0.0.0");
    expect(rawBackendEnvironment.HOST).toBe("0.0.0.0");
  });

  it("keeps direct process.env access inside explicit pre-DI boundaries", async () => {
    const violations: string[] = [];
    for (const file of await sourceFiles(SOURCE_ROOT)) {
      const relative = path.relative(SOURCE_ROOT, file);
      if (ALLOWED_PRE_DI_BOUNDARIES.has(relative)) {
        continue;
      }
      const source = await readFile(file, "utf-8");
      if (source.includes("process.env")) {
        violations.push(relative);
      }
    }

    expect(violations).toEqual([]);
  });

  it("passes explicit environment input to queue runtime helpers", async () => {
    const violations: string[] = [];
    for (const file of await sourceFiles(SOURCE_ROOT)) {
      const relative = path.relative(SOURCE_ROOT, file);
      const source = await readFile(file, "utf-8");
      const defaultEnvironmentCalls = source.match(
        /\b(?:getBackgroundRedisConnection|is[A-Za-z0-9]*QueueConfigured|resolve[A-Za-z0-9]*Concurrency)\s*\(\s*\)/gu,
      );
      if (defaultEnvironmentCalls) {
        violations.push(`${relative}: ${defaultEnvironmentCalls.join(", ")}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
