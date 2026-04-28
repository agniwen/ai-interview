// 中文：jd-match flow 集成测试，runResumeScreening 被 mock 掉以避免调用 LLM
// English: jd-match flow test; runResumeScreening is mocked to avoid LLM calls
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { department, jobDescription } from "@/lib/db/schema";
import { runResumeScreening } from "@/server/routes/resume/screening";
import { runJdMatchFlow } from "../flows/jd-match";

vi.mock("@/server/routes/resume/screening", () => ({
  runResumeScreening: vi.fn(() => ({
    text: Promise.resolve("候选人很匹配；评分 80。"),
  })),
}));

vi.mock("../flows/_shared/extract-report", () => ({
  extractResumeReport: vi.fn(() =>
    Promise.resolve({
      candidateName: "李四",
      followUps: [],
      level: null,
      recommendation: "推荐",
      risks: [],
      score: 80,
      strengths: ["匹配度高"],
      team: null,
    }),
  ),
}));

const DEPT_ID = "test-dept-jdm";
const JD_ID = "test-jd-jdm";

async function seed() {
  await db.insert(department).values({ id: DEPT_ID, name: "Eng" }).onConflictDoNothing();
  await db
    .insert(jobDescription)
    .values({
      departmentId: DEPT_ID,
      id: JD_ID,
      name: "后端工程师",
      prompt: "需要 3 年 Go 经验",
    })
    .onConflictDoNothing();
}

async function cleanup() {
  await db.delete(jobDescription).where(eq(jobDescription.id, JD_ID));
  await db.delete(department).where(eq(department.id, DEPT_ID));
}

function makeThread() {
  return {
    adapter: { fetchMessages: vi.fn(() => Promise.resolve({ messages: [] })) },
    id: "th-jdm",
    post: vi.fn(() => Promise.resolve()),
  } as never;
}

describe("runJdMatchFlow", () => {
  beforeEach(async () => {
    vi.mocked(runResumeScreening).mockClear();
    await cleanup();
    await seed();
  });
  afterAll(cleanup);

  it("loads JD, calls runResumeScreening with jd prompt, posts text + match card", async () => {
    const thread = makeThread();
    const message = {
      attachments: [
        {
          fetchData: () => Promise.resolve(Buffer.from("%PDF-fake")),
          mimeType: "application/pdf",
          name: "resume.pdf",
          type: "file",
        },
      ],
      author: { isMe: false },
      id: "m-1",
      text: "这个候选人怎么样",
    };
    await runJdMatchFlow(thread, message as never, undefined, JD_ID);

    expect(runResumeScreening).toHaveBeenCalledOnce();
    const [[call]] = vi.mocked(runResumeScreening).mock.calls;
    expect(call.jobDescription).toBe("需要 3 年 Go 经验");
    expect(call.enableThinking).toBe(false);

    expect(thread.post).toHaveBeenCalledTimes(2);
    expect(thread.post).toHaveBeenNthCalledWith(1, "候选人很匹配；评分 80。");
    const [, [cardArg]] = thread.post.mock.calls;
    const cardArgStr = JSON.stringify(cardArg);
    expect(cardArgStr).toContain("后端工程师");
    expect(cardArgStr).toContain("李四");
    expect(cardArgStr).toContain("80");
  });

  it("falls back to generic message when JD was deleted", async () => {
    await db.delete(jobDescription).where(eq(jobDescription.id, JD_ID));
    const thread = makeThread();
    const message = {
      attachments: [],
      author: { isMe: false },
      id: "m-2",
      text: "...",
    };
    await runJdMatchFlow(thread, message as never, undefined, JD_ID);
    // No screening called (we abort early to let the user re-activate)
    expect(runResumeScreening).not.toHaveBeenCalled();
    expect(thread.post).toHaveBeenCalledOnce();
    const [[firstArg]] = thread.post.mock.calls;
    const arg = JSON.stringify(firstArg);
    expect(arg).toContain("已失效");
  });
});
