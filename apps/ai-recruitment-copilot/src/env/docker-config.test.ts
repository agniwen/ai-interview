import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

function readRepoFile(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

describe("Docker env configuration", () => {
  it("does not silently default public auth URLs to example.com", () => {
    const dockerfile = readRepoFile("apps/ai-recruitment-copilot/Dockerfile");
    const compose = readRepoFile("docker-compose.yml");

    for (const name of ["BETTER_AUTH_URL", "NEXT_PUBLIC_BASE_URL", "NEXT_PUBLIC_BETTER_AUTH_URL"]) {
      expect(dockerfile).not.toContain(`ARG ${name}=https://example.com`);
      expect(compose).not.toContain(`${name}:-https://example.com`);
    }
  });
});
