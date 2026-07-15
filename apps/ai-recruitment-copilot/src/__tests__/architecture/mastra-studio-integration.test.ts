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
    expect(sidebar).toContain("mainNav");
    expect(sidebar).toContain("bottomNav");
    expect(sidebar).toContain("MastraSidebarSearch");
    expect(tabs).toContain('value="manage">管理');
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
    const globalStyles = readSource("apps/ai-recruitment-copilot/src/styles/globals.css");
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
    expect(theme).toContain('document.body.classList.add("mastra-studio-active")');
    expect(theme).toContain('document.body.classList.remove("mastra-studio-active")');
    expect(globalStyles).toContain(
      "properties, theme, base, mastra-studio-components, components, mastra-studio-utilities, utilities",
    );
  });

  it("uses the host header and semantic theme tokens", () => {
    const platformLayout = readSource(
      "apps/ai-recruitment-copilot/src/components/features/platform/platform-layout.tsx",
    );
    const platformSidebar = readSource(
      "apps/ai-recruitment-copilot/src/components/layout/platform-sidebar/platform-sidebar.tsx",
    );
    const embeddedLayout = readSource(
      "apps/ai-recruitment-copilot/src/components/features/mastra-studio/router/embedded-studio-layout.tsx",
    );
    const studioHeader = readSource(
      "apps/ai-recruitment-copilot/src/components/features/mastra-studio/router/mastra-studio-header.tsx",
    );
    const studioStyles = readSource(
      "apps/ai-recruitment-copilot/src/components/features/mastra-studio/mastra-studio.css",
    );

    expect(platformSidebar).not.toContain("PlatformLogo");
    expect(platformLayout).not.toContain("<PlatformHeader />\n        <PendingOutlet");
    expect(embeddedLayout).toContain("<MastraStudioHeader />");
    expect(embeddedLayout).not.toContain("<RouteHeader />");
    expect(embeddedLayout).not.toContain("border border-border1");
    expect(embeddedLayout).not.toContain("shadow-main-frame");
    expect(studioHeader).toContain("SidebarInsetHeader");
    expect(studioHeader).toContain("RouteHeaderActionsSlot");
    expect(studioStyles).toContain("--surface1: var(--background)");
    expect(studioStyles).toContain("--neutral6: var(--foreground)");
    expect(studioStyles).toContain("--accent1: var(--primary)");
    expect(studioStyles).toContain("--accent5: var(--primary)");
    expect(studioStyles).toContain("body.mastra-studio-active [data-base-ui-portal]");
    expect(studioStyles).toContain('[data-variant="primary"]');
    expect(studioStyles).toContain("color: var(--primary-foreground)");
    expect(studioStyles).toContain("flex-shrink: 0");
    expect(studioStyles).toContain("white-space: nowrap");
  });

  it("keeps Platform navigation aligned with the host sidebar interaction", () => {
    const platformSidebarSlots = readSource(
      "apps/ai-recruitment-copilot/src/components/features/platform/platform-sidebar-slots.tsx",
    );

    expect(platformSidebarSlots).toContain('size="default"');
    expect(platformSidebarSlots).toContain("active:scale-[0.98]");
    expect(platformSidebarSlots).toContain("data-[active=false]:opacity-90");
    expect(platformSidebarSlots).toContain("motion-reduce:active:scale-100");
  });

  it("loads the Studio command palette only after user intent", () => {
    const commandEntry = readSource(
      "apps/ai-recruitment-copilot/src/components/features/mastra-studio/upstream/lib/command/index.ts",
    );
    const lazyCommand = readSource(
      "apps/ai-recruitment-copilot/src/components/features/mastra-studio/upstream/lib/command/navigation-command-lazy.tsx",
    );
    const commandDialog = readSource(
      "apps/ai-recruitment-copilot/src/components/features/mastra-studio/upstream/lib/command/navigation-command.tsx",
    );

    expect(commandEntry).toContain('from "./navigation-command-lazy"');
    expect(lazyCommand).toContain('import("./navigation-command")');
    expect(commandDialog).toContain("useAgents({ enabled: open })");
    expect(commandDialog).toContain("useScorers({ enabled: open })");
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
    expect(settings).toContain("连接由宿主应用管理");
  });

  it("keeps package-owned Studio surfaces localized", () => {
    const workspace = readSource("pnpm-workspace.yaml");
    const localizationPatch = readSource("patches/@mastra__playground-ui@40.0.1.patch");

    expect(workspace).toContain(
      '"@mastra/playground-ui@40.0.1": patches/@mastra__playground-ui@40.0.1.patch',
    );
    expect(localizationPatch).toContain('title: "模型用量与成本"');
    expect(localizationPatch).toContain('title: "暂无追踪记录"');
    expect(localizationPatch).toContain('label = "添加筛选条件"');
    expect(localizationPatch).toContain('titleSlot: title ?? "会话已过期"');
    expect(localizationPatch).toContain('children: "观测记忆"');
  });

  it("keeps custom drag portals inside the scoped Studio root", () => {
    const columnMapping = readSource(
      "apps/ai-recruitment-copilot/src/components/features/mastra-studio/upstream/domains/datasets/components/csv-import/column-mapping-step.tsx",
    );

    expect(columnMapping).toContain("usePortalContainer()");
    expect(columnMapping).not.toContain("createPortal(child, document.body)");
  });
});
