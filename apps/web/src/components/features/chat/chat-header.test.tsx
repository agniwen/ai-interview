import { describe, expect, it } from "vitest";
import { resolveChatHeaderTitle } from "./chat-header";

describe("chat header title", () => {
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
});
