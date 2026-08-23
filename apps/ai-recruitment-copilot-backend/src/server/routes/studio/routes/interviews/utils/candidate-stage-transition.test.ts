import { beforeEach, describe, expect, it, vi } from "vitest";
import { transitionCandidateStage } from "./candidate-stage-transition";
import type { CandidateStageTransitionDependencies } from "./candidate-stage-transition";

type TransactionValueRecord = Readonly<Record<string, string | number | null>>;
type TransactionValue = TransactionValueRecord | string | number | null;
interface AuditDetail {
  copilotActionProposalId?: string;
  source?: string;
}

// oxlint-disable promise/prefer-await-to-callbacks -- the fake transaction must execute Drizzle's callback.

const mocks = {
  getReadinessError: vi.fn(),
  invalidateCaches: vi.fn(),
  loadReadiness: vi.fn(),
  transaction: vi.fn(),
};

const dependencies: CandidateStageTransitionDependencies = mocks;

function transition(command: Parameters<typeof transitionCandidateStage>[0]) {
  return transitionCandidateStage(command, dependencies);
}

function createTransaction(existing: {
  closedMeta: null;
  jobDescriptionId: string;
  outcome: "in_pipeline";
  pipelineStage: "human_interview" | "screening";
}) {
  const insertedValues = vi.fn(async (_value: TransactionValue) => {});
  const updatedWhere = vi.fn(async (_value: TransactionValue) => {});
  const updatedValues = vi.fn((_value: TransactionValue) => ({ where: updatedWhere }));
  const tx = {
    insert: vi.fn(() => ({ values: insertedValues })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          for: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([existing]) })),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: updatedValues,
    })),
  };
  return { insertedValues, tx, updatedValues, updatedWhere };
}

describe("transitionCandidateStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authorizes protected target stages before opening the transaction", async () => {
    const authorize = vi.fn().mockResolvedValue(false);

    await expect(
      transition({
        authorize,
        candidateId: "candidate-a",
        input: { pipelineStage: "offer" },
        operatorId: "user-a",
        organizationId: "org-a",
        provenance: { kind: "manual" },
      }),
    ).resolves.toEqual({ kind: "forbidden" });
    expect(authorize).toHaveBeenCalledWith({ action: "create", resource: "offer" });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.invalidateCaches).not.toHaveBeenCalled();
  });

  it("checks offer readiness inside the locked transaction and records copilot provenance", async () => {
    const { insertedValues, tx, updatedWhere } = createTransaction({
      closedMeta: null,
      jobDescriptionId: "jd-a",
      outcome: "in_pipeline",
      pipelineStage: "human_interview",
    });
    mocks.transaction.mockImplementation(async (callback) => await callback(tx));
    mocks.loadReadiness.mockResolvedValue({
      completedRoundsMissingFeedback: 0,
      pendingRounds: 0,
      totalRounds: 1,
    });
    mocks.getReadinessError.mockReturnValue(null);
    const authorize = vi.fn().mockResolvedValue(true);

    await expect(
      transition({
        authorize,
        candidateId: "candidate-a",
        input: { pipelineStage: "offer" },
        operatorId: "user-a",
        organizationId: "org-a",
        provenance: {
          kind: "workspace_recruiting_copilot",
          proposalId: "proposal-a",
          proposalTitle: "推进到 Offer",
        },
      }),
    ).resolves.toEqual({ kind: "ok" });

    expect(mocks.loadReadiness).toHaveBeenCalledWith("candidate-a", "org-a", tx);
    expect(updatedWhere).toHaveBeenCalledOnce();
    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "candidate_transition",
        detail: expect.objectContaining({
          copilotActionProposalId: "proposal-a",
          copilotActionTitle: "推进到 Offer",
          source: "workspace_recruiting_copilot",
        }),
        interviewRecordId: "candidate-a",
        operatorId: "user-a",
        organizationId: "org-a",
      }),
    );
    expect(mocks.invalidateCaches).toHaveBeenCalledWith("org-a");
  });

  it("keeps no-op transitions free of writes, audit noise, and cache invalidation", async () => {
    const { insertedValues, tx, updatedWhere } = createTransaction({
      closedMeta: null,
      jobDescriptionId: "jd-a",
      outcome: "in_pipeline",
      pipelineStage: "screening",
    });
    mocks.transaction.mockImplementation(async (callback) => await callback(tx));

    await expect(
      transition({
        authorize: vi.fn(),
        candidateId: "candidate-a",
        input: { pipelineStage: "screening" },
        operatorId: "user-a",
        organizationId: "org-a",
        provenance: { kind: "manual" },
      }),
    ).resolves.toEqual({ kind: "noop" });

    expect(updatedWhere).not.toHaveBeenCalled();
    expect(insertedValues).not.toHaveBeenCalled();
    expect(mocks.invalidateCaches).not.toHaveBeenCalled();
  });

  it("keeps manual transition audit detail free of copilot provenance", async () => {
    const { insertedValues, tx } = createTransaction({
      closedMeta: null,
      jobDescriptionId: "jd-a",
      outcome: "in_pipeline",
      pipelineStage: "screening",
    });
    mocks.transaction.mockImplementation(async (callback) => await callback(tx));

    await expect(
      transition({
        authorize: vi.fn(),
        candidateId: "candidate-a",
        input: { pipelineStage: "ai_interview" },
        operatorId: "user-a",
        organizationId: "org-a",
        provenance: { kind: "manual" },
      }),
    ).resolves.toEqual({ kind: "ok" });

    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const audit = insertedValues.mock.calls[0]?.[0] as { detail?: AuditDetail };
    expect(audit.detail).not.toHaveProperty("source");
    expect(audit.detail).not.toHaveProperty("copilotActionProposalId");
  });

  it("atomically saves interviewer reference questions when entering human interview", async () => {
    const { insertedValues, tx, updatedValues } = createTransaction({
      closedMeta: null,
      jobDescriptionId: "jd-a",
      outcome: "in_pipeline",
      pipelineStage: "screening",
    });
    mocks.transaction.mockImplementation(async (callback) => await callback(tx));
    const interviewQuestions = [
      { difficulty: "medium" as const, order: 1, question: "请讲一次关键技术决策。" },
    ];

    await expect(
      transition({
        authorize: vi.fn().mockResolvedValue(true),
        candidateId: "candidate-a",
        input: { interviewQuestions, pipelineStage: "human_interview" },
        operatorId: "user-a",
        organizationId: "org-a",
        provenance: { kind: "manual" },
      }),
    ).resolves.toEqual({ kind: "ok" });

    expect(updatedValues).toHaveBeenCalledWith(
      expect.objectContaining({ interviewQuestions, pipelineStage: "human_interview" }),
    );
    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ interviewerReferenceQuestionCount: 1 }),
      }),
    );
  });
});
