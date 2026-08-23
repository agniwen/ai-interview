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

  it("bridges body scrollbar initialization without flashing native scrollbars", () => {
    const rootRoute = readSource("src/routes/__root.tsx");

    expect(rootRoute).toMatch(/<html\s+data-overlayscrollbars-initialize/u);
    expect(rootRoute).toMatch(/<body\s+data-overlayscrollbars-initialize/u);
  });

  it("keeps Vite envPrefix for legacy NEXT_PUBLIC_* client vars", () => {
    const viteConfig = readSource("vite.config.ts");

    expect(viteConfig).toContain('envPrefix: ["NEXT_PUBLIC_"]');
  });

  it("ignores test folders and files under the routes directory", () => {
    const viteConfig = readSource("vite.config.ts");

    expect(viteConfig).toContain("routeFileIgnorePattern");
    expect(viteConfig).toMatch(/__tests__\|__test__/u);
    expect(viteConfig).toMatch(/\\.test\\./u);
    expect(viteConfig).toMatch(/\\.spec\\./u);
  });

  it("keeps auth and API clients cookie-aware for the Hono backend", () => {
    const authClient = readSource("src/lib/client/auth-client.ts");
    const rpc = readSource("src/lib/client/rpc.ts");
    const apiClient = readSource("src/lib/client/api/client.ts");
    const sources = [authClient, rpc, apiClient].join("\n");

    expect(sources).toContain('credentials: "include"');
    expect(sources).not.toContain('credentials: "same-origin"');
    expect(authClient).not.toContain("tanstackStartCookies");
  });
});
