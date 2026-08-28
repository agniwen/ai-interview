import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveChatHeaderTitle } from "./chat-header";

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf-8");
}

describe("chat header title", () => {
  it("keeps the assistant label on a new conversation", () => {
    expect(resolveChatHeaderTitle(null, null)).toBe("简历筛选助手");
  });

  it("shows the matching session title", () => {
    expect(
      resolveChatHeaderTitle("session-1", {
        sessionId: "session-1",
        title: "高级前端工程师候选人筛选",
      }),
    ).toBe("高级前端工程师候选人筛选");
  });

  it("does not flash a stale title while another session loads", () => {
    expect(
      resolveChatHeaderTitle("session-2", {
        sessionId: "session-1",
        title: "旧会话标题",
      }),
    ).toBeNull();
  });

  it("wires the provider and workspace title updates", () => {
    const agentLayout = readSource("../../../routes/w.$slug.agent.tsx");
    const chatWorkspace = readSource("chat-workspace.tsx");

    expect(agentLayout).toContain("<ChatHeaderTitleProvider>");
    expect(chatWorkspace).toContain("getVisibleConversationTitle(conversation)");
    expect(chatWorkspace).toContain("title: normalizedTitle");
  });

  it("lets the shared header gradient cover scrolling chat content like Studio", () => {
    const chatHeader = readSource("chat-header.tsx");
    const chatWorkspace = readSource("chat-workspace.tsx");
    const chatSkeleton = readSource("chat-page-skeleton.tsx");
    const recruitingThread = readSource("../../assistant-ui/recruiting-thread.tsx");

    expect(chatHeader).toContain('className="absolute top-0 left-0"');
    expect(recruitingThread).toContain(
      "aui-thread-viewport min-h-0 flex-1 overflow-x-hidden overflow-y-auto pt-(--header-height) scroll-smooth",
    );
    expect(chatWorkspace).toContain('showConversationThread ? undefined : "pt-(--header-height)"');
    expect(chatSkeleton).toContain("pt-(--header-height)");
  });
});
