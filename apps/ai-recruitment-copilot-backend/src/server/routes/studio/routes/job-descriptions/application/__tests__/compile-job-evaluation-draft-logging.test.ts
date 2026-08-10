import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import type * as MastraModels from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/models";
import type * as EvaluationBlueprintCompiler from "../../utils/evaluation-blueprint-compiler";

const mocks = vi.hoisted(() => ({
  generateEvaluationBlueprintCandidate: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({ db: {} }));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/agents/mastra/models",
  async (importOriginal) => {
    const actual = await importOriginal<typeof MastraModels>();
    return {
      ...actual,
      getMastraModelIdentifier: () => "test-structured-model",
      mastraModels: { ...actual.mastraModels, structuredModel: {} },
    };
  },
);

vi.mock("../../utils/evaluation-blueprint-compiler", async (importOriginal) => {
  const actual = await importOriginal<typeof EvaluationBlueprintCompiler>();
  return {
    ...actual,
    generateEvaluationBlueprintCandidate: mocks.generateEvaluationBlueprintCandidate,
  };
});

// oxlint-disable-next-line import/first -- lifecycle must load after the hoisted dependency mocks.
import { compileJobEvaluationDraft } from "../job-evaluation-lifecycle";

describe("compileJobEvaluationDraft generation errors", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs diagnostic context and preserves the original generation error", async () => {
    const generationError = new Error("sourceText 必须逐字引用 JD 的连续原文");
    mocks.generateEvaluationBlueprintCandidate.mockRejectedValueOnce(generationError);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      compileJobEvaluationDraft({
        description: "岗位描述",
        id: "job-1",
        prompt: "完整岗位要求",
        structuredConfig: createDefaultJobDescriptionStructuredConfig(),
      }),
    ).rejects.toMatchObject({
      cause: generationError,
      code: "JOB_BLUEPRINT_GENERATION_FAILED",
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "[job-evaluation-blueprint] generation failed",
      expect.objectContaining({
        durationMs: expect.any(Number),
        error: generationError,
        jobDescriptionId: "job-1",
        modelId: "test-structured-model",
        promptVersion: expect.any(String),
      }),
    );
  });
});
