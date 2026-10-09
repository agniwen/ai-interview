import { describe, expect, it, vi } from "vitest";
import { ensureAiHrEvaluationInDocument } from "../feishu-interview-document";

const document = {
  documentId: "doc-1",
  providerId: "feishu-jiguang-hr" as const,
};
const hrEvaluation = {
  availability: null,
  careerProgression: null,
  compensationExpectations: null,
  jobMotivation: "希望拓展业务",
  overseasTravel: null,
  projectHighlights: null,
  recentWork: null,
};

describe("ensureAiHrEvaluationInDocument", () => {
  it("updates the HR section when a human interview created the document first", async () => {
    const loadHrEvaluation = vi.fn().mockResolvedValue(hrEvaluation);
    const replaceHrEvaluation = vi.fn(async () => {});
    const ensureDocument = vi.fn().mockResolvedValue(document);
    const build = vi.fn().mockResolvedValue({ title: "new document" });

    const result = await ensureAiHrEvaluationInDocument({
      build,
      candidateName: "候选人",
      ensureDocument,
      loadHrEvaluation,
      replaceHrEvaluation,
    });

    expect(result).toBe(document);
    expect(build).not.toHaveBeenCalled();
    expect(loadHrEvaluation).toHaveBeenCalledOnce();
    expect(replaceHrEvaluation).toHaveBeenCalledWith(
      document.providerId,
      expect.objectContaining({
        block: expect.objectContaining({
          children: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                elements: [
                  expect.objectContaining({
                    text_run: expect.objectContaining({ content: "希望拓展业务" }),
                  }),
                ],
              }),
            }),
          ]),
        }),
        documentId: document.documentId,
      }),
    );
  });

  it("includes HR answers during new document creation without a second write", async () => {
    const loadHrEvaluation = vi.fn().mockResolvedValue(hrEvaluation);
    const replaceHrEvaluation = vi.fn();
    const build = vi.fn().mockResolvedValue({ title: "new document" });
    const ensureDocument = vi.fn(async (initialize: () => Promise<{ title: string }>) => {
      const initialization = await initialize();
      expect(initialization).toEqual({ title: "new document" });
      return document;
    });

    await ensureAiHrEvaluationInDocument({
      build,
      candidateName: "候选人",
      ensureDocument,
      loadHrEvaluation,
      replaceHrEvaluation,
    });

    expect(build).toHaveBeenCalledWith(hrEvaluation);
    expect(loadHrEvaluation).toHaveBeenCalledOnce();
    expect(replaceHrEvaluation).not.toHaveBeenCalled();
  });

  it("keeps the operation retryable when the existing document update fails", async () => {
    const replaceHrEvaluation = vi.fn().mockRejectedValue(new Error("document update failed"));

    await expect(
      ensureAiHrEvaluationInDocument({
        build: vi.fn(),
        candidateName: "候选人",
        ensureDocument: vi.fn().mockResolvedValue(document),
        loadHrEvaluation: vi.fn().mockResolvedValue(hrEvaluation),
        replaceHrEvaluation,
      }),
    ).rejects.toThrow("document update failed");
  });

  it("preserves existing HR answers when the AI result has no answers", async () => {
    const replaceHrEvaluation = vi.fn();

    await ensureAiHrEvaluationInDocument({
      build: vi.fn(),
      candidateName: "候选人",
      ensureDocument: vi.fn().mockResolvedValue(document),
      loadHrEvaluation: vi.fn().mockResolvedValue({ ...hrEvaluation, jobMotivation: null }),
      replaceHrEvaluation,
    });

    expect(replaceHrEvaluation).not.toHaveBeenCalled();
  });
});
