import { describe, expect, it, vi } from "vitest";
import { runResumeSemanticEnrichmentJob } from "./enrichment";

describe("runResumeSemanticEnrichmentJob", () => {
  it("indexes and stores one duplicate snapshot for a resume library source", async () => {
    const index = vi.fn(() => Promise.resolve());
    const loadSource = vi.fn().mockResolvedValue({
      createdBy: "user-1",
      profile: { name: "候选人" },
      scope: null,
    });
    const findDuplicates = vi.fn().mockResolvedValue([{ id: "existing-1" }]);
    const replaceDuplicateSnapshot = vi.fn(() => Promise.resolve(1));

    await runResumeSemanticEnrichmentJob(
      {
        organizationId: "org-1",
        sourceId: "resume-1",
        sourceType: "studio_interview",
      },
      { findDuplicates, index, loadSource, replaceDuplicateSnapshot },
    );

    expect(index).toHaveBeenCalledOnce();
    expect(findDuplicates).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeSources: [{ sourceId: "resume-1", sourceType: "studio_interview" }],
        sourceTypes: ["studio_interview"],
      }),
    );
    expect(replaceDuplicateSnapshot).toHaveBeenCalledWith({
      matches: [{ id: "existing-1" }],
      organizationId: "org-1",
      sourceId: "resume-1",
      sourceType: "studio_interview",
    });
  });

  it("keeps private-pool duplicate lookup scoped and propagates enrichment failure for retry", async () => {
    const index = vi.fn(() => Promise.resolve());
    const loadSource = vi.fn().mockResolvedValue({
      createdBy: "user-1",
      profile: { name: "候选人" },
      scope: "private",
    });
    const findDuplicates = vi.fn().mockResolvedValue([]);
    const replaceDuplicateSnapshot = vi.fn().mockRejectedValue(new Error("database unavailable"));

    await expect(
      runResumeSemanticEnrichmentJob(
        {
          organizationId: "org-1",
          sourceId: "pool-1",
          sourceType: "resume_pool_item",
        },
        { findDuplicates, index, loadSource, replaceDuplicateSnapshot },
      ),
    ).rejects.toThrow("database unavailable");

    expect(findDuplicates).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeSources: [{ sourceId: "pool-1", sourceType: "resume_pool_item" }],
        poolOwnerUserId: "user-1",
        poolScope: "private",
        sourceTypes: ["studio_interview", "resume_pool_item"],
      }),
    );
  });
});
