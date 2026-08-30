import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveSidebarSlotDirection, sidebarSlotPanelVariants } from "./sidebar-slot-transition";

describe("sidebar slot transition", () => {
  it("keeps the slot coordinator in the persistent workspace sidebar shell", () => {
    const shellSource = readFileSync(new URL("app-sidebar-shell.tsx", import.meta.url), "utf-8");
    const agentRouteSource = readFileSync(
      new URL("../../../routes/w.$slug.agent.tsx", import.meta.url),
      "utf-8",
    );
    const studioRouteSource = readFileSync(
      new URL("../../../routes/w.$slug.studio.tsx", import.meta.url),
      "utf-8",
    );

    expect(shellSource).toContain("<WorkspaceSidebarSlots />");
    expect(agentRouteSource).not.toContain("<ChatSidebarSlots />");
    expect(studioRouteSource).not.toContain("<StudioSidebarSlots />");
  });

  it("keeps workspace navigation free of the Glimm sweep dependency", () => {
    const workspaceRouteSource = readFileSync(
      new URL("../../../routes/w.$slug.tsx", import.meta.url),
      "utf-8",
    );
    const sidebarTabsSource = readFileSync(new URL("sidebar-tabs.tsx", import.meta.url), "utf-8");
    const packageSource = readFileSync(
      new URL("../../../../package.json", import.meta.url),
      "utf-8",
    );

    expect(workspaceRouteSource).not.toContain("glimm");
    expect(sidebarTabsSource).not.toContain("glimm");
    expect(packageSource).not.toContain('"glimm"');
  });

  it("uses the shared auto-hiding ScrollArea for sidebar content", () => {
    const appSidebarSource = readFileSync(new URL("app-sidebar.tsx", import.meta.url), "utf-8");

    expect(appSidebarSource).toContain('import { ScrollArea } from "@/components/ui/scroll-area"');
    expect(appSidebarSource).toContain(
      '<ScrollArea className="min-h-0 flex-1" scrollFade scrollbars="leave">',
    );
    expect(appSidebarSource).toContain('<SidebarContent className="relative overflow-hidden">');
  });

  it("follows the Agent and Studio tab order", () => {
    expect(resolveSidebarSlotDirection("agent", "studio")).toBe(1);
    expect(resolveSidebarSlotDirection("studio", "agent")).toBe(-1);
  });

  it("uses the same directional slide as the sign-in tabs", () => {
    const context = { direction: 1 as const, reduceMotion: false };

    expect(sidebarSlotPanelVariants.enter(context)).toEqual({
      opacity: 0,
      transform: "translateX(20px)",
    });
    expect(sidebarSlotPanelVariants.exit(context)).toEqual({
      opacity: 0,
      transform: "translateX(-20px)",
    });
  });

  it("removes horizontal movement when reduced motion is requested", () => {
    const context = { direction: -1 as const, reduceMotion: true };

    expect(sidebarSlotPanelVariants.enter(context)).toEqual({
      opacity: 1,
      transform: "translateX(0px)",
    });
    expect(sidebarSlotPanelVariants.exit(context)).toEqual({
      opacity: 1,
      transform: "translateX(0px)",
    });
  });
});
