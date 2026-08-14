import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.resolve(import.meta.dirname, "../../..");

describe("Vite dependency optimization", () => {
  it("pre-bundles the Base UI package and all deep entry points", () => {
    const viteConfig = readFileSync(path.join(appRoot, "vite.config.ts"), "utf-8");

    expect(viteConfig).toContain('"@base-ui/react"');
    expect(viteConfig).toContain('"@base-ui/react/**"');
    expect(viteConfig).toContain('"cmdk"');
    expect(viteConfig).toContain('"semver"');
  });

  it("keeps the normal dev cache and reserves cache clearing for dev:fresh", () => {
    const packageJson = JSON.parse(readFileSync(path.join(appRoot, "package.json"), "utf-8")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts.predev).toBeUndefined();
    expect(packageJson.scripts.dev).toBe("vite dev");
    expect(packageJson.scripts["dev:fresh"]).toContain("rm -rf node_modules/.vite");
    expect(packageJson.scripts["dev:fresh"]).toContain("vite dev --force");
  });
});
