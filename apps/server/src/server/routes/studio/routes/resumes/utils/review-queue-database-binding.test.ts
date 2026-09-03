import { describe, expect, it, vi } from "vitest";
import { loadManagedJobDescriptionById } from "@app/resume-processing/review/support/job-descriptions-dao";
import type { ResumeEvaluationSchedulingDependencies } from "./review-queue";
import { enqueueResumeReviewGenerationForRecordBestEffort } from "./review-queue";

interface EmptyQuery extends PromiseLike<never[]> {
  from: () => EmptyQuery;
  limit: () => EmptyQuery;
  where: () => EmptyQuery;
}

const mocks = vi.hoisted(() => {
  const emptyRows = Promise.resolve([]);
  // SAFETY: This fixture implements every Drizzle chain method exercised by the delegated loader below.
  const query = {} as EmptyQuery;
  query.from = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  // oxlint-disable-next-line unicorn/no-thenable -- Drizzle query builders are intentionally awaitable; this fixture faithfully models that contract.
  query.then = emptyRows.then.bind(emptyRows);
  query.where = vi.fn(() => query);
  return {
    database: {
      select: vi.fn(() => query),
    },
  };
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- This facade test must replace the process-wide Server database while preserving the package's real AsyncLocalStorage boundary.
vi.mock("../../../../../../lib/server/db", () => ({ db: mocks.database }));

describe("resume evaluation queue compatibility export", () => {
  it("runs the complete delegated operation inside the Server database scope", async () => {
    const dependencies: ResumeEvaluationSchedulingDependencies = {
      enqueueReviewJobs: vi.fn(),
      isQueueConfigured: vi.fn(() => false),
      loadSchedulingContext: vi.fn(async () => {
        await loadManagedJobDescriptionById("org-1", "missing");
        return null;
      }),
      markQueueFailure: vi.fn(),
      persistQueuedRun: vi.fn(),
    };

    await expect(
      enqueueResumeReviewGenerationForRecordBestEffort(
        {
          jobDescriptionId: "missing",
          organizationId: "org-1",
          resumeRecordId: "resume-1",
          source: "resume_upload",
        },
        dependencies,
      ),
    ).resolves.toMatchObject({ status: "failed" });
  });
});
