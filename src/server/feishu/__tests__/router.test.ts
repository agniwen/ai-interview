// 中文：router 默认行为：DM 走 resume-screening flow（无激活 JD 时）
// English: router default — DM with no active JD falls through to resume-screening
import { describe, expect, it, vi } from "vitest";
import { runResumeScreeningFlow } from "../flows/resume-screening";
import { routeDM } from "../router";

vi.mock("../flows/resume-screening", () => ({
  runResumeScreeningFlow: vi.fn(() => Promise.resolve()),
}));

const mockedFlow = vi.mocked(runResumeScreeningFlow);

function makeThread(id = "th-1") {
  return {
    adapter: { fetchMessages: vi.fn(() => Promise.resolve({ messages: [] })) },
    id,
    post: vi.fn(() => Promise.resolve()),
    subscribe: vi.fn(() => Promise.resolve()),
  } as unknown as Parameters<typeof routeDM>[0];
}

describe("routeDM", () => {
  it("delegates to runResumeScreeningFlow when no active JD", async () => {
    mockedFlow.mockClear();
    const thread = makeThread();
    const message = { attachments: [], author: { isMe: false }, id: "m-1", text: "hi" };
    await routeDM(thread, message as never);
    expect(mockedFlow).toHaveBeenCalledOnce();
  });
});
