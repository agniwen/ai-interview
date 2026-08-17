import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseResumeBytesToProfile,
  streamParseResumeProfile,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import type { ResumeParseDependencies } from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";

interface SseEvent {
  label?: string;
  name?: string;
  output?: unknown;
  type: string;
}

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
      return JSON.parse(data) as SseEvent;
    });
}

describe("resume parsing agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.runWorkflow.mockResolvedValue({
      fileHash: "hash-1",
      pageCount: 1,
      structured: STRUCTURED,
      text: "internal raw text",
      textSource: "qwen-ocr",
    });
    mocks.streamWorkflow.mockImplementation((_input, options) => {
      options?.onWorkflowEvent?.({
        label: "OCR 识别简历",
        runId: "workflow-run-1",
        stepId: "extract-resume-text",
        type: "step.started",
      });
      return Promise.resolve({
        fileHash: "hash-1",
        pageCount: 1,
        structured: STRUCTURED,
        text: "internal raw text",
        textSource: "qwen-ocr",
      });
    });
  });

  it("uses the resume parse workflow for byte parsing", async () => {
    const result = await parseResumeBytesToProfile(
      {
        bytes: new Uint8Array([1, 2, 3]),
        fileName: "resume.pdf",
        mediaType: "application/pdf",
      },
      dependencies,
    );

    expect(mocks.runWorkflow).toHaveBeenCalledWith({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: "resume.pdf",
      mediaType: "application/pdf",
    });
    expect(result.resumeProfile.name).toBe("内部候选人");
    expect(result.parsedTextSource).toBe("qwen-ocr");
  });

  it("promotes project tech stacks into the top-level skill set", async () => {
    mocks.runWorkflow.mockResolvedValue({
      fileHash: "hash-1",
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

    const result = await parseResumeBytesToProfile(
      {
        bytes: new Uint8Array([1, 2, 3]),
        fileName: "resume.pdf",
        mediaType: "application/pdf",
      },
      dependencies,
    );

    expect(mocks.runWorkflow).toHaveBeenCalledTimes(1);
    expect(result.resumeProfile.skills).toEqual(["TypeScript", "Vue", "Kubernetes"]);
  });

  it("uses the resume parse workflow for the streaming parse endpoint", async () => {
    mocks.hashBytes.mockResolvedValue("hash-1");
    mocks.findCachedAttachment.mockResolvedValue(null);

    const events = await readStreamEvents(
      streamParseResumeProfile(
        new File([new Uint8Array([1, 2, 3])], "resume.pdf", { type: "application/pdf" }),
        undefined,
        dependencies,
      ),
    );

    expect(mocks.streamWorkflow).toHaveBeenCalledTimes(1);
    expect(mocks.runWorkflow).not.toHaveBeenCalled();
    expect(events.some((event) => event.label === "OCR 识别简历")).toBe(true);
    expect(events.find((event) => event.type === "run.completed")?.output).toMatchObject({
      fileName: "resume.pdf",
      resumeProfile: {
        email: "internal@example.com",
        name: "内部候选人",
      },
      resumeText: "internal raw text",
    });
  });

  it("streams parse progress as AiRunEvent objects", async () => {
    mocks.hashBytes.mockResolvedValue("hash-1");
    mocks.findCachedAttachment.mockResolvedValue(null);

    const events = await readStreamEvents(
      streamParseResumeProfile(
        new File([new Uint8Array([1, 2, 3])], "resume.pdf", { type: "application/pdf" }),
        undefined,
        dependencies,
      ),
    );

    expect(events.some((event) => event.type === "run.started")).toBe(true);
    expect(
      events.some((event) => event.type === "step.started" && event.label === "OCR 识别简历"),
    ).toBe(true);
    expect(events.some((event) => event.type === "run.completed")).toBe(true);
  });

  it("streams workflow events without legacy result or error events", async () => {
    mocks.hashBytes.mockResolvedValue("hash-1");
    mocks.findCachedAttachment.mockResolvedValue(null);

    const events = await readStreamEvents(
      streamParseResumeProfile(
        new File([new Uint8Array([1, 2, 3])], "resume.pdf", { type: "application/pdf" }),
        undefined,
        dependencies,
      ),
    );

    expect(events.some((event) => event.type === "result" || event.type === "error")).toBe(false);
  });

  it("emits OCR page progress and structured preview from workflow progress callbacks when enabled", async () => {
    mocks.hashBytes.mockResolvedValue("hash-1");
    mocks.findCachedAttachment.mockResolvedValue(null);
    mocks.streamWorkflow.mockImplementation((_input, options) => {
      options?.onProgress?.({
        renderedPages: 2,
        totalPages: 2,
        type: "document.pages.ready",
      });
      options?.onProgress?.({
        page: 1,
        totalPages: 2,
        type: "ocr.page.started",
      });
      options?.onProgress?.({
        charCount: 32,
        page: 1,
        textPreview: "候选人 React 前端经验",
        totalPages: 2,
        type: "ocr.page.completed",
      });
      options?.onProgress?.({
        preview: {
          name: "内部候选人",
          schools: [],
          skills: ["TypeScript"],
          targetRoles: ["前端工程师"],
          workYears: null,
        },
        type: "structure.completed",
      });
      return Promise.resolve({
        fileHash: "hash-1",
        pageCount: 2,
        structured: STRUCTURED,
        text: "internal raw text",
        textSource: "qwen-ocr",
      });
    });

    const events = await readStreamEvents(
      streamParseResumeProfile(
        new File([new Uint8Array([1, 2, 3])], "resume.pdf", { type: "application/pdf" }),
        undefined,
        dependencies,
      ),
    );

    expect(mocks.streamWorkflow).toHaveBeenCalledTimes(1);
    expect(mocks.runWorkflow).not.toHaveBeenCalled();
    expect(events).toContainEqual(
      expect.objectContaining({
        detail: {
          kind: "ocr-page",
          page: 1,
          status: "running",
          totalPages: 2,
        },
        label: "正在识别第 1/2 页",
        stepId: "ocr-resume-pages",
        type: "step.progress",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        artifactType: "resume.ocr.page",
        data: {
          charCount: 32,
          page: 1,
          textPreview: "候选人 React 前端经验",
          totalPages: 2,
        },
        stepId: "ocr-resume-pages",
        type: "step.preview",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        artifactType: "resume.profile.preview",
        data: {
          name: "内部候选人",
          schools: [],
          skills: ["TypeScript"],
          targetRoles: ["前端工程师"],
          workYears: null,
        },
        stepId: "structure-resume",
        type: "step.preview",
      }),
    );
    expect(
      events.some(
        (event) =>
          (event.type === "tool-start" || event.type === "tool-end") &&
          (event.name === "OCR 识别简历" || event.name === "提取结构化字段"),
      ),
    ).toBe(false);
  });

  it("emits cached OCR structure-only progress as AiRun events when workflow progress is enabled", async () => {
    mocks.hashBytes.mockResolvedValue("hash-1");
    mocks.findCachedAttachment.mockResolvedValue({
      contentHash: "hash-1",
      createdAt: new Date(0),
      filename: "resume.pdf",
      id: "attachment-1",
      mediaType: "application/pdf",
      organizationId: "org-1",
      parsedAt: new Date(0),
      parsedError: null,
      parsedPageCount: 1,
      parsedStatus: "ready",
      parsedStructured: null,
      parsedText: "cached ocr text",
      size: 3,
      storageKey: "chat-attachments/resume.pdf",
      userId: "user-1",
    });
    mocks.generateStructured.mockResolvedValue(STRUCTURED);

    const events = await readStreamEvents(
      streamParseResumeProfile(
        new File([new Uint8Array([1, 2, 3])], "resume.pdf", { type: "application/pdf" }),
        undefined,
        dependencies,
      ),
    );

    expect(mocks.generateStructured).toHaveBeenCalledWith("cached ocr text");
    expect(events).toContainEqual(
      expect.objectContaining({
        label: "提取结构化字段",
        stepId: "structure-resume",
        type: "step.started",
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        artifactType: "resume.profile.preview",
        stepId: "structure-resume",
        type: "step.preview",
      }),
    );
    expect(
      events.some(
        (event) =>
          (event.type === "tool-start" || event.type === "tool-end") &&
          event.name === "提取结构化字段",
      ),
    ).toBe(false);
  });
});
