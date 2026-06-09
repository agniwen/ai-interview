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
      return listSourceFiles(fullPath);
    }
    return /\.(ts|tsx)$/u.test(entry) ? [fullPath] : [];
  });
}

describe("TanStack Start migration patterns", () => {
  it("uses schema validators instead of passthrough server function validators", () => {
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
    expect(rootRoute).toContain("useRouter()");
    expect(router).toContain("setupRouterSsrQueryIntegration");
    expect(router).toContain("context: { queryClient }");
    expect(router).toContain('defaultPreload: "intent"');
    expect(readSource("src/components/providers/query-provider.tsx")).toContain(
      "queryClient: ReturnType<typeof getQueryClient>",
    );
  });

  it("configures TanStack Start to prerender the public home page", () => {
    const viteConfig = readSource("vite.config.ts");

    expect(viteConfig).toContain("prerender:");
    expect(viteConfig).toContain('path: "/"');
    expect(viteConfig).toContain("prerender: { enabled: true");
  });

  it("keeps Next public environment variables exposed through Vite", () => {
    const viteConfig = readSource("vite.config.ts");
    const clientSources = [
      readSource("src/components/auth/google-sign-in-button.tsx"),
      readSource("src/components/auth/sign-in-tabs.tsx"),
      readSource("src/components/interview/interview-room.tsx"),
      readSource("src/lib/client/analytics.ts"),
    ].join("\n");

    expect(viteConfig).toContain('envPrefix: ["VITE_", "NEXT_PUBLIC_"]');
    expect(clientSources).not.toContain("process.env.NEXT_PUBLIC_");
    expect(clientSources).toContain("import.meta.env.NEXT_PUBLIC_");
  });

  it("does not keep Next-only client/server marker packages after migrating to TanStack Start", () => {
    const viteConfig = readSource("vite.config.ts");
    const vitestConfig = readSource("vitest.config.ts");
    const packageJson = readSource("package.json");
    const sources = listSourceFiles(srcRoot)
      .map((file) => [path.relative(appRoot, file), readFileSync(file, "utf-8")] as const)
      .filter(([file]) => !file.startsWith(`src${path.sep}routes${path.sep}__test__`));
    const markerImports = sources.flatMap(([file, source]) =>
      /from\s+["'](?:client-only|server-only)["']|import\s+["'](?:client-only|server-only)["']/u.test(
        source,
      )
        ? [file]
        : [],
    );

    expect(markerImports).toEqual([]);
    expect(viteConfig).not.toContain("client-only");
    expect(viteConfig).not.toContain("server-only");
    expect(vitestConfig).not.toContain("client-only");
    expect(vitestConfig).not.toContain("server-only");
    expect(packageJson).not.toContain('"client-only"');
    expect(packageJson).not.toContain('"server-only"');
    expect(viteConfig).toContain('include: ["posthog-js"]');
  });

  it("forces Vite dependency optimization on dev server startup during the migration", () => {
    const packageJson = JSON.parse(readSource("package.json")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts.dev).toBe("vite dev --force");
  });

  it("keeps server function runtime modules out of circular imports", () => {
    const authSessionServer = readSource("src/lib/start/auth-session.server.ts");

    expect(authSessionServer).not.toContain('from "./auth-session"');
    expect(authSessionServer).toContain('from "@/lib/start/auth-session-types"');
  });

  it("handles notFound at the root instead of rendering inside layout routes", () => {
    const rootRoute = readSource("src/routes/__root.tsx");
    const router = readSource("src/router.tsx");
    const studioLayoutRoute = readSource("src/routes/w.$slug.studio.tsx");

    expect(router).toContain("defaultNotFoundComponent:");
    expect(router).toContain('notFoundMode: "root"');
    expect(rootRoute).toContain("notFoundComponent:");
    expect(rootRoute).toContain("NotFoundPage");
    expect(studioLayoutRoute).not.toContain("notFoundComponent:");
  });
});
