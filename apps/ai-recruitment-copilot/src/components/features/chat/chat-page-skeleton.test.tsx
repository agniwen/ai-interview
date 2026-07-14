// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMessageListSkeleton, ChatPageSkeleton } from "./chat-page-skeleton";

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf-8");
}

describe("ChatPageSkeleton", () => {
  it("matches the empty recruiting chat composition", () => {
    const html = renderToStaticMarkup(<ChatPageSkeleton />);

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="招聘对话加载中"');
    expect(html).toContain("--thread-max-width:48rem");
    expect(html).toContain("max-w-(--thread-max-width)");
    expect(html).toContain("rounded-[28px]");
    expect(html).toContain("pb-[18vh]");
  });

  it("matches the existing conversation composition", () => {
    const html = renderToStaticMarkup(<ChatMessageListSkeleton />);
    const container = document.createElement("div");
    container.innerHTML = html;
    const footer = container.querySelector(".aui-thread-footer");
    const composerRoot = footer?.querySelector(".aui-composer-root");
    const composerShell = composerRoot?.querySelector(":scope > .aui-composer-shell");
    const composerInput = composerShell?.querySelector(":scope > .aui-composer-input");
    const composerActions = composerShell?.querySelector(":scope > .aui-composer-action-wrapper");
    const disclaimerSkeleton =
      composerRoot?.nextElementSibling?.querySelector('[data-slot="skeleton"]');

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="聊天记录加载中"');
    expect(html).toContain("--thread-max-width:48rem");
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain("flex w-full flex-col gap-2 rounded-[28px]");
    expect(html).toContain("min-h-10 w-full");
    expect(html).toContain("flex items-center justify-end gap-1");
    expect(footer?.classList).toContain("sticky");
    expect(composerRoot?.parentElement).toBe(footer?.firstElementChild);
    expect(composerShell?.children[0]).toBe(composerInput);
    expect(composerShell?.children[1]).toBe(composerActions);
    expect(disclaimerSkeleton?.classList).toContain("h-4");
    expect(html).not.toContain("pb-[18vh]");
  });

  it("covers layout transitions and chat history initialization", () => {
    const agentLayout = readSource("../../../routes/w.$slug.agent.tsx");
    const agentIndex = readSource("../../../routes/w.$slug.agent.index.tsx");
    const agentSession = readSource("../../../routes/w.$slug.agent.$sessionId.tsx");
    const studioLayout = readSource("../../../routes/w.$slug.studio.tsx");
    const chatWorkspace = readSource("chat-workspace.tsx");

    expect(agentLayout).toContain("pendingComponent: AgentPendingRoute");
    expect(agentLayout).toContain("<ChatPendingSkeleton />");
    expect(agentIndex).toContain("pendingComponent: ChatPageSkeleton");
    expect(agentSession).toContain("pendingComponent: ChatMessageListSkeleton");
    expect(studioLayout).toContain("<RecruitingPageSkeleton />");
    expect(studioLayout).toContain("pendingComponent: StudioPendingRoute");
    expect(chatWorkspace).toContain(
      "initialSessionId ? <ChatMessageListSkeleton /> : <ChatPageSkeleton />",
    );
    expect(chatWorkspace).not.toContain("加载中...");
  });
});
