import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamParseResumeProfile } from "@app/server/server/agents/resume-analysis-agent";
import type { ResumeParseDependencies } from "@app/server/server/agents/resume-analysis-agent";

const HASH = "a".repeat(64);

const mocks = {
  findCachedAttachment: vi.fn<ResumeParseDependencies["findCachedAttachment"]>(),
  generateStructured: vi.fn<ResumeParseDependencies["generateStructured"]>(),
  hashBytes: vi.fn<ResumeParseDependencies["hashBytes"]>(),
  runWorkflow: vi.fn<ResumeParseDependencies["runWorkflow"]>(),
  streamWorkflow: vi.fn<ResumeParseDependencies["streamWorkflow"]>(),
  updateCachedStructured: vi.fn<ResumeParseDependencies["updateCachedStructured"]>(),
};

const dependencies: ResumeParseDependencies = mocks;

const STRUCTURED = {
  age: null,
  degree: null,
  education: null,
  educationExperiences: [],
  email: "fresh@example.com",
  gender: null,
  graduationYear: null,
  links: [],
  major: null,
  name: "新候选人",
  personalStrengths: [],
  phone: null,
  projectExperiences: [],
  schools: [],
  skills: ["TypeScript"],
  targetRoles: ["前端工程师"],
  timelineSummary: {
    currentStatus: null,
    dateRanges: [],
    estimatedExperienceYears: null,
    riskSignals: [],
  },
  workExperiences: [],
  workYears: null,
};

function makeFile(content = "pdf-bytes") {
  return new File([new TextEncoder().encode(content)], "resume.pdf", {
    type: "application/pdf",
  });
}

async function readStreamEvents(stream: ReadableStream<Uint8Array>) {
  const text = await new Response(stream).text();
  return text
    .split("\n\n")
    .map((frame) => frame.trim())
    .filter(Boolean)
    .map((frame) => {
      const data = frame
        .split("\n")
        .find((line) => line.startsWith("data: "))
        ?.slice("data: ".length);
      if (!data) {
        throw new Error(`Missing SSE data frame: ${frame}`);
      }
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      return JSON.parse(data) as { type: string; output?: unknown };
    });
}

describe("streamParseResumeProfile cache policy", () => {
  const originalDisableCache = process.env.RESUME_PARSE_DISABLE_CACHE;

  beforeEach(() => {
    vi.clearAllMocks();
    if (originalDisableCache === undefined) {
      delete process.env.RESUME_PARSE_DISABLE_CACHE;
    } else {
      process.env.RESUME_PARSE_DISABLE_CACHE = originalDisableCache;
    }
    mocks.hashBytes.mockResolvedValue(HASH);
  });

  it("cache disabled: ignores cached structured data and runs a fresh parse", async () => {
    process.env.RESUME_PARSE_DISABLE_CACHE = "true";
    mocks.findCachedAttachment.mockResolvedValue({
      contentHash: HASH,
      createdAt: new Date(0),
      filename: "cached.pdf",
      id: "cached-attachment",
      mediaType: "application/pdf",
      organizationId: "organization-1",
      parsedAt: new Date(0),
      parsedError: null,
      parsedPageCount: 1,
      parsedStatus: "ready",
      parsedStructured: { ...STRUCTURED, name: "缓存候选人" },
      parsedText: null,
      parsedTextSource: "qwen-ocr",
      size: 10,
      storageKey: "chat-attachments/cached.pdf",
      userId: "user-1",
    });
    mocks.streamWorkflow.mockResolvedValue({
      bytesBase64: "cGRmLWJ5dGVz",
      fileHash: HASH,
      fileName: "resume.pdf",
      mediaType: "application/pdf",
      pageCount: 1,
      preview: {
        name: STRUCTURED.name,
        schools: STRUCTURED.schools,
        skills: STRUCTURED.skills,
        targetRoles: STRUCTURED.targetRoles,
        workYears: STRUCTURED.workYears,
      },
      structured: STRUCTURED,
      text: "fresh raw text",
      textSource: "qwen-ocr",
    });

    const events = await readStreamEvents(
      streamParseResumeProfile(makeFile(), undefined, dependencies),
    );
    const result = events.find((event) => event.type === "run.completed")?.output;

    expect(mocks.findCachedAttachment).not.toHaveBeenCalled();
    expect(mocks.streamWorkflow).toHaveBeenCalledTimes(1);
    expect(mocks.runWorkflow).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      fileName: "resume.pdf",
      resumeProfile: {
        email: "fresh@example.com",
        name: "新候选人",
        skills: ["TypeScript"],
      },
    });
  });

  it("passes the current filename when structuring cached OCR text", async () => {
    process.env.RESUME_PARSE_DISABLE_CACHE = "false";
    mocks.findCachedAttachment.mockResolvedValue({
      contentHash: HASH,
      createdAt: new Date(0),
      filename: "cached.pdf",
      id: "cached-attachment",
      mediaType: "application/pdf",
      organizationId: "organization-1",
      parsedAt: new Date(0),
      parsedError: null,
      parsedPageCount: 1,
      parsedStatus: "ready",
      parsedStructured: null,
      parsedText: "cached OCR text",
      parsedTextSource: "qwen-ocr",
      size: 10,
      storageKey: "chat-attachments/cached.pdf",
      userId: "user-1",
    });
    mocks.generateStructured.mockResolvedValue(STRUCTURED);

    await readStreamEvents(
      streamParseResumeProfile(
        makeFile(),
        { organizationId: null, userId: "user-1" },
        dependencies,
      ),
    );

    expect(mocks.generateStructured).toHaveBeenCalledWith("cached OCR text", {
      fileName: "resume.pdf",
    });
    expect(mocks.updateCachedStructured).toHaveBeenCalledWith(HASH, STRUCTURED);
    expect(mocks.streamWorkflow).not.toHaveBeenCalled();
  });

  it("regenerates structure when the same bytes are uploaded under a different filename", async () => {
    process.env.RESUME_PARSE_DISABLE_CACHE = "false";
    mocks.findCachedAttachment.mockResolvedValue({
      contentHash: HASH,
      createdAt: new Date(0),
      filename: "张三.pdf",
      id: "cached-attachment",
      mediaType: "application/pdf",
      organizationId: "organization-1",
      parsedAt: new Date(0),
      parsedError: null,
      parsedPageCount: 1,
      parsedStatus: "ready",
      parsedStructured: { ...STRUCTURED, name: "张三", sourceFileName: "张三.pdf" },
      parsedText: "正文未明确姓名",
      parsedTextSource: "qwen-ocr",
      size: 10,
      storageKey: "chat-attachments/cached.pdf",
      userId: "user-1",
    });
    const currentStructured = {
      ...STRUCTURED,
      name: "李四",
      sourceFileName: "resume.pdf",
    };
    mocks.generateStructured.mockResolvedValue(currentStructured);

    const events = await readStreamEvents(
      streamParseResumeProfile(
        makeFile(),
        { organizationId: null, userId: "user-1" },
        dependencies,
      ),
    );
    const result = events.find((event) => event.type === "run.completed")?.output;

    expect(mocks.generateStructured).toHaveBeenCalledWith("正文未明确姓名", {
      fileName: "resume.pdf",
    });
    expect(result).toMatchObject({ resumeProfile: { name: "李四" } });
    expect(mocks.streamWorkflow).not.toHaveBeenCalled();
  });
});
