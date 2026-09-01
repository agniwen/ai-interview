import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.resolve(import.meta.dirname, "../../..");
const srcRoot = path.join(appRoot, "src");

function readSource(relativePath: string) {
  return readFileSync(path.join(appRoot, relativePath), "utf-8");
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      if (entry === "__tests__" || entry === "__test__") {
        return [];
      }
      return listSourceFiles(fullPath);
    }
    return /\.(ts|tsx)$/u.test(entry) && !/\.test\.(ts|tsx)$/u.test(entry) ? [fullPath] : [];
  });
}

describe("TanStack Start architecture invariants", () => {
  it("uses schema validators instead of passthrough createServerFn validators", () => {
    const serverFunctionSources = listSourceFiles(srcRoot)
      .filter(
        (file) =>
          file.includes(`${path.sep}routes${path.sep}`) ||
          file.includes(`${path.sep}lib${path.sep}start${path.sep}`),
      )
      .map((file) => [file, readFileSync(file, "utf-8")] as const)
      .filter(([, source]) => source.includes("createServerFn"));

    const passthroughValidators = serverFunctionSources.flatMap(([file, source]) =>
      /\.validator\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*(?:input|data)\s*,?\s*\)/gmu.test(
        source,
      )
        ? [path.relative(appRoot, file)]
        : [],
    );

    expect(passthroughValidators).toEqual([]);
  });

  it("passes the shared QueryClient through TanStack Router context", () => {
    const rootRoute = readSource("src/routes/__root.tsx");
    const router = readSource("src/router.tsx");

    expect(rootRoute).toContain("createRootRouteWithContext");
    expect(router).toContain("setupRouterSsrQueryIntegration");
    expect(router).toContain("context: { queryClient }");
    expect(router).toContain('defaultPreload: "intent"');
  });

  it("uses the lane-based router loader scheduler for overlapping preloads", () => {
    const packageJson = readSource("package.json");

    expect(packageJson).toContain('"@tanstack/react-router": "^1.170.32"');
    expect(packageJson).toContain('"@tanstack/react-router-ssr-query": "1.167.1"');
    expect(packageJson).toContain('"@tanstack/react-start": "^1.168.49"');
  });

  it("bridges body scrollbar initialization without flashing native scrollbars", () => {
    const rootRoute = readSource("src/routes/__root.tsx");

    expect(rootRoute).toMatch(/<html\s+data-overlayscrollbars-initialize/u);
    expect(rootRoute).toMatch(/<body\s+data-overlayscrollbars-initialize/u);
  });

  it("keeps Vite envPrefix for legacy public vars and Sentry public identifiers", () => {
    const viteConfig = readSource("vite.config.ts");

    expect(viteConfig).toContain(
      'envPrefix: ["NEXT_PUBLIC_", "SENTRY_DSN", "SENTRY_RELEASE", "SENTRY_WEB_DSN"]',
    );
    expect(viteConfig).not.toContain('envPrefix: ["SENTRY_"]');
  });

  it("ignores test folders and files under the routes directory", () => {
    const viteConfig = readSource("vite.config.ts");

    expect(viteConfig).toContain("routeFileIgnorePattern");
    expect(viteConfig).toMatch(/__tests__\|__test__/u);
    expect(viteConfig).toMatch(/\\.test\\./u);
    expect(viteConfig).toMatch(/\\.spec\\./u);
  });

  it("keeps route-critical search contracts out of heavyweight page models", () => {
    const resumesRoute = readSource("src/routes/w.$slug.studio.resumes.tsx");
    const resumeDetailRoute = readSource("src/routes/w.$slug.studio.resumes.$recordId.tsx");
    const resumeOverlayRoute = readSource(
      "src/routes/w.$slug.studio.resumes.overlay.$recordId.tsx",
    );
    const membersRoute = readSource("src/routes/w.$slug.studio.members.tsx");

    expect(resumesRoute).toContain('from "@/lib/client/data-grid-search"');
    expect(resumesRoute).not.toContain("resume-library-page-model");
    expect(resumeDetailRoute).toContain("recruiter-resume-detail-search");
    expect(resumeOverlayRoute).toContain("recruiter-resume-detail-search");
    expect(membersRoute).toContain("workspace-management-search");
    expect(membersRoute).not.toContain("members-page-model");
  });

  it("keeps auth and generated API clients cookie-aware for the Nest backend", () => {
    const authClient = readSource("src/lib/client/auth-client.ts");
    const backendApi = readSource("src/lib/client/backend-api.ts");
    const apiClient = readSource("src/lib/client/api/client.ts");
    const sources = [authClient, backendApi, apiClient].join("\n");

    expect(sources).toContain('credentials: "include"');
    expect(sources).not.toContain('credentials: "same-origin"');
    expect(backendApi).toContain("NEXT_PUBLIC_BETTER_AUTH_URL");
    expect(authClient).not.toContain("tanstackStartCookies");
  });
});
