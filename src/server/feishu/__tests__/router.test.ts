// 中文：router 单元测试 — 涵盖通用回退、/jd 命令、jd-match 分支
// English: router unit tests — covers fallback, /jd command, jd-match branch
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobDescriptionListRecord } from "@/lib/job-descriptions";
import { runResumeScreeningFlow } from "../flows/resume-screening";
import { runJdMatchFlow } from "../flows/jd-match";
import { listJobDescriptionsForHr } from "../_lib/list-job-descriptions";
import { requireBinding } from "../identity/require-binding";
import { clearActiveJd, getActiveJd } from "../session/active-jd";
import { routeDM } from "../router";

vi.mock("../flows/resume-screening", () => ({
  runResumeScreeningFlow: vi.fn(() => Promise.resolve()),
}));
vi.mock("../flows/jd-match", () => ({
  runJdMatchFlow: vi.fn(() => Promise.resolve()),
}));
vi.mock("../_lib/list-job-descriptions", () => ({
  JD_PICKER_LIMIT: 10,
  listJobDescriptionsForHr: vi.fn(),
}));
vi.mock("../identity/require-binding", () => ({
  requireBinding: vi.fn(),
}));
vi.mock("../session/active-jd", () => ({
  clearActiveJd: vi.fn(() => Promise.resolve()),
  getActiveJd: vi.fn(),
  setActiveJd: vi.fn(() => Promise.resolve()),
}));

// 中文：makeThread 返回 { thread, postSpy }，postSpy 保留 vi.fn 类型以访问 .mock
// English: makeThread returns { thread, postSpy } — postSpy keeps vi.fn type for .mock access
function makeThread(id = "th-1") {
  // 中文：显式声明参数类型，避免 TS2493 对空元组的索引报错
  // English: explicit arg type so TS doesn't infer an empty tuple and reject [0] access
  const postSpy = vi.fn((_arg: unknown) => Promise.resolve());
  const thread = {
    adapter: { fetchMessages: vi.fn(() => Promise.resolve({ messages: [] })) },
    id,
    post: postSpy,
    subscribe: vi.fn(() => Promise.resolve()),
  } as unknown as Parameters<typeof routeDM>[0];
  return { postSpy, thread };
}

const fakeJd: JobDescriptionListRecord = {
  createdAt: new Date().toISOString(),
  createdBy: null,
  departmentId: "dept-1",
  departmentName: "Eng",
  description: null,
  id: "jd-1",
  interviewerIds: [],
  interviewers: [],
  name: "FE",
  presetQuestions: [],
  prompt: "",
  updatedAt: new Date().toISOString(),
};

describe("routeDM", () => {
  beforeEach(() => {
    vi.mocked(runResumeScreeningFlow).mockClear();
    vi.mocked(runJdMatchFlow).mockClear();
    vi.mocked(requireBinding).mockResolvedValue({ userId: "u-1" });
    vi.mocked(getActiveJd).mockResolvedValue(null);
    vi.mocked(listJobDescriptionsForHr).mockResolvedValue({ records: [], truncated: false });
    vi.mocked(clearActiveJd).mockClear();
  });

  it("delegates to runResumeScreeningFlow when no active JD and no command", async () => {
    const { thread } = makeThread();
    const message = {
      attachments: [],
      author: { isMe: false, userId: "ou_x" },
      id: "m-1",
      text: "hi",
    };
    await routeDM(thread, message as never);
    expect(runResumeScreeningFlow).toHaveBeenCalledOnce();
  });

  it("/jd posts an OAuth card when sender is unbound", async () => {
    vi.mocked(requireBinding).mockResolvedValueOnce({ unbound: true });
    const { postSpy, thread } = makeThread();
    const message = {
      attachments: [],
      author: { isMe: false, userId: "ou_x" },
      id: "m-c",
      text: "/jd",
    };
    await routeDM(thread, message as never);
    expect(postSpy).toHaveBeenCalledOnce();
    expect(JSON.stringify(postSpy.mock.lastCall?.[0])).toContain("首次使用");
    expect(runResumeScreeningFlow).not.toHaveBeenCalled();
  });

  it("/jd posts the JD list card when bound", async () => {
    vi.mocked(listJobDescriptionsForHr).mockResolvedValueOnce({
      records: [fakeJd],
      truncated: false,
    });
    const { postSpy, thread } = makeThread();
    const message = {
      attachments: [],
      author: { isMe: false, userId: "ou_x" },
      id: "m-c2",
      text: "/jd",
    };
    await routeDM(thread, message as never);
    expect(postSpy).toHaveBeenCalledOnce();
    expect(JSON.stringify(postSpy.mock.lastCall?.[0])).toContain("FE");
  });

  it("/jd clear clears the active JD and confirms", async () => {
    const { postSpy, thread } = makeThread();
    const message = {
      attachments: [],
      author: { isMe: false, userId: "ou_x" },
      id: "m-c3",
      text: "/jd clear",
    };
    await routeDM(thread, message as never);
    expect(clearActiveJd).toHaveBeenCalledWith(thread.id);
    expect(JSON.stringify(postSpy.mock.lastCall?.[0])).toContain("已清除");
  });

  it("dispatches to jd-match when active JD set + message has PDF", async () => {
    vi.mocked(getActiveJd).mockResolvedValueOnce("jd-xyz");
    const { thread } = makeThread();
    const message = {
      attachments: [
        {
          fetchData: () => Promise.resolve(Buffer.from("")),
          mimeType: "application/pdf",
          name: "x.pdf",
          type: "file",
        },
      ],
      author: { isMe: false, userId: "ou_x" },
      id: "m-pdf",
      text: "",
    };
    await routeDM(thread, message as never);
    expect(runJdMatchFlow).toHaveBeenCalledOnce();
    expect(vi.mocked(runJdMatchFlow).mock.lastCall?.at(3)).toBe("jd-xyz");
    expect(runResumeScreeningFlow).not.toHaveBeenCalled();
  });

  it("falls through to resume-screening when active JD set but message has NO PDF", async () => {
    vi.mocked(getActiveJd).mockResolvedValueOnce("jd-xyz");
    const { thread } = makeThread();
    const message = {
      attachments: [],
      author: { isMe: false, userId: "ou_x" },
      id: "m-nopdf",
      text: "hello",
    };
    await routeDM(thread, message as never);
    expect(runJdMatchFlow).not.toHaveBeenCalled();
    expect(runResumeScreeningFlow).toHaveBeenCalledOnce();
  });
});
