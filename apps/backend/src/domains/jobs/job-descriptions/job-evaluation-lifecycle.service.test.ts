import { describe, expect, it, vi } from "vitest";
import { ApiDatabaseUnitOfWork } from "../../../infrastructure/database/api-database-unit-of-work.js";
import type { CandidateEvaluationCommands } from "../../candidate-lifecycle/public.js";
import { JobEvaluationLifecycleService } from "./job-evaluation-lifecycle.service.js";

describe("JobEvaluationLifecycleService publish transaction", () => {
  it("runs Candidate invalidation and Jobs publication in one database transaction", async () => {
    const failure = new Error("audit insert failed");
    const transaction = {
      insert: vi.fn(() => ({ values: vi.fn().mockRejectedValue(failure) })),
    };
    const selectedRows = [
      [{ evaluationMode: "legacy", lifecycleStatus: "published", prompt: "旧 JD" }],
      [
        {
          blueprintPreview: { schemaVersion: 1 },
          blueprintPreviewHash: "confirmed-hash",
          id: "draft-id",
          prompt: "新 JD",
          structuredConfig: {},
        },
      ],
    ];
    const database = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve(selectedRows.shift())) })),
        })),
      })),
      transaction: vi.fn((work: (value: typeof transaction) => Promise<never>) =>
        work(transaction),
      ),
    };
    // SAFETY: this focused fake supplies every database method reached before the injected failure.
    const unitOfWork = new ApiDatabaseUnitOfWork(database as never);
    const candidateEvaluations: CandidateEvaluationCommands = {
      invalidateInFlightForJob: vi.fn(() =>
        unitOfWork.run(async () => {
          expect(unitOfWork.current()).toBe(transaction);
          return 2;
        }),
      ),
    };
    // SAFETY: publication fails at the audit insert, so the jobs collaborator is not reached.
    const jobs = { get: vi.fn() };
    // SAFETY: the database fake implements the exact fluent reads exercised before the failure.
    const service = new JobEvaluationLifecycleService(
      database as never,
      jobs as never,
      candidateEvaluations,
      unitOfWork,
    );

    await expect(
      service.publishUpgrade("organization-id", "actor-id", "job-id", 3, "confirmed-hash"),
    ).rejects.toBe(failure);

    expect(database.transaction).toHaveBeenCalledOnce();
    expect(candidateEvaluations.invalidateInFlightForJob).toHaveBeenCalledWith(
      "organization-id",
      "job-id",
    );
    expect(jobs.get).not.toHaveBeenCalled();
  });
});
