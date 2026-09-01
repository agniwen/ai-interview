import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../../../..");

function readRepoFile(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

describe("Docker env configuration", () => {
  it("does not silently default public auth URLs to example.com", () => {
    const dockerfile = readRepoFile("apps/web/Dockerfile");
    const compose = readRepoFile("docker-compose.yml");

    for (const name of ["BETTER_AUTH_URL", "NEXT_PUBLIC_BASE_URL", "NEXT_PUBLIC_BETTER_AUTH_URL"]) {
      expect(dockerfile).not.toContain(`ARG ${name}=https://example.com`);
      expect(compose).not.toContain(`${name}:-https://example.com`);
    }
  });

  it("requires one canonical app URL and reuses it for public build URLs", () => {
    const dockerfile = readRepoFile("apps/web/Dockerfile");
    const baseUrlFallback = ["$", "{NEXT_PUBLIC_BASE_URL:-$BETTER_AUTH_URL}"].join("");
    const authUrlFallback = ["$", "{NEXT_PUBLIC_BETTER_AUTH_URL:-$BETTER_AUTH_URL}"].join("");

    expect(dockerfile).toContain(
      'test -n "$BETTER_AUTH_URL" || (echo "BETTER_AUTH_URL build arg is required." && false)',
    );
    expect(dockerfile).toContain(`export NEXT_PUBLIC_BASE_URL="${baseUrlFallback}"`);
    expect(dockerfile).toContain(`export NEXT_PUBLIC_BETTER_AUTH_URL="${authUrlFallback}"`);
  });

  it("uses a web-owned endpoint for the web healthcheck", () => {
    const compose = readRepoFile("docker-compose.yml");

    expect(compose).toContain("fetch('http://127.0.0.1:3000/api/app-version')");
    expect(compose).not.toContain("fetch('http://127.0.0.1:3000/api/ready')");
    expect(compose).not.toContain("fetch('http://127.0.0.1:3000/api/health')");
  });

  it("accepts legacy local env files while preferring the renamed web path", () => {
    const compose = readRepoFile("docker-compose.local.yml");
    const legacyPath = "path: apps/ai-recruitment-copilot/.env";
    const currentPath = "path: apps/web/.env";

    expect(compose).toContain(legacyPath);
    expect(compose).toContain(currentPath);
    expect(compose.indexOf(legacyPath)).toBeLessThan(compose.indexOf(currentPath));
    expect(compose).not.toContain("required: true");
  });
});
