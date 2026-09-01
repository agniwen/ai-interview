/* oxlint-disable unicorn/no-useless-undefined -- Async fakes intentionally match the processor port contract. */
import type { ResumeSemanticIndexJobData } from "@arc/resume-parse-queue/resume-semantic-index";
import { describe, expect, it, vi } from "vitest";
import {
  processResumeParseWorkload,
  processResumeSemanticIndexWorkload,
} from "./resume.processor.js";

describe("resume workload processors", () => {
  it("maps the public retry seam into the migrated bulk workflow", async () => {
    const runBulkUploadWorkflow = vi.fn(async () => undefined);

    await processResumeParseWorkload(
      {
        batchId: "batch-1",
        bypassCache: true,
        itemId: "item-1",
        organizationId: "organization-1",
        userId: "user-1",
      },
      { hasAttemptsRemaining: false },
      { runBulkUploadWorkflow },
    );

    expect(runBulkUploadWorkflow).toHaveBeenCalledWith({
      bypassCache: true,
      itemId: "item-1",
      retryParseFailure: false,
    });
  });

  it("routes job descriptions to the JD indexer without touching resume enrichment", async () => {
    const enrichResume = vi.fn(async (_input: ResumeSemanticIndexJobData) => undefined);
    const indexJobDescription = vi.fn(async () => undefined);

    await processResumeSemanticIndexWorkload(
      {
        organizationId: "organization-1",
        sourceId: "job-1",
        sourceType: "job_description",
      },
      { enrichResume, indexJobDescription },
    );

    expect(indexJobDescription).toHaveBeenCalledWith({
      organizationId: "organization-1",
      sourceId: "job-1",
      sourceType: "job_description",
    });
    expect(enrichResume).not.toHaveBeenCalled();
  });
});
