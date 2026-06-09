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

  it("shows delayed pending UI during slow route transitions", () => {
    const rootRoute = readSource("src/routes/__root.tsx");
    const router = readSource("src/router.tsx");
    const pendingView = readSource("src/components/layout/route-pending-view.tsx");
    const globalsCss = readSource("src/styles/globals.css");

    expect(router).toContain("defaultPendingComponent:");
    expect(router).toContain("defaultPendingMs: 350");
    expect(router).toContain("defaultPendingMinMs: 300");
    expect(rootRoute).toContain("useRouterState");
    expect(rootRoute).toContain("state.isLoading || state.isTransitioning");
    expect(rootRoute).toContain("opacity-70");
    expect(rootRoute).not.toContain("pointer-events-none opacity-70");
    expect(pendingView).toContain("正在加载");
    expect(globalsCss).toContain("@keyframes route-pending");
  });

  it("does not leave the workspace switcher disabled after navigation", () => {
    const workspaceSwitcher = readSource("src/components/workspace/workspace-switcher.tsx");

    expect(workspaceSwitcher).toContain("setSwitching(true)");
    expect(workspaceSwitcher).toContain("finally");
    expect(workspaceSwitcher).toContain("setSwitching(false)");
    expect(workspaceSwitcher.indexOf("await navigate")).toBeLessThan(
      workspaceSwitcher.indexOf("setSwitching(false)"),
    );
  });

  it("configures TanStack Start to prerender the public home page", () => {
    const viteConfig = readSource("vite.config.ts");

    expect(viteConfig).toContain("prerender:");
    expect(viteConfig).toContain('path: "/"');
    expect(viteConfig).toContain("prerender: { enabled: true");
  });

  it("keeps production HTML revalidated while hashed assets stay immutable", () => {
    const viteConfig = readSource("vite.config.ts");

    expect(viteConfig).toContain('"/assets/**"');
    expect(viteConfig).toContain("public, max-age=31536000, immutable");
    expect(viteConfig).toContain('"/**"');
    expect(viteConfig).toContain('"cache-control": "no-cache"');
  });

  it("uses Start-managed global CSS so production SSR can inline route styles", () => {
    const rootRoute = readSource("src/routes/__root.tsx");
    const viteConfig = readSource("vite.config.ts");

    expect(rootRoute).toContain('import "../styles/globals.css"');
    expect(rootRoute).toContain('import "overlayscrollbars/overlayscrollbars.css"');
    expect(rootRoute).not.toContain("globals.css?url");
    expect(rootRoute).not.toContain("overlayscrollbars.css?url");
    expect(viteConfig).toContain("inlineCss: true");
  });

  it("keeps Next public environment variables exposed through Vite", () => {
    const viteConfig = readSource("vite.config.ts");
    const clientSources = [
      readSource("src/components/auth/google-sign-in-button.tsx"),
      readSource("src/components/auth/sign-in-tabs.tsx"),
      readSource("src/components/interview/interview-room.tsx"),
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
  });

  it("clears stale Vite dependency optimization cache on dev server startup", () => {
    const packageJson = JSON.parse(readSource("package.json")) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts.predev).toContain("node_modules/.vite");
    expect(packageJson.scripts.predev).toContain(".tanstack/tmp");
    expect(packageJson.scripts.dev).toBe("vite dev");
  });

  it("keeps server function runtime modules out of circular imports", () => {
    const authSessionServer = readSource("src/lib/start/auth-session.server.ts");

    expect(authSessionServer).not.toContain('from "./auth-session"');
    expect(authSessionServer).toContain('from "@/lib/start/auth-session-types"');
  });

  it("authorizes protected server functions at the data boundary", () => {
    const workspaceRouteFiles = [
      "src/routes/w.$slug.studio.dashboard.tsx",
      "src/routes/w.$slug.studio.departments.tsx",
      "src/routes/w.$slug.studio.forms.tsx",
      "src/routes/w.$slug.studio.global-config.tsx",
      "src/routes/w.$slug.studio.interview-questions.tsx",
      "src/routes/w.$slug.studio.interviewers.tsx",
      "src/routes/w.$slug.studio.interviews.tsx",
      "src/routes/w.$slug.studio.job-descriptions.tsx",
      "src/routes/w.$slug.studio.resumes.tsx",
    ];
    const platformRouteFiles = [
      "src/routes/platform.organizations.tsx",
      "src/routes/platform.users.tsx",
    ];

    for (const file of workspaceRouteFiles) {
      const source = readSource(file);

      expect(source).toContain("createServerFn");
      expect(source).toContain("resolveWorkspaceAccessFromRequest");
      expect(source).toContain('access.status !== "ready"');
    }

    for (const file of platformRouteFiles) {
      const source = readSource(file);

      expect(source).toContain("createServerFn");
      expect(source).toContain("getPlatformAdminStateFromRequest");
      expect(source).toContain('adminState.status !== "ready"');
    }
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

  it("keeps Recharts dashboards out of the server-rendered shell", () => {
    const dashboardRoute = readSource("src/routes/w.$slug.studio.dashboard.tsx");
    const resumesRoute = readSource("src/routes/w.$slug.studio.resumes.tsx");
    const jobDescriptionsRoute = readSource("src/routes/w.$slug.studio.job-descriptions.tsx");

    expect(dashboardRoute).toContain("ClientOnly");
    expect(dashboardRoute).toContain('} from "@tanstack/react-router"');
    expect(resumesRoute).toContain("ClientOnly");
    expect(resumesRoute).toContain('} from "@tanstack/react-router"');
    expect(jobDescriptionsRoute).toContain("ClientOnly");
    expect(jobDescriptionsRoute).toContain('} from "@tanstack/react-router"');
    expect(resumesRoute).toContain("<ResumeLibraryCharts metrics={metrics} />");
    expect(jobDescriptionsRoute).toContain("<JobDescriptionCharts metrics={metrics} />");
  });

  it("applies pending opacity to nested app outlets instead of the root shell", () => {
    const rootRoute = readSource("src/routes/__root.tsx");
    const studioLayoutRoute = readSource("src/routes/w.$slug.studio.tsx");
    const chatLayoutRoute = readSource("src/routes/w.$slug.chat.tsx");
    const platformLayoutRoute = readSource("src/routes/platform.tsx");

    expect(rootRoute).not.toContain("opacity-70");
    expect(rootRoute).not.toContain("isTransitioning");
    expect(studioLayoutRoute).toContain("PendingOutlet");
    expect(chatLayoutRoute).toContain("PendingOutlet");
    expect(platformLayoutRoute).toContain("PendingOutlet");
  });

  it("enables React Compiler in the Vite React pipeline", () => {
    const viteConfig = readSource("vite.config.ts");

    expect(viteConfig).toContain('import babel from "@rolldown/plugin-babel"');
    expect(viteConfig).toContain("reactCompilerPreset");
    expect(viteConfig).toContain("babel({");
    expect(viteConfig).toContain("presets: [reactCompilerPreset()]");
  });
});
