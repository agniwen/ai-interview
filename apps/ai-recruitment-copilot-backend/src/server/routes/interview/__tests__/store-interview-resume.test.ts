// src/server/routes/interview/__tests__/store-interview-resume.test.ts
//
// storeInterviewResume 三个分支的单元测试：注册表命中 / 未命中两步成功 / 未命中 parse 失败 / 未命中 S3 失败。
// Unit tests for the three branches of storeInterviewResume: registry hit / miss both succeed / miss parse fail / miss S3 fail.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ResumeAnalysisError } from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";

const mocks = vi.hoisted(() => ({
  buildAttachmentKeyByHash: vi.fn(),
  createAttachment: vi.fn(),
  findAttachmentByContentHash: vi.fn(),
  generateResumeStructured: vi.fn(),
  parseResumeFastToProfile: vi.fn(),
  presignGetObjectUrl: vi.fn(),
  projectAttachmentToResumeProfile: vi.fn(),
  putObjectBytes: vi.fn(),
  sha256HexOfBytes: vi.fn(),
  updateStructuredByHash: vi.fn(),
}));

vi.mock("@arc/shared/file-hash", () => ({ sha256HexOfBytes: mocks.sha256HexOfBytes }));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/s3", () => ({
  buildAttachmentKeyByHash: mocks.buildAttachmentKeyByHash,
  presignGetObjectUrl: mocks.presignGetObjectUrl,
  putObjectBytes: mocks.putObjectBytes,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat-attachments", () => ({
  createAttachment: mocks.createAttachment,
  findAttachmentByContentHash: mocks.findAttachmentByContentHash,
  updateStructuredByHash: mocks.updateStructuredByHash,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-pipeline", () => ({
  generateResumeStructured: mocks.generateResumeStructured,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent", () => ({
  // ResumeAnalysisError 必须真实存在，因为函数内部 instanceof 它。
  // ResumeAnalysisError must be a real class because the function uses instanceof.
  ResumeAnalysisError: class MockResumeAnalysisError extends Error {
    stage: string;
    constructor(message: string, stage: string) {
      super(message);
      this.name = "MockResumeAnalysisError";
      this.stage = stage;
    }
  },
  parseResumeFastToProfile: mocks.parseResumeFastToProfile,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/agents/resume-parser-agent", () => ({
  projectAttachmentToResumeProfile: mocks.projectAttachmentToResumeProfile,
}));

// db 不会被这条函数路径直接调用（cross-table 查询走的是 chat-attachments
// 的封装），但 utils.ts 顶层 import 用到 — 给个最小 stub。
// db isn't on the function's hot path (the cross-table query goes through the
// chat-attachments wrapper), but utils.ts top-level imports it — minimal stub.
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({ db: {} }));
vi.mock("@arc/db-schema/schema", () => ({
  interviewQuestionTemplate: {},
  interviewer: {},
  jobDescription: {},
  jobDescriptionInterviewer: {},
  studioInterview: {},
  studioInterviewSchedule: {},
}));
vi.mock("@arc/shared/interview/interview-record", () => ({
  buildCandidateInterviewView: vi.fn(),
  buildInterviewLink: vi.fn(),
  pickCurrentScheduleEntry: vi.fn(),
  sortScheduleEntries: vi.fn(),
}));
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/context-snapshots",
  () => ({
    flattenPresetQuestionsFromContextSnapshot: vi.fn(),
    loadActiveInterviewContextSnapshot: vi.fn(),
  }),
);

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting
import {
  resolveResumeUploadStorage,
  storeInterviewResume,
  storeResumeObjectOnly,
  toBadRequest,
} from "@arc/ai-recruitment-copilot-backend/server/routes/interview/utils";

const HASH = "a".repeat(64);
const STORAGE_KEY = "chat-attachments/aaa.pdf";

function makeFile(content = "pdf-bytes") {
  return new File([new TextEncoder().encode(content)], "resume.pdf", {
    type: "application/pdf",
  });
}

