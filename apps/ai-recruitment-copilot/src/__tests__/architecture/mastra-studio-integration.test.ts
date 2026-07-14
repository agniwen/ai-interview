import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../../../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

describe("Mastra Studio TanStack integration", () => {
  it("keeps the editable Studio source inside the host feature", () => {
    const featureRoot = path.join(
      repoRoot,
      "apps/ai-recruitment-copilot/src/components/features/mastra-studio",
    );

    expect(existsSync(path.join(featureRoot, "upstream"))).toBe(true);
    expect(existsSync(path.join(featureRoot, "router"))).toBe(true);
    expect(existsSync(path.join(featureRoot, "upstream/ee"))).toBe(false);
  });

  it("mounts Studio directly through the TanStack route boundary", () => {
    const route = readSource("apps/ai-recruitment-copilot/src/routes/platform.mastra-studio.tsx");
    const sidebar = readSource(
      "apps/ai-recruitment-copilot/src/components/features/platform/platform-sidebar-slots.tsx",
    );
    const tabs = readSource(
      "apps/ai-recruitment-copilot/src/components/features/platform/platform-sidebar-tabs.tsx",
    );

    expect(route).toContain('createFileRoute("/platform/mastra-studio")');
    expect(route).toContain("MastraStudioRouteRoot");
    expect(route).toContain("pendingComponent");
    expect(route).toContain("ssr: false");
    expect(sidebar).toContain('path: "/platform/mastra-studio/agents"');
    expect(tabs).toContain('value="manage">Manage');
    expect(tabs).toContain('value="mastra">Mastra');
  });

  it("does not depend on the former iframe build pipeline", () => {
    const rootPackage = readSource("package.json");
    const webPackage = readSource("apps/ai-recruitment-copilot/package.json");
    const viteConfig = readSource("apps/ai-recruitment-copilot/vite.config.ts");

    expect(rootPackage).not.toContain("mastra:studio:source");
    expect(webPackage).not.toContain("build:mastra-studio");
    expect(webPackage).not.toContain("copy:mastra-studio");
    expect(viteConfig).not.toContain("MASTRA_STUDIO_DEV_URL");
    expect(viteConfig).not.toContain("internal/mastra-studio");
  });

  it("isolates the published Studio stylesheet at the host boundary", () => {
    const viteConfig = readSource("apps/ai-recruitment-copilot/vite.config.ts");
    const routeRoot = readSource(
      "apps/ai-recruitment-copilot/src/components/features/mastra-studio/router/studio-route-root.tsx",
    );
    const studioStyles = readSource(
      "apps/ai-recruitment-copilot/src/components/features/mastra-studio/mastra-studio.css",
    );
    const theme = readSource(
      "apps/ai-recruitment-copilot/src/components/features/mastra-studio/router/scoped-mastra-theme.tsx",
    );

    expect(viteConfig).toContain("mastraStudioCssIsolation()");
    expect(routeRoot).toContain('import "@mastra/playground-ui/style.css"');
    expect(studioStyles).not.toContain('@import "@mastra/playground-ui/style.css"');
    expect(theme).toContain("useHostTheme");
    expect(theme).toContain('storageKey="theme"');
  });

  it("keeps the embedded Mastra connection host-managed", () => {
    const configContext = readSource(
      "apps/ai-recruitment-copilot/src/components/features/mastra-studio/upstream/domains/configuration/context/studio-config-context.tsx",
    );
    const settings = readSource(
      "apps/ai-recruitment-copilot/src/components/features/mastra-studio/upstream/pages/settings/index.tsx",
    );

    expect(configContext).not.toContain("localStorage");
    expect(configContext).toContain("defaultApiPrefix");
    expect(settings).not.toContain("StudioConfigForm");
    expect(settings).toContain("managed by the host application");
  });

  it("keeps custom drag portals inside the scoped Studio root", () => {
    const columnMapping = readSource(
      "apps/ai-recruitment-copilot/src/components/features/mastra-studio/upstream/domains/datasets/components/csv-import/column-mapping-step.tsx",
    );

    expect(columnMapping).toContain("usePortalContainer()");
    expect(columnMapping).not.toContain("createPortal(child, document.body)");
  });
});
