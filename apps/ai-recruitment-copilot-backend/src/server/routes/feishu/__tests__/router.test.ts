// 中文：router 测试 — 任何 inbound DM 都回复引导文案，bot 不再做对话
// English: router test — any inbound DM gets a static greeter; the bot does not chat
import { describe, expect, it, vi } from "vitest";
import type { GreeterCard } from "../utils/greeter-card";
import { routeDM, routeGroupMention } from "../utils/router";

function makeThread(id = "th-1") {
  const postSpy = vi.fn((_arg: ReturnType<typeof GreeterCard>) =>
    // SAFETY: The router ignores the adapter's sent-message return value in this test.
    Promise.resolve(undefined as never),
  );
  // SAFETY: This test constructs the value with the asserted contract before this boundary.
  const threadFixture = {
    adapter: { fetchMessages: vi.fn(() => Promise.resolve({ messages: [] })) },
    id,
    post: postSpy,
    subscribe: vi.fn(() => Promise.resolve()),
  };
  // SAFETY: The fixture implements only the methods exercised by these router tests.
  const thread = Object.create(threadFixture) as Parameters<typeof routeDM>[0];
  return { postSpy, thread };
}

describe("routeDM", () => {
  it("posts the greeter text including the Studio URL for any text message", async () => {
    const { postSpy, thread } = makeThread();
    const message = {
      attachments: [],
      author: { isMe: false, userId: "ou_x" },
      id: "m-1",
      text: "hi",
    };
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    await routeDM(thread, message as never);
    expect(postSpy).toHaveBeenCalledOnce();
    const arg = JSON.stringify(postSpy.mock.lastCall?.[0]);
    expect(arg).toContain("applink.feishu.cn/client/web_app/open?appId=cli_a955211781785bd8");
    expect(arg).toContain("AI 面试助手");
  });

  it("posts the same greeter even when the message has a PDF attachment", async () => {
    const { postSpy, thread } = makeThread();
    const message = {
      attachments: [
        {
          fetchData: () => Promise.resolve(Buffer.from("")),
          mimeType: "application/pdf",
          name: "resume.pdf",
          type: "file",
        },
      ],
      author: { isMe: false, userId: "ou_x" },
      id: "m-2",
      text: "",
    };
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    await routeDM(thread, message as never);
    expect(postSpy).toHaveBeenCalledOnce();
    const arg = JSON.stringify(postSpy.mock.lastCall?.[0]);
    expect(arg).toContain("applink.feishu.cn/client/web_app/open?appId=cli_a955211781785bd8");
  });
});

describe("routeGroupMention", () => {
  it("posts the same greeter when @-mentioned in a group", async () => {
    const { postSpy, thread } = makeThread("th-group");
    const message = {
      attachments: [],
      author: { isMe: false, userId: "ou_x" },
      id: "m-mention",
      text: "@bot 你好",
    };
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    await routeGroupMention(thread as never, message as never);
    expect(postSpy).toHaveBeenCalledOnce();
    const arg = JSON.stringify(postSpy.mock.lastCall?.[0]);
    expect(arg).toContain("AI 面试助手");
    expect(arg).toContain("applink.feishu.cn/client/web_app/open?appId=cli_a955211781785bd8");
  });
});
