// src/server/routes/interview/__tests__/store-interview-resume.test.ts
//
// storeInterviewResume 三个分支的单元测试：注册表命中 / 未命中两步成功 / 未命中 parse 失败 / 未命中 S3 失败。
// Unit tests for the three branches of storeInterviewResume: registry hit / miss both succeed / miss parse fail / miss S3 fail.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ResumeAnalysisError } from "@app/server/server/agents/resume-analysis-agent";
import { toBadRequest } from "@app/server/server/routes/interview/utils";
import {
  createResumeUploadStorage,
  resolveResumeUploadStorage,
} from "@app/server/server/routes/interview/resume-upload-storage";
import type { ResumeUploadStorageDependencies } from "@app/server/server/routes/interview/resume-upload-storage";

const mocks = {
  buildAttachmentKeyByHash: vi.fn<ResumeUploadStorageDependencies["buildAttachmentKeyByHash"]>(),
  createAttachment: vi.fn<ResumeUploadStorageDependencies["createAttachment"]>(),
  findAttachmentByContentHash:
    vi.fn<ResumeUploadStorageDependencies["findAttachmentByContentHash"]>(),
  generateResumeStructured: vi.fn<ResumeUploadStorageDependencies["generateResumeStructured"]>(),
  getResumeDocumentExtension:
    vi.fn<ResumeUploadStorageDependencies["getResumeDocumentExtension"]>(),
  isResumeAnalysisError: vi.fn<ResumeUploadStorageDependencies["isResumeAnalysisError"]>(),
  isResumeParseCacheEnabled: vi.fn<ResumeUploadStorageDependencies["isResumeParseCacheEnabled"]>(),
  isResumeParseCacheSourceCompatible:
    vi.fn<ResumeUploadStorageDependencies["isResumeParseCacheSourceCompatible"]>(),
  parseResumeFastToProfile: vi.fn<ResumeUploadStorageDependencies["parseResumeFastToProfile"]>(),
  projectAttachmentToResumeProfile:
    vi.fn<ResumeUploadStorageDependencies["projectAttachmentToResumeProfile"]>(),
  putObjectBytes: vi.fn<ResumeUploadStorageDependencies["putObjectBytes"]>(),
  sha256HexOfBytes: vi.fn<ResumeUploadStorageDependencies["sha256HexOfBytes"]>(),
  updateStructuredByHash: vi.fn<ResumeUploadStorageDependencies["updateStructuredByHash"]>(),
} satisfies ResumeUploadStorageDependencies;

