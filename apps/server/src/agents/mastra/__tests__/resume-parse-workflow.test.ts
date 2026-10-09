import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumeParseWorkflowDeps } from "../workflows/resume-parse-workflow";
import {
  runResumeParseWorkflow,
  streamResumeParseWorkflow,
} from "../workflows/resume-parse-workflow";

const mocks = {
  generateResumeStructured: vi.fn(),
  parseResumeDocument: vi.fn(),
  sha256HexOfBytes: vi.fn(),
};

const dependencies = {
  hashBytes: mocks.sha256HexOfBytes,
  parseDocument: mocks.parseResumeDocument,
  structureText: mocks.generateResumeStructured,
} satisfies ResumeParseWorkflowDeps;

const STRUCTURED_RESUME = {
  age: null,
  degree: null,
  education: null,
  educationExperiences: [],
  email: "candidate@example.com",
  gender: null,
  graduationYear: null,
  links: [],
  major: null,
  name: "候选人",
  personalStrengths: [],
  phone: null,
  projectExperiences: [],
  schools: ["浙江大学"],
  skills: ["React", "TypeScript"],
  targetRoles: ["前端工程师"],
  timelineSummary: {
    currentStatus: null,
    dateRanges: [],
    estimatedExperienceYears: 5,
    riskSignals: [],
  },
  workExperiences: [],
  workYears: 5,
};

describe("runResumeParseWorkflow", () => {
  const originalProvider = process.env.RESUME_PARSE_PROVIDER;

  beforeEach(() => {
    mocks.generateResumeStructured.mockReset();
    mocks.parseResumeDocument.mockReset();
    mocks.sha256HexOfBytes.mockReset();
    if (originalProvider === undefined) {
      delete process.env.RESUME_PARSE_PROVIDER;
    } else {
      process.env.RESUME_PARSE_PROVIDER = originalProvider;
    }
  });

  it("runs the selected Aliyun parser as one structured document operation", async () => {
    process.env.RESUME_PARSE_PROVIDER = "aliyun-docmining";
    const events: unknown[] = [];
    mocks.sha256HexOfBytes.mockResolvedValue("hash-aliyun");
    mocks.parseResumeDocument.mockResolvedValue({
      pageCount: 2,
      structured: STRUCTURED_RESUME,
      text: JSON.stringify(STRUCTURED_RESUME),
      textSource: "aliyun-docmining",
    });

    const result = await runResumeParseWorkflow(
      {
        bytes: new Uint8Array([1, 2, 3]),
        fileName: "resume.docx",
        mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
      { dependencies, onProgress: (event) => events.push(event) },
    );

    expect(result.textSource).toBe("aliyun-docmining");
    expect(result.structured).toEqual(STRUCTURED_RESUME);
    expect(mocks.parseResumeDocument).toHaveBeenCalledTimes(1);
    expect(mocks.generateResumeStructured).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("forwards OCR progress and emits structure progress when requested", async () => {
    const events: unknown[] = [];
    mocks.sha256HexOfBytes.mockResolvedValue("hash-1");
    mocks.parseResumeDocument.mockImplementation(({ onProgress }) => {
      onProgress?.({
        renderedPages: 1,
        totalPages: 1,
        type: "document.pages.ready",
      });
      return {
        pageCount: 1,
        text: "候选人 React TypeScript",
        textSource: "qwen-ocr",
      };
    });
    mocks.generateResumeStructured.mockResolvedValue(STRUCTURED_RESUME);

    await runResumeParseWorkflow(
      {
        bytes: new Uint8Array([1, 2, 3]),
        fileName: "resume.pdf",
        mediaType: "application/pdf",
      },
      { dependencies, onProgress: (event) => events.push(event) },
    );

    expect(mocks.parseResumeDocument).toHaveBeenCalledWith(
      expect.objectContaining({ onProgress: expect.any(Function) }),
    );
    expect(mocks.generateResumeStructured).toHaveBeenCalledWith("候选人 React TypeScript", {
      fileName: "resume.pdf",
    });
    expect(events).toEqual([
      {
        renderedPages: 1,
        totalPages: 1,
        type: "document.pages.ready",
      },
      { type: "structure.started" },
      {
        preview: {
          name: "候选人",
          schools: ["浙江大学"],
          skills: ["React", "TypeScript"],
          targetRoles: ["前端工程师"],
          workYears: 5,
        },
        type: "structure.completed",
      },
    ]);
  });

  it("streams foreground workflow events while preserving page-level parse progress", async () => {
    const events: { type: string; label?: string; runId?: string; stepId?: string }[] = [];
    const progressEvents: unknown[] = [];
    mocks.sha256HexOfBytes.mockResolvedValue("hash-1");
    mocks.parseResumeDocument.mockImplementation(({ onProgress }) => {
      onProgress?.({
        renderedPages: 1,
        totalPages: 1,
        type: "document.pages.ready",
      });
      return {
        pageCount: 1,
        text: "候选人 React TypeScript",
        textSource: "qwen-ocr",
      };
    });
    mocks.generateResumeStructured.mockResolvedValue(STRUCTURED_RESUME);

    const result = await streamResumeParseWorkflow(
      {
        bytes: new Uint8Array([1, 2, 3]),
        fileName: "resume.pdf",
        mediaType: "application/pdf",
      },
      {
        dependencies,
        onProgress: (event) => progressEvents.push(event),
        onWorkflowEvent: (event) => events.push(event),
      },
    );

    expect(result.preview).toEqual({
      name: "候选人",
      schools: ["浙江大学"],
      skills: ["React", "TypeScript"],
      targetRoles: ["前端工程师"],
      workYears: 5,
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stepId: "hash-resume",
          type: "step.started",
        }),
        expect.objectContaining({
          stepId: "structure-resume",
          type: "step.started",
        }),
        expect.objectContaining({
          stepId: "compose-resume-parse-result",
          type: "step.completed",
        }),
      ]),
    );
    expect(progressEvents).toContainEqual({
      renderedPages: 1,
      totalPages: 1,
      type: "document.pages.ready",
    });
  });
});
