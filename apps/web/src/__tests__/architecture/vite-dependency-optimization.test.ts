import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.resolve(import.meta.dirname, "../../..");

describe("Vite dependency optimization", () => {
  it("pre-bundles every Assistant UI entry used by the lazy Agent route", () => {
    const viteConfig = readFileSync(path.join(appRoot, "vite.config.ts"), "utf-8");

    expect(viteConfig).toContain('"@ai-sdk/react"');
    expect(viteConfig).toContain('"@assistant-ui/react"');
    expect(viteConfig).toContain('"@assistant-ui/react-ai-sdk"');
    expect(viteConfig).toContain('"@assistant-ui/react-lexical"');
    expect(viteConfig).toContain('"@blobatar/react"');
    expect(viteConfig).toContain('"@blobatar/react/gaze"');
    expect(viteConfig).toContain('"ai"');
    expect(viteConfig).toContain('"lru-cache"');
  });

  it("pre-bundles the Base UI package and all deep entry points", () => {
    const viteConfig = readFileSync(path.join(appRoot, "vite.config.ts"), "utf-8");

    expect(viteConfig).toContain('"@base-ui/react"');
    expect(viteConfig).toContain('"@base-ui/react/**"');
    expect(viteConfig).toContain('"cmdk"');
    expect(viteConfig).toContain('"semver"');
  });

  it("keeps the normal dev cache and reserves cache clearing for dev:fresh", () => {
    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
    const packageJson = JSON.parse(readFileSync(path.join(appRoot, "package.json"), "utf-8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts.predev).toBeUndefined();
    expect(packageJson.scripts.dev).toBe("vite dev");
    expect(packageJson.scripts["dev:fresh"]).toContain("rm -rf node_modules/.vite");
    expect(packageJson.scripts["dev:fresh"]).toContain("vite dev --force");
  });

  it("uses the stable dev cache from the default workspace target", () => {
    const makefile = readFileSync(path.join(appRoot, "../../Makefile"), "utf-8");

    expect(makefile).toMatch(/web-dev:.*\n\tbun run --filter @app\/web dev\n/);
  });

  it("keeps the development build marker stable across restarts", () => {
    const viteConfig = readFileSync(path.join(appRoot, "vite.config.ts"), "utf-8");

    expect(viteConfig).toContain(
      'const buildTime = process.env.NODE_ENV === "production" ? new Date().toISOString() : "development";',
    );
  });
});
