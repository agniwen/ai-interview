import { beforeEach, describe, expect, it, vi } from "vitest";
import { transitionCandidateStage } from "./candidate-stage-transition";

// oxlint-disable promise/prefer-await-to-callbacks -- the fake transaction must execute Drizzle's callback.

const mocks = vi.hoisted(() => ({
  getReadinessError: vi.fn(),
  invalidateCaches: vi.fn(),
  loadReadiness: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({
  db: { transaction: mocks.transaction },
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/cache-tags", () => ({
  invalidateStudioInterviewCaches: mocks.invalidateCaches,
}));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/human-interview-rounds",
  () => ({
    getHumanInterviewOfferReadinessError: mocks.getReadinessError,
    loadHumanInterviewRoundReadiness: mocks.loadReadiness,
  }),
);

function createTransaction(existing: {
  closedMeta: null;
  jobDescriptionId: string;
  outcome: "in_pipeline";
  pipelineStage: "human_interview" | "screening";
}) {
  const insertedValues = vi.fn(async (_value: unknown) => {});
  const updatedWhere = vi.fn(async (_value: unknown) => {});
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
      set: vi.fn(() => ({ where: updatedWhere })),
    })),
  };
  return { insertedValues, tx, updatedWhere };
}

describe("transitionCandidateStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authorizes protected target stages before opening the transaction", async () => {
    const authorize = vi.fn().mockResolvedValue(false);

    await expect(
      transitionCandidateStage({
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
      transitionCandidateStage({
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
      transitionCandidateStage({
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
      transitionCandidateStage({
        authorize: vi.fn(),
        candidateId: "candidate-a",
        input: { pipelineStage: "ai_interview" },
        operatorId: "user-a",
        organizationId: "org-a",
        provenance: { kind: "manual" },
      }),
    ).resolves.toEqual({ kind: "ok" });

    const audit = insertedValues.mock.calls[0]?.[0] as { detail?: Record<string, unknown> };
    expect(audit.detail).not.toHaveProperty("source");
    expect(audit.detail).not.toHaveProperty("copilotActionProposalId");
  });
});
