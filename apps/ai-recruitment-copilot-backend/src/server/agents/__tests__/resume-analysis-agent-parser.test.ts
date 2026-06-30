import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildAttachmentKeyByHash: vi.fn(),
  createAttachment: vi.fn(),
  findAttachmentByContentHash: vi.fn(),
  generateResumeStructured: vi.fn(),
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
  generateResumeStructured: mocks.generateResumeStructured,
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

async function readStreamEvents(stream: ReadableStream<Uint8Array>) {
  const text = await new Response(stream).text();
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string; [key: string]: unknown });
}

describe("resume parsing agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.parseResumeFast.mockResolvedValue({
      pageCount: 1,
      structured: STRUCTURED,
      text: "internal raw text",
      textSource: "qwen-ocr",
    });
  });

  it("uses the internal resume parser for byte parsing", async () => {
    const result = await parseResumeBytesToProfile({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: "resume.pdf",
      mediaType: "application/pdf",
    });

    expect(mocks.parseResumeFast).toHaveBeenCalledTimes(1);
    expect(result.resumeProfile.name).toBe("内部候选人");
    expect(result.parsedTextSource).toBe("qwen-ocr");
  });

  it("promotes project tech stacks into the top-level skill set", async () => {
    mocks.parseResumeFast.mockResolvedValue({
      pageCount: 1,
      structured: {
        ...STRUCTURED,
        projectExperiences: [
          {
            name: "商家后台",
            period: "2023-2024",
            role: "前端负责人",
            summary: "负责 Vue 前端工程化和 Kubernetes 部署协作",
            techStack: ["Vue", "Kubernetes"],
          },
        ],
        skills: ["TypeScript", "Vue"],
      },
      text: "raw text",
      textSource: "qwen-ocr",
    });

    const result = await parseResumeBytesToProfile({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: "resume.pdf",
      mediaType: "application/pdf",
    });

    expect(result.resumeProfile.skills).toEqual(["TypeScript", "Vue", "Kubernetes"]);
  });

  it("uses the internal resume parser for the streaming parse endpoint", async () => {
    mocks.sha256HexOfBytes.mockResolvedValue("hash-1");
    mocks.findAttachmentByContentHash.mockResolvedValue(null);

    const events = await readStreamEvents(
      streamParseResumeProfile(
        new File([new Uint8Array([1, 2, 3])], "resume.pdf", { type: "application/pdf" }),
      ),
    );

    expect(mocks.parseResumeFast).toHaveBeenCalledTimes(1);
    expect(events.some((event) => event.name === "OCR 识别简历")).toBe(true);
    expect(events.find((event) => event.type === "result")?.data).toMatchObject({
      fileName: "resume.pdf",
      resumeProfile: {
        email: "internal@example.com",
        name: "内部候选人",
      },
      resumeText: "internal raw text",
    });
  });

  it("mirrors legacy parse progress as AiRunEvent objects", async () => {
    mocks.sha256HexOfBytes.mockResolvedValue("hash-1");
    mocks.findAttachmentByContentHash.mockResolvedValue(null);

    const events = await readStreamEvents(
      streamParseResumeProfile(
        new File([new Uint8Array([1, 2, 3])], "resume.pdf", { type: "application/pdf" }),
      ),
    );

    expect(events.some((event) => event.type === "run.started")).toBe(true);
    expect(
      events.some((event) => event.type === "step.started" && event.label === "OCR 识别简历"),
    ).toBe(true);
    expect(events.some((event) => event.type === "run.completed")).toBe(true);
  });
});
