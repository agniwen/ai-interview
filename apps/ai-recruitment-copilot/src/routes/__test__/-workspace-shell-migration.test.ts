import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(srcRoot, relativePath), "utf-8");
}

describe("TanStack Start workspace shell migration", () => {
  it("registers workspace shell routes in the generated route tree", () => {
    const routeTree = readSource("routeTree.gen.ts");

    expect(routeTree).toContain("'/w/$slug'");
    expect(routeTree).toContain("'/w/$slug/agent'");
    expect(routeTree).toContain("'/w/$slug/agent/'");
    expect(routeTree).toContain("'/w/$slug/agent/$sessionId'");
    expect(routeTree).toContain("'/w/$slug/chat'");
    expect(routeTree).toContain("'/w/$slug/chat/'");
    expect(routeTree).toContain("'/w/$slug/chat/$sessionId'");
    expect(routeTree).toContain("'/w/$slug/studio'");
  });

  it("keeps migrated workspace shell files free of Next runtime imports", () => {
    const sources = [
      readSource("routes/w.$slug.tsx"),
      readSource("routes/w.$slug.agent.tsx"),
      readSource("routes/w.$slug.studio.tsx"),
      readSource("components/features/chat/background-stream-toaster.tsx"),
    ];

    expect(sources.join("\n")).not.toMatch(/next\/(?:link|navigation|headers|server|cache)/u);
  });

  it("derives agent session active state from TanStack Router params", () => {
    const sidebarSlots = readSource("components/features/chat/chat-sidebar-slots.tsx");

    expect(sidebarSlots).toContain("useParams");
    expect(sidebarSlots).toContain("params.sessionId");
    expect(sidebarSlots).not.toContain("CHAT_EVENTS.sessionPathUpdated");
    expect(sidebarSlots).not.toContain("useSyncExternalStore");
  });

  it("uses typed router navigation for agent session URL changes", () => {
    const workspace = readSource("components/features/chat/chat-workspace.tsx");
    const toaster = readSource("components/features/chat/background-stream-toaster.tsx");

    expect(workspace).not.toContain("window.history.replaceState");
    expect(workspace).not.toContain("CHAT_EVENTS.sessionPathUpdated");
    expect(toaster).not.toContain("window.location.pathname");
    expect(toaster).not.toContain("navigate({ href");
    expect(`${workspace}\n${toaster}`).toContain('to: "/w/$slug/agent/$sessionId"');
  });

  it("clears one-shot studio query params through router search state", () => {
    const interviews = readSource("routes/w.$slug.studio.interviews.tsx");
    const resumes = readSource("routes/w.$slug.studio.resumes.tsx");

    expect(`${interviews}\n${resumes}`).not.toContain("window.history.replaceState");
    expect(interviews).toContain('to: "/w/$slug/studio/interviews"');
    expect(resumes).toContain('to: "/w/$slug/studio/resumes"');
    expect(interviews).toContain('useSearch({ from: "/w/$slug/studio/interviews" })');
    expect(resumes).toContain('useSearch({ from: "/w/$slug/studio/resumes" })');
  });

  it("keeps workspace management tab state in router search", () => {
    const members = readSource("routes/w.$slug.studio.members.tsx");

    expect(members).toContain('useSearch({ from: "/w/$slug/studio/members" })');
    expect(members).toContain("validateSearch");
    expect(members).toContain("value={activeTab}");
    expect(members).not.toContain('defaultValue="members"');
  });

  it("renders sidebar slot skeletons before portal content hydrates", () => {
    const appSidebar = readSource("components/layout/app-sidebar/app-sidebar.tsx");
    const platformSidebar = readSource("components/layout/platform-sidebar/platform-sidebar.tsx");
    const skeleton = readSource("components/layout/app-sidebar/sidebar-slot-skeleton.tsx");

    expect(`${appSidebar}\n${platformSidebar}`).not.toContain("ssrFallback=");
    expect(`${appSidebar}\n${platformSidebar}`).toContain("SidebarSlotHydrationFallback");
    expect(skeleton).toContain("SidebarMenuSkeleton");
    expect(skeleton).toContain("useHydrated");
    expect(skeleton).toContain("aria-hidden");
  });

  it("scopes Glimm transitions to Agent and Studio sidebar tab switches", () => {
    const packageJson = readSource("../package.json");
    const workspaceRoute = readSource("routes/w.$slug.tsx");
    const sidebarTabs = readSource("components/layout/app-sidebar/sidebar-tabs.tsx");

    expect(packageJson).toContain('"glimm"');
    expect(workspaceRoute).toContain('import { GlimmProvider } from "glimm/react"');
    expect(workspaceRoute).toContain("<GlimmProvider");
    expect(sidebarTabs).toContain('import { useGlimm } from "glimm/react"');
    expect(sidebarTabs).toContain("const { sweep } = useGlimm();");
    expect(sidebarTabs).toContain("void sweep(");
    expect(sidebarTabs).toContain("navigate({ to: target });");
    expect(sidebarTabs).not.toContain("InterceptLinks");
  });
});
