import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildAttachmentKeyByHash: vi.fn(),
  createAttachment: vi.fn(),
  findAttachmentByContentHash: vi.fn(),
  parseResumeFast: vi.fn(),
  putObjectBytes: vi.fn(),
  sha256HexOfBytes: vi.fn(),
  updateStructuredByHash: vi.fn(),
}));

vi.mock("@arc/shared/file-hash", () => ({ sha256HexOfBytes: mocks.sha256HexOfBytes }));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/s3", () => ({
  buildAttachmentKeyByHash: mocks.buildAttachmentKeyByHash,
  putObjectBytes: mocks.putObjectBytes,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-pipeline", () => ({
  generateResumeStructured: vi.fn(),
  parseResumeFast: mocks.parseResumeFast,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat-attachments", () => ({
  createAttachment: mocks.createAttachment,
  findAttachmentByContentHash: mocks.findAttachmentByContentHash,
  updateStructuredByHash: mocks.updateStructuredByHash,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting
import {
  parseResumeBytesToProfile,
  streamParseResumeProfile,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";

const STRUCTURED = {
  age: null,
  degree: null,
  education: null,
  email: "internal@example.com",
  gender: null,
  graduationYear: null,
  links: [],
  major: null,
  name: "内部候选人",
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

function mockExternalFetch() {
  const fetchMock = vi.fn(() =>
    Response.json(
      {
        fileName: "resume.pdf",
        hashVerified: true,
        parsedResult: {
          resumeProfile: {
            email: "external@example.com",
            name: "外部候选人",
            projectExperiences: [
              {
                description: "负责核心模块",
                name: "招聘系统",
                period: "2024.01-2024.06",
                role: "负责人",
                technologies: "React, TypeScript",
              },
            ],
            skills: ["React"],
            targetRoles: ["前端开发"],
            workExperiences: [
              {
                company: "外部公司",
                description: "负责前端开发",
                period: "2023.01-2024.01",
                position: "前端工程师",
              },
            ],
          },
        },
        traceId: "trace-1",
      },
      { status: 200 },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function readStreamEvents(stream: ReadableStream<Uint8Array>) {
  const text = await new Response(stream).text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string; data?: unknown; name?: string });
}

describe("parseResumeBytesToProfile external parser switch", () => {
  const originalApiKey = process.env.RESUME_VERIFY_PARSE_API_KEY;
  const originalBaseUrl = process.env.RESUME_VERIFY_PARSE_BASE_URL;

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    if (originalApiKey === undefined) {
      delete process.env.RESUME_VERIFY_PARSE_API_KEY;
    } else {
      process.env.RESUME_VERIFY_PARSE_API_KEY = originalApiKey;
    }
    if (originalBaseUrl === undefined) {
      delete process.env.RESUME_VERIFY_PARSE_BASE_URL;
    } else {
      process.env.RESUME_VERIFY_PARSE_BASE_URL = originalBaseUrl;
    }
    mocks.parseResumeFast.mockResolvedValue({
      pageCount: 1,
      structured: STRUCTURED,
      text: "internal raw text",
      textSource: "qwen-ocr",
    });
  });

  it("uses the existing internal parser when the external API key is not configured", async () => {
    delete process.env.RESUME_VERIFY_PARSE_API_KEY;

    const result = await parseResumeBytesToProfile({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: "resume.pdf",
      mediaType: "application/pdf",
    });

    expect(mocks.parseResumeFast).toHaveBeenCalledTimes(1);
    expect(result.resumeProfile.name).toBe("内部候选人");
    expect(result.parsedTextSource).toBe("qwen-ocr");
  });

  it("uses the external parser when the external API key is configured", async () => {
    process.env.RESUME_VERIFY_PARSE_API_KEY = "external-key";
    process.env.RESUME_VERIFY_PARSE_BASE_URL = "https://parser.example.test";
    const fetchMock = mockExternalFetch();

    const result = await parseResumeBytesToProfile({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: "resume.pdf",
      mediaType: "application/pdf",
    });

    expect(mocks.parseResumeFast).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://parser.example.test/api/resume/verify-parse",
      expect.objectContaining({
        headers: { "X-Api-Key": "external-key" },
        method: "POST",
      }),
    );
    expect(result.resumeProfile).toMatchObject({
      email: "external@example.com",
      name: "外部候选人",
      skills: ["React"],
      targetRoles: ["前端开发"],
    });
    expect(result.parsedStructured.projectExperiences[0]).toMatchObject({
      name: "招聘系统",
      techStack: ["React", "TypeScript"],
    });
    expect(result.parsedText).toContain("外部候选人");
    expect(result.parsedTextSource).toBe("external-verify-parse");
    expect(console.info).toHaveBeenCalledWith(
      "[external-resume-verify-parser] parsed result",
      expect.objectContaining({
        fileName: "resume.pdf",
        structured: expect.objectContaining({ name: "外部候选人" }),
        traceId: "trace-1",
      }),
    );
  });

  it("uses the external parser for the streaming parse endpoint when configured", async () => {
    process.env.RESUME_VERIFY_PARSE_API_KEY = "external-key";
    process.env.RESUME_VERIFY_PARSE_BASE_URL = "https://parser.example.test";
    const fetchMock = mockExternalFetch();

    const events = await readStreamEvents(
      streamParseResumeProfile(
        new File([new Uint8Array([1, 2, 3])], "resume.pdf", { type: "application/pdf" }),
      ),
    );

    expect(mocks.parseResumeFast).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events.some((event) => event.name === "备用解析简历")).toBe(true);
    expect(events.find((event) => event.type === "result")?.data).toMatchObject({
      fileName: "resume.pdf",
      resumeProfile: {
        email: "external@example.com",
        name: "外部候选人",
      },
    });
  });
});