const storage = createResumeUploadStorage(mocks);
const { storeInterviewResume, storeResumeObjectOnly } = storage;

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
    mocks.getResumeDocumentExtension.mockImplementation(({ mediaType }) => {
      if (mediaType === "image/png") {
        return "png";
      }
      if (mediaType === "image/jpeg") {
        return "jpeg";
      }
      return "pdf";
    });
    mocks.isResumeParseCacheEnabled.mockImplementation(
      () => process.env.RESUME_PARSE_DISABLE_CACHE !== "true",
    );
    mocks.isResumeParseCacheSourceCompatible.mockReturnValue(true);
    mocks.isResumeAnalysisError.mockReturnValue(false);
  });

  it("registry hit: reuses storageKey + cached profile, no PUT, copies attachment row", async () => {
    // SAFETY: This fake row intentionally contains only fields read by the storage boundary.
    mocks.findAttachmentByContentHash.mockResolvedValue({
      // SAFETY: This test supplies only the fields read by the storage boundary.
      parsedStructured: { name: "郭靖", sourceFileName: "resume.pdf" } as never,
      storageKey: STORAGE_KEY,
      // SAFETY: This fake row intentionally contains only fields read by the storage boundary.
    } as never);
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
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
      parsedStructured: { name: "郭靖", sourceFileName: "resume.pdf" },
      storageKey: STORAGE_KEY,
      userId: "user-1",
    });
  });

  it("cache disabled: ignores registry hit and parses the uploaded PDF", async () => {
    process.env.RESUME_PARSE_DISABLE_CACHE = "true";
    // SAFETY: This fake row intentionally contains only fields read by the storage boundary.
    mocks.findAttachmentByContentHash.mockResolvedValue({
      // SAFETY: This test supplies only the fields read by the storage boundary.
      parsedStructured: { name: "缓存候选人" } as never,
      storageKey: "chat-attachments/cached.pdf",
      // SAFETY: This fake row intentionally contains only fields read by the storage boundary.
    } as never);
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    mocks.projectAttachmentToResumeProfile.mockReturnValue({ name: "缓存候选人" } as never);
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    mocks.putObjectBytes.mockResolvedValue(undefined as never);
    mocks.parseResumeFastToProfile.mockResolvedValue({
      parsedPageCount: 1,
      // SAFETY: This test supplies only the fields read by the storage boundary.
      parsedStructured: { name: "新候选人" } as never,
      parsedText: "fresh raw",
      parsedTextSource: "qwen-ocr",
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
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
    expect(mocks.parseResumeFastToProfile).toHaveBeenCalledTimes(1);
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
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    mocks.putObjectBytes.mockResolvedValue(undefined as never);
    mocks.parseResumeFastToProfile.mockResolvedValue({
      parsedPageCount: 2,
      // SAFETY: This test supplies only the fields read by the storage boundary.
      parsedStructured: { name: "李四" } as never,
      parsedText: "raw",
      parsedTextSource: "qwen-ocr",
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
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
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    mocks.putObjectBytes.mockResolvedValue(undefined as never);
    mocks.parseResumeFastToProfile.mockResolvedValue({
      parsedPageCount: 1,
      // SAFETY: This test supplies only the fields read by the storage boundary.
      parsedStructured: { name: "图片候选人" } as never,
      parsedText: "image raw",
      parsedTextSource: "qwen-ocr",
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
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
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
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
      // SAFETY: This test supplies only the fields read by the storage boundary.
      parsedStructured: {} as never,
      parsedText: "",
      parsedTextSource: "qwen-ocr",
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
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
    mocks.getResumeDocumentExtension.mockImplementation(({ mediaType }) => {
      if (mediaType === "image/png") {
        return "png";
      }
      if (mediaType === "image/jpeg") {
        return "jpeg";
      }
      return "pdf";
    });
    mocks.isResumeParseCacheEnabled.mockImplementation(
      () => process.env.RESUME_PARSE_DISABLE_CACHE !== "true",
    );
    mocks.isResumeParseCacheSourceCompatible.mockReturnValue(true);
    mocks.isResumeAnalysisError.mockReturnValue(false);
  });

  it("miss: uploads to S3 and writes a pending attachment without parsing", async () => {
    mocks.findAttachmentByContentHash.mockResolvedValue(null);
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
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
    // SAFETY: This fake row intentionally contains only fields read by the storage boundary.
    mocks.findAttachmentByContentHash.mockResolvedValue({
      filename: "cached.pdf",
      mediaType: "application/pdf",
      parsedStatus: "ready",
      // SAFETY: This test supplies only the fields read by the storage boundary.
      parsedStructured: { name: "缓存候选人" } as never,
      storageKey: "chat-attachments/cached.pdf",
      // SAFETY: This fake row intentionally contains only fields read by the storage boundary.
    } as never);
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
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
    // SAFETY: This fake row intentionally contains only fields read by the storage boundary.
    mocks.findAttachmentByContentHash.mockResolvedValue({
      filename: "resume.pptx",
      mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      parsedStatus: "pending",
      storageKey: STORAGE_KEY,
      // SAFETY: This fake row intentionally contains only fields read by the storage boundary.
    } as never);
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
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

  it("registry hit: does not copy filename-derived structure to a renamed file", async () => {
    process.env.RESUME_PARSE_DISABLE_CACHE = "false";
    // SAFETY: This fake row intentionally contains only fields read by the storage boundary.
    mocks.findAttachmentByContentHash.mockResolvedValue({
      filename: "old-resume.pdf",
      mediaType: "application/pdf",
      parsedStatus: "ready",
      // SAFETY: This test supplies only the fields read by the storage boundary.
      parsedStructured: { name: "缓存候选人", sourceFileName: "old-resume.pdf" } as never,
      storageKey: "chat-attachments/stale.pdf",
      // SAFETY: This fake row intentionally contains only fields read by the storage boundary.
    } as never);
    mocks.buildAttachmentKeyByHash.mockResolvedValue("chat-attachments/fresh.jpeg");
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
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
      parsedStructured: null,
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
        // SAFETY: This test constructs the value with the asserted contract before this boundary.
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
