import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildAttachmentKeyByHash: vi.fn(),
  createAttachment: vi.fn(),
  findAttachmentByContentHash: vi.fn(),
  generateResumeStructured: vi.fn(),
  parseResumeFast: vi.fn(),
  putObjectBytes: vi.fn(),
  runResumeParseWorkflow: vi.fn(),
  sha256HexOfBytes: vi.fn(),
  streamResumeParseWorkflow: vi.fn(),
  updateStructuredByHash: vi.fn(),
}));

vi.mock("@arc/shared/file-hash", () => ({ sha256HexOfBytes: mocks.sha256HexOfBytes }));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/s3", () => ({
  buildAttachmentKeyByHash: mocks.buildAttachmentKeyByHash,
  putObjectBytes: mocks.putObjectBytes,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-pipeline", () => ({
  generateResumeStructured: mocks.generateResumeStructured,
  parseResumeFast: mocks.parseResumeFast,
}));
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/agents/mastra/workflows/resume-parse-workflow",
  () => ({
    runResumeParseWorkflow: mocks.runResumeParseWorkflow,
    streamResumeParseWorkflow: mocks.streamResumeParseWorkflow,
  }),
);
vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat-attachments", () => ({
  createAttachment: mocks.createAttachment,
  findAttachmentByContentHash: mocks.findAttachmentByContentHash,
  updateStructuredByHash: mocks.updateStructuredByHash,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting
import { streamParseResumeProfile } from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";

const HASH = "a".repeat(64);

const STRUCTURED = {
  age: null,
  degree: null,
  education: null,
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
      return JSON.parse(data) as { type: string; output?: unknown };
    });
}

describe("streamParseResumeProfile cache policy", () => {
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
  });

  it("cache disabled: ignores cached structured data and runs a fresh parse", async () => {
    process.env.RESUME_PARSE_DISABLE_CACHE = "true";
    mocks.findAttachmentByContentHash.mockResolvedValue({
      parsedStructured: { ...STRUCTURED, name: "缓存候选人" },
      storageKey: "chat-attachments/cached.pdf",
    });
    mocks.streamResumeParseWorkflow.mockResolvedValue({
      fileHash: HASH,
      pageCount: 1,
      structured: STRUCTURED,
      text: "fresh raw text",
      textSource: "qwen-ocr",
    });

    const events = await readStreamEvents(streamParseResumeProfile(makeFile()));
    const result = events.find((event) => event.type === "run.completed")?.output;

    expect(mocks.findAttachmentByContentHash).not.toHaveBeenCalled();
    expect(mocks.streamResumeParseWorkflow).toHaveBeenCalledTimes(1);
    expect(mocks.runResumeParseWorkflow).not.toHaveBeenCalled();
    expect(mocks.parseResumeFast).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      fileName: "resume.pdf",
      resumeProfile: {
        email: "fresh@example.com",
        name: "新候选人",
        skills: ["TypeScript"],
      },
    });
  });
});
