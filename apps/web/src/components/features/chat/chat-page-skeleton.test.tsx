// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ChatConversationThreadSkeleton,
  ChatMessageListSkeleton,
  ChatPageSkeleton,
} from "./chat-page-skeleton";

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
    expect(html).toContain("size-[120px] rounded-full");
    expect(html).toContain("flex-col items-center gap-4");
  });

  it("matches the existing conversation composition", () => {
    const html = renderToStaticMarkup(<ChatMessageListSkeleton />);
    const container = document.createElement("div");
    container.innerHTML = html;

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="聊天记录加载中"');
    expect(html).toContain("--thread-max-width:48rem");
    expect(html).toContain("overflow-y-auto");
    expect(container.querySelector(".aui-thread-footer")).toBeNull();
    expect(container.querySelector(".aui-composer-root")).toBeNull();
    expect(html).not.toContain("pb-[18vh]");
  });

  it("keeps the composer footprint while the conversation bundle loads", () => {
    const html = renderToStaticMarkup(<ChatConversationThreadSkeleton />);

    expect(html).toContain('aria-label="聊天界面加载中"');
    expect(html).toContain("pt-(--header-height)");
    expect(html).toContain("min-h-[54px]");
    expect(html).toContain("rounded-[28px]");
    expect(html).toContain("max-w-(--thread-max-width)");
  });

  it("covers layout transitions and chat history initialization", () => {
    const agentLayout = readSource("../../../routes/w.$slug.agent.tsx");
    const agentIndex = readSource("../../../routes/w.$slug.agent.index.tsx");
    const agentSession = readSource("../../../routes/w.$slug.agent.$sessionId.tsx");
    const studioLayout = readSource("../../../routes/w.$slug.studio.tsx");
    const chatWorkspace = readSource("chat-workspace.tsx");
    const conversationThread = readSource("recruiting-conversation-thread.tsx");
    const recruitingThread = readSource("../../assistant-ui/recruiting-thread.tsx");

    expect(agentLayout).not.toContain("pendingComponent:");
    expect(agentLayout).not.toContain("AgentPendingRoute");
    expect(agentIndex).toContain("pendingComponent: ChatPageSkeleton");
    expect(agentSession).not.toContain("pendingComponent:");
    expect(studioLayout).not.toContain("RecruitingPageSkeleton");
    expect(studioLayout).not.toContain("pendingComponent:");
    expect(chatWorkspace).toContain("historyLoading={!isHistoryReady}");
    expect(chatWorkspace).toContain("historyLoadingFallback={<ChatMessageSkeletonContent />}");
    expect(chatWorkspace).not.toContain("<ChatMessageListSkeleton />");
    expect(chatWorkspace).not.toContain("加载中...");
    expect(conversationThread).toContain("<RecruitingToolRenderers />");
    expect(conversationThread).toContain("<RecruitingThread");
    expect(conversationThread).toContain("<RecruitingCopilotContextProvider");
    expect(recruitingThread).toContain("<SkeletonReveal");
    expect(recruitingThread).toContain("<ThreadPrimitive.Messages>");
    expect(recruitingThread).toContain("<Composer autoFocus={!historyLoading} />");
  });
});
