import { describe, expect, it, vi } from "vitest";
import { syncHumanInterviewDocument } from "../sync-human-interview-document";

const job = {
  attemptCount: 1,
  blockId: null,
  deadlineAt: Date.now() + 300_000,
  documentId: "doc-1",
  documentUrl: "https://feishu.cn/docx/doc-1",
  evaluation: {
    detailedAnalysis: "分析",
    evidenceTurnIds: [],
    overallEvaluation: "确认通过",
    professionalSkill: "优",
    rating: "A" as const,
    risks: "风险",
    rolePosition: "执行员工",
    salaryRecommendation: "",
    seniorityPosition: "高级",
    strengths: "优势",
  },
  leaseOwner: "backend-1",
  organizationId: "org-1",
  outcome: "pass" as const,
  providerId: "feishu" as const,
  roundId: "round-1",
  roundLabel: "架构复面",
  snapshotId: "snapshot-1",
  submittedAt: "2026-09-02T03:00:00.000Z",
  submittedBy: "张面试官",
};
function deps() {
  return {
    claim: vi.fn(() => Promise.resolve(job)),
    finish: vi.fn(async () => {}),
    saveBlock: vi.fn(async () => {}),
    updateDocument: vi.fn(async (input: { onBlockCreated: (id: string) => Promise<void> }) => {
      await input.onBlockCreated("block-1");
    }),
  };
}
describe("sync confirmed human interview document", () => {
  it("checkpoints the created block and completes the claimed submitted snapshot", async () => {
    const dependencies = deps();
    await syncHumanInterviewDocument(dependencies);
    expect(dependencies.saveBlock).toHaveBeenCalledWith(job, "block-1");
    expect(dependencies.finish).toHaveBeenCalledWith(job, { error: null, status: "synced" });
    expect(dependencies.updateDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc-1",
        providerId: "feishu",
        snapshotId: "snapshot-1",
      }),
    );
  });
  it("records a retryable sync failure without touching the saved evaluation", async () => {
    const dependencies = deps();
    dependencies.updateDocument.mockRejectedValue(new Error("document access denied"));
    await expect(syncHumanInterviewDocument(dependencies)).resolves.toBe(true);
    expect(dependencies.finish).toHaveBeenCalledWith(job, {
      error: "document access denied",
      status: "failed",
    });
  });
  it("does not write to Feishu while no job has a target document", async () => {
    const dependencies = { ...deps(), claim: vi.fn(() => Promise.resolve(null)) };
    await expect(syncHumanInterviewDocument(dependencies)).resolves.toBe(false);
    expect(dependencies.updateDocument).not.toHaveBeenCalled();
  });
});
