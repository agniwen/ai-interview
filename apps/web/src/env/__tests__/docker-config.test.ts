import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../../../..");

function readRepoFile(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

describe("Docker env configuration", () => {
  it("copies app runtime workspace manifests before every Bun install", () => {
    const runtimeWorkspaceManifests = [
      "packages/ai-runtime/package.json",
      "packages/meeting-media/package.json",
      "packages/object-storage/package.json",
    ];

    for (const dockerfilePath of ["apps/web/Dockerfile", "apps/worker/Dockerfile"]) {
      const installStages = readRepoFile(dockerfilePath)
        .split(/^FROM /m)
        .filter((stage) => stage.includes("RUN bun install"));

      expect(installStages.length).toBeGreaterThan(0);
      for (const stage of installStages) {
        for (const manifest of runtimeWorkspaceManifests) {
          expect(stage, `${dockerfilePath} must copy ${manifest} before bun install`).toContain(
            `COPY ${manifest}`,
          );
        }
      }
    }
  });

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

  it("uses the dependency-aware readiness endpoint for the web healthcheck", () => {
    const compose = readRepoFile("docker-compose.yml");

    expect(compose).toContain("fetch('http://127.0.0.1:3000/api/ready')");
    expect(compose).not.toContain("fetch('http://127.0.0.1:3000/api/health')");
  });

  it("keeps local env ownership within each application", () => {
    const compose = readRepoFile("docker-compose.local.yml");

    expect(compose).toContain("path: apps/web/.env");
    expect(compose).toContain("path: apps/worker/.env");
    expect(compose).not.toContain("ai-recruitment-copilot/.env");
    expect(compose).not.toContain("required: true");
  });
});