describe("toBadRequest", () => {
  it("logs resume analysis failures without exposing their message", () => {
    const error = new ResumeAnalysisError(
      "postgres://user:secret@private-host/database",
      "resume-parsing",
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(toBadRequest(error)).toEqual({
      error: "简历解析失败，请稍后重试。",
      stage: "resume-parsing",
      status: 500,
    });
    expect(consoleError).toHaveBeenCalledWith("[resume-analysis] failed", {
      error,
      stage: "resume-parsing",
    });
  });
});

describe("storeInterviewResume", () => {
  const originalDisableCache = process.env.RESUME_PARSE_DISABLE_CACHE;

  afterAll(() => {
    if (originalDisableCache === undefined) {
      delete process.env.RESUME_PARSE_DISABLE_CACHE;
    } else {
      process.env.RESUME_PARSE_DISABLE_CACHE = originalDisableCache;
    }
  });

  beforeEach(() => {
    for (const fn of Object.values(mocks)) {
      fn.mockReset();
    }
    delete process.env.RESUME_PARSE_DISABLE_CACHE;
    mocks.sha256HexOfBytes.mockResolvedValue(HASH);
    mocks.buildAttachmentKeyByHash.mockResolvedValue(STORAGE_KEY);
    mocks.presignGetObjectUrl.mockResolvedValue(
      "https://storage.example.test/resume.pdf?signature=secret",
    );
  });

  it("registry hit: reuses storageKey + cached profile, no PUT, copies attachment row", async () => {
    mocks.findAttachmentByContentHash.mockResolvedValue({
      parsedStructured: { name: "郭靖" },
      storageKey: STORAGE_KEY,
    });
    mocks.projectAttachmentToResumeProfile.mockReturnValue({ name: "郭靖" } as never);

    const result = await storeInterviewResume("interview-1", makeFile(), "user-1", "org-test");

    expect(result).toEqual({
      cachedResumeProfile: { name: "郭靖" },
      contentHash: HASH,
      resumeText: null,
      storageKey: STORAGE_KEY,
    });
    expect(mocks.putObjectBytes).not.toHaveBeenCalled();
    expect(mocks.parseResumeFastToProfile).not.toHaveBeenCalled();
    expect(mocks.createAttachment).toHaveBeenCalledTimes(1);
    expect(mocks.createAttachment.mock.calls[0]?.[0]).toMatchObject({
      contentHash: HASH,
      parsedStructured: { name: "郭靖" },
      storageKey: STORAGE_KEY,
      userId: "user-1",
    });
  });

  it("cache disabled: ignores registry hit and parses the uploaded PDF", async () => {
    process.env.RESUME_PARSE_DISABLE_CACHE = "true";
    mocks.findAttachmentByContentHash.mockResolvedValue({
      parsedStructured: { name: "缓存候选人" },
      storageKey: "chat-attachments/cached.pdf",
    });
    mocks.projectAttachmentToResumeProfile.mockReturnValue({ name: "缓存候选人" } as never);
    mocks.putObjectBytes.mockResolvedValue(undefined as never);
    mocks.parseResumeFastToProfile.mockResolvedValue({
      parsedPageCount: 1,
      parsedStructured: { name: "新候选人" },
      parsedText: "fresh raw",
      parsedTextSource: "qwen-ocr",
      resumeProfile: { name: "新候选人" } as never,
    });

    const result = await storeInterviewResume("interview-1", makeFile(), "user-1", "org-test");

    expect(result).toEqual({
      cachedResumeProfile: { name: "新候选人" },
      contentHash: HASH,
      resumeText: "fresh raw",
      storageKey: STORAGE_KEY,
    });
    expect(mocks.findAttachmentByContentHash).not.toHaveBeenCalled();
    expect(mocks.projectAttachmentToResumeProfile).not.toHaveBeenCalled();
    expect(mocks.putObjectBytes).toHaveBeenCalledTimes(1);
    expect(mocks.presignGetObjectUrl).toHaveBeenCalledWith(STORAGE_KEY);
    expect(mocks.parseResumeFastToProfile).toHaveBeenCalledWith(expect.any(File), {
      fileUrl: "https://storage.example.test/resume.pdf?signature=secret",
    });
    expect(mocks.createAttachment.mock.calls[0]?.[0]).toMatchObject({
      contentHash: HASH,
      parsedStructured: { name: "新候选人" },
      storageKey: STORAGE_KEY,
      userId: "user-1",
    });
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
      resumeText: "raw",
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

  it("miss + image resume: stores by the image media type extension", async () => {
    mocks.findAttachmentByContentHash.mockResolvedValue(null);
    mocks.putObjectBytes.mockResolvedValue(undefined as never);
    mocks.parseResumeFastToProfile.mockResolvedValue({
      parsedPageCount: 1,
      parsedStructured: { name: "图片候选人" },
      parsedText: "image raw",
      parsedTextSource: "qwen-ocr",
      resumeProfile: { name: "图片候选人" } as never,
    });

    const file = new File([new TextEncoder().encode("image-bytes")], "resume.bin", {
      type: "image/png",
    });

    const result = await storeInterviewResume("interview-image", file, "user-image", "org-test");

    expect(result).toEqual({
      cachedResumeProfile: { name: "图片候选人" },
      contentHash: HASH,
      resumeText: "image raw",
      storageKey: STORAGE_KEY,
    });
    expect(mocks.buildAttachmentKeyByHash).toHaveBeenCalledWith(HASH, "png");
    expect(mocks.putObjectBytes).toHaveBeenCalledWith({
      body: expect.any(Uint8Array),
      contentType: "image/png",
      storageKey: STORAGE_KEY,
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
      resumeText: null,
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

describe("storeResumeObjectOnly", () => {
  const originalDisableCache = process.env.RESUME_PARSE_DISABLE_CACHE;

  beforeEach(() => {
    for (const fn of Object.values(mocks)) {
      fn.mockReset();
    }
    if (originalDisableCache === undefined) {
      delete process.env.RESUME_PARSE_DISABLE_CACHE;
    } else {
      process.env.RESUME_PARSE_DISABLE_CACHE = originalDisableCache;
    }
    mocks.sha256HexOfBytes.mockResolvedValue(HASH);
    mocks.buildAttachmentKeyByHash.mockResolvedValue(STORAGE_KEY);
  });

  it("miss: uploads to S3 and writes a pending attachment without parsing", async () => {
    mocks.findAttachmentByContentHash.mockResolvedValue(null);
    mocks.putObjectBytes.mockResolvedValue(undefined as never);

    const result = await storeResumeObjectOnly(makeFile(), "user-5", "org-test");

    expect(result).toEqual({
      contentHash: HASH,
      storageKey: STORAGE_KEY,
    });
    expect(mocks.putObjectBytes).toHaveBeenCalledTimes(1);
    expect(mocks.parseResumeFastToProfile).not.toHaveBeenCalled();
    expect(mocks.createAttachment).toHaveBeenCalledTimes(1);
    expect(mocks.createAttachment.mock.calls[0]?.[0]).toMatchObject({
      contentHash: HASH,
      parsedStatus: "pending",
      storageKey: STORAGE_KEY,
      userId: "user-5",
    });
  });

  it("cache disabled: does not read existing attachment metadata during object-only upload", async () => {
    process.env.RESUME_PARSE_DISABLE_CACHE = "true";
    mocks.findAttachmentByContentHash.mockResolvedValue({
      filename: "cached.pdf",
      mediaType: "application/pdf",
      parsedStatus: "ready",
      parsedStructured: { name: "缓存候选人" },
      storageKey: "chat-attachments/cached.pdf",
    });
    mocks.putObjectBytes.mockResolvedValue(undefined as never);

    const result = await storeResumeObjectOnly(
      new File([new TextEncoder().encode("image-bytes")], "resume.jpeg", {
        type: "image/jpeg",
      }),
      "user-cache-off",
      "org-test",
    );

    expect(result).toEqual({
      contentHash: HASH,
      storageKey: STORAGE_KEY,
    });
    expect(mocks.findAttachmentByContentHash).not.toHaveBeenCalled();
    expect(mocks.createAttachment.mock.calls[0]?.[0]).toMatchObject({
      contentHash: HASH,
      parsedStatus: "pending",
      storageKey: STORAGE_KEY,
      userId: "user-cache-off",
    });
    expect(mocks.createAttachment.mock.calls[0]?.[0]).not.toHaveProperty("parsedStructured");
    expect(mocks.putObjectBytes).toHaveBeenCalledWith({
      body: expect.any(Uint8Array),
      contentType: "image/jpeg",
      storageKey: STORAGE_KEY,
    });
  });

  it("registry hit: rewrites the object bytes so the queued parser can read S3", async () => {
    mocks.findAttachmentByContentHash.mockResolvedValue({
      filename: "resume.pptx",
      mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      parsedStatus: "pending",
      storageKey: STORAGE_KEY,
    });
    mocks.putObjectBytes.mockResolvedValue(undefined as never);

    const result = await storeResumeObjectOnly(
      new File([new TextEncoder().encode("pptx-bytes")], "resume.pptx", {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
      "user-6",
      "org-test",
    );

    expect(result).toEqual({
      contentHash: HASH,
      storageKey: STORAGE_KEY,
    });
    expect(mocks.putObjectBytes).toHaveBeenCalledWith({
      body: expect.any(Uint8Array),
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      storageKey: STORAGE_KEY,
    });
    expect(mocks.createAttachment).toHaveBeenCalledTimes(1);
    expect(mocks.createAttachment.mock.calls[0]?.[0]).toMatchObject({
      contentHash: HASH,
      storageKey: STORAGE_KEY,
      userId: "user-6",
    });
  });

  it("registry hit: uses a freshly written current-file key instead of a stale cached key", async () => {
    process.env.RESUME_PARSE_DISABLE_CACHE = "false";
    mocks.findAttachmentByContentHash.mockResolvedValue({
      filename: "old-resume.pdf",
      mediaType: "application/pdf",
      parsedStatus: "ready",
      parsedStructured: { name: "缓存候选人" },
      storageKey: "chat-attachments/stale.pdf",
    });
    mocks.buildAttachmentKeyByHash.mockResolvedValue("chat-attachments/fresh.jpeg");
    mocks.putObjectBytes.mockResolvedValue(undefined as never);

    const result = await storeResumeObjectOnly(
      new File([new TextEncoder().encode("image-bytes")], "resume.jpeg", {
        type: "image/jpeg",
      }),
      "user-7",
      "org-test",
    );

    expect(result).toEqual({
      contentHash: HASH,
      storageKey: "chat-attachments/fresh.jpeg",
    });
    expect(mocks.buildAttachmentKeyByHash).toHaveBeenCalledWith(HASH, "jpeg");
    expect(mocks.putObjectBytes).toHaveBeenCalledWith({
      body: expect.any(Uint8Array),
      contentType: "image/jpeg",
      storageKey: "chat-attachments/fresh.jpeg",
    });
    expect(mocks.createAttachment.mock.calls[0]?.[0]).toMatchObject({
      contentHash: HASH,
      parsedStatus: "ready",
      parsedStructured: { name: "缓存候选人" },
      storageKey: "chat-attachments/fresh.jpeg",
      userId: "user-7",
    });
  });
});

describe("resolveResumeUploadStorage", () => {
  it("object-only payload upload: returns resume text from the client payload", async () => {
    const storeObjectOnly = vi.fn().mockResolvedValue({
      contentHash: HASH,
      storageKey: STORAGE_KEY,
    });
    const storeParsedResume = vi.fn();

    const result = await resolveResumeUploadStorage({
      organizationId: "org-test",
      parsedResumePayload: {
        fileName: "resume.pdf",
        interviewQuestions: [],
        resumeProfile: { name: "客户端解析候选人" } as never,
        resumeText: "客户端预解析 OCR 原文",
      },
      resume: makeFile(),
      storeObjectOnly,
      storeParsedResume,
      userId: "user-payload",
    });

    expect(storeObjectOnly).toHaveBeenCalledTimes(1);
    expect(storeParsedResume).not.toHaveBeenCalled();
    expect(result).toEqual({
      cachedResumeProfile: null,
      contentHash: HASH,
      resumeText: "客户端预解析 OCR 原文",
      storageKey: STORAGE_KEY,
    });
  });
});
