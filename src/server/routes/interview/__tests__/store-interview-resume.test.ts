// src/server/routes/interview/__tests__/store-interview-resume.test.ts
//
// storeInterviewResume 三个分支的单元测试：注册表命中 / 未命中两步成功 / 未命中 parse 失败 / 未命中 S3 失败。
// Unit tests for the three branches of storeInterviewResume: registry hit / miss both succeed / miss parse fail / miss S3 fail.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildAttachmentKeyByHash: vi.fn(),
  createAttachment: vi.fn(),
  findAttachmentByContentHash: vi.fn(),
  parseResumeFastToProfile: vi.fn(),
  projectAttachmentToResumeProfile: vi.fn(),
  putObjectBytes: vi.fn(),
  sha256HexOfBytes: vi.fn(),
}));

vi.mock("@/lib/shared/file-hash", () => ({ sha256HexOfBytes: mocks.sha256HexOfBytes }));
vi.mock("@/lib/server/s3", () => ({
  buildAttachmentKeyByHash: mocks.buildAttachmentKeyByHash,
  putObjectBytes: mocks.putObjectBytes,
}));
vi.mock("@/server/routes/chat/dao/chat-attachments", () => ({
  createAttachment: mocks.createAttachment,
  findAttachmentByContentHash: mocks.findAttachmentByContentHash,
}));
vi.mock("@/server/agents/resume-analysis-agent", () => ({
  // ResumeAnalysisError 必须真实存在，因为函数内部 instanceof 它。
  // ResumeAnalysisError must be a real class because the function uses instanceof.
  ResumeAnalysisError: class ResumeAnalysisError extends Error {
    stage: string;
    constructor(message: string, stage: string) {
      super(message);
      this.name = "ResumeAnalysisError";
      this.stage = stage;
    }
  },
  parseResumeFastToProfile: mocks.parseResumeFastToProfile,
}));
vi.mock("@/server/agents/resume-parser-agent", () => ({
  projectAttachmentToResumeProfile: mocks.projectAttachmentToResumeProfile,
}));

// db 不会被这条函数路径直接调用（cross-table 查询走的是 chat-attachments
// 的封装），但 utils.ts 顶层 import 用到 — 给个最小 stub。
// db isn't on the function's hot path (the cross-table query goes through the
// chat-attachments wrapper), but utils.ts top-level imports it — minimal stub.
vi.mock("@/lib/server/db", () => ({ db: {} }));
vi.mock("@/lib/shared/db/schema", () => ({
  interviewer: {},
  jobDescription: {},
  jobDescriptionInterviewer: {},
  studioInterview: {},
  studioInterviewSchedule: {},
}));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/lib/shared/interview/interview-record", () => ({
  buildCandidateInterviewView: vi.fn(),
  buildInterviewLink: vi.fn(),
  pickCurrentScheduleEntry: vi.fn(),
  sortScheduleEntries: vi.fn(),
}));
vi.mock("@/server/routes/studio/routes/interview-questions/dao", () => ({
  ensureApplicableBindings: vi.fn(),
  loadInterviewPresetQuestions: vi.fn(),
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting
import { storeInterviewResume } from "@/server/routes/interview/utils";

const HASH = "a".repeat(64);
const STORAGE_KEY = "chat-attachments/aaa.pdf";

function makeFile(content = "pdf-bytes") {
  return new File([new TextEncoder().encode(content)], "resume.pdf", {
    type: "application/pdf",
  });
}

describe("storeInterviewResume", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) {
      fn.mockReset();
    }
    mocks.sha256HexOfBytes.mockResolvedValue(HASH);
    mocks.buildAttachmentKeyByHash.mockResolvedValue(STORAGE_KEY);
  });

  it("registry hit: reuses storageKey + cached profile, no PUT, no createAttachment", async () => {
    mocks.findAttachmentByContentHash.mockResolvedValue({
      parsedStructured: { name: "张三" },
      storageKey: STORAGE_KEY,
    });
    mocks.projectAttachmentToResumeProfile.mockReturnValue({ name: "张三" } as never);

    const result = await storeInterviewResume("interview-1", makeFile(), "user-1", "org-test");

    expect(result).toEqual({
      cachedResumeProfile: { name: "张三" },
      contentHash: HASH,
      storageKey: STORAGE_KEY,
    });
    expect(mocks.putObjectBytes).not.toHaveBeenCalled();
    expect(mocks.parseResumeFastToProfile).not.toHaveBeenCalled();
    expect(mocks.createAttachment).not.toHaveBeenCalled();
  });

  it("miss + both succeed: PUT + parse + createAttachment, returns fresh profile", async () => {
    mocks.findAttachmentByContentHash.mockResolvedValue(null);
    // putObjectBytes resolves void — pass undefined to satisfy the typed mock.
    // putObjectBytes 解析 void 类型，传入 undefined 以满足类型约束。
    mocks.putObjectBytes.mockResolvedValue(undefined as never);
    mocks.parseResumeFastToProfile.mockResolvedValue({
      parsedPageCount: 2,
      parsedStructured: { name: "李四" },
      parsedText: "raw",
      parsedTextSource: "qwen-ocr",
      resumeProfile: { name: "李四" } as never,
    });

    const result = await storeInterviewResume("interview-2", makeFile(), "user-2", "org-test");

    expect(result).toEqual({
      cachedResumeProfile: { name: "李四" },
      contentHash: HASH,
      storageKey: STORAGE_KEY,
    });
    expect(mocks.putObjectBytes).toHaveBeenCalledTimes(1);
    expect(mocks.parseResumeFastToProfile).toHaveBeenCalledTimes(1);
    expect(mocks.createAttachment).toHaveBeenCalledTimes(1);
    expect(mocks.createAttachment.mock.calls[0]?.[0]).toMatchObject({
      contentHash: HASH,
      parsedStatus: "ready",
      parsedStructured: { name: "李四" },
      storageKey: STORAGE_KEY,
      userId: "user-2",
    });
  });

  it("miss + parse fails: PUT succeeds, no createAttachment, profile is null", async () => {
    mocks.findAttachmentByContentHash.mockResolvedValue(null);
    mocks.putObjectBytes.mockResolvedValue(undefined as never);
    mocks.parseResumeFastToProfile.mockRejectedValue(new Error("OCR boom"));

    const result = await storeInterviewResume("interview-3", makeFile(), "user-3", "org-test");

    expect(result).toEqual({
      cachedResumeProfile: null,
      contentHash: HASH,
      storageKey: STORAGE_KEY,
    });
    expect(mocks.putObjectBytes).toHaveBeenCalledTimes(1);
    expect(mocks.createAttachment).not.toHaveBeenCalled();
  });

  it("miss + S3 fails: returns null, no createAttachment", async () => {
    mocks.findAttachmentByContentHash.mockResolvedValue(null);
    mocks.putObjectBytes.mockRejectedValue(new Error("S3 boom"));
    mocks.parseResumeFastToProfile.mockResolvedValue({
      parsedPageCount: 1,
      parsedStructured: {},
      parsedText: "",
      parsedTextSource: "qwen-ocr",
      resumeProfile: {} as never,
    });

    const result = await storeInterviewResume("interview-4", makeFile(), "user-4", "org-test");

    expect(result).toBeNull();
    expect(mocks.createAttachment).not.toHaveBeenCalled();
  });
});
