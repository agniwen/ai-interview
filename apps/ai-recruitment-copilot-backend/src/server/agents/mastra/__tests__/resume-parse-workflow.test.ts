import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  extractResumeDocumentText: vi.fn(),
  generateResumeStructured: vi.fn(),
  sha256HexOfBytes: vi.fn(),
}));

vi.mock("@arc/shared/file-hash", () => ({
  sha256HexOfBytes: mocks.sha256HexOfBytes,
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-parse-pipeline", () => ({
  extractResumeDocumentText: mocks.extractResumeDocumentText,
  generateResumeStructured: mocks.generateResumeStructured,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() for correct hoisting
import {
  runResumeParseWorkflow,
  streamResumeParseWorkflow,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/workflows/resume-parse-workflow";

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
  beforeEach(() => {
    mocks.extractResumeDocumentText.mockReset();
    mocks.generateResumeStructured.mockReset();
    mocks.sha256HexOfBytes.mockReset();
  });

  it("forwards OCR progress and emits structure progress when requested", async () => {
    const events: unknown[] = [];
    mocks.sha256HexOfBytes.mockResolvedValue("hash-1");
    mocks.extractResumeDocumentText.mockImplementation(({ onProgress }) => {
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
      { onProgress: (event) => events.push(event) },
    );

    expect(mocks.extractResumeDocumentText).toHaveBeenCalledWith(
      expect.objectContaining({ onProgress: expect.any(Function) }),
    );
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
    const events: { type: string; [key: string]: unknown }[] = [];
    const progressEvents: unknown[] = [];
    mocks.sha256HexOfBytes.mockResolvedValue("hash-1");
    mocks.extractResumeDocumentText.mockImplementation(({ onProgress }) => {
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
