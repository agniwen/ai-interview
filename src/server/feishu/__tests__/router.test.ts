// 中文：router 测试 — 任何 inbound DM 都回复引导文案，bot 不再做对话
// English: router test — any inbound DM gets a static greeter; the bot does not chat
import { describe, expect, it, vi } from "vitest";
import { routeDM } from "../router";

function makeThread(id = "th-1") {
  const postSpy = vi.fn((_arg: unknown) => Promise.resolve());
  const thread = {
    adapter: { fetchMessages: vi.fn(() => Promise.resolve({ messages: [] })) },
    id,
    post: postSpy,
    subscribe: vi.fn(() => Promise.resolve()),
  } as unknown as Parameters<typeof routeDM>[0];
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
    await routeDM(thread, message as never);
    expect(postSpy).toHaveBeenCalledOnce();
    const arg = postSpy.mock.lastCall?.[0] as string;
    expect(arg).toContain("https://interview.chainthink.cn/studio/interviews");
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
    await routeDM(thread, message as never);
    expect(postSpy).toHaveBeenCalledOnce();
    const arg = postSpy.mock.lastCall?.[0] as string;
    expect(arg).toContain("https://interview.chainthink.cn/studio/interviews");
  });
});
