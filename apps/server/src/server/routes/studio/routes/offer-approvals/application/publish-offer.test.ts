import { describe, expect, it, vi } from "vitest";
import { defaultPublishOfferDependencies, publishOfferTx } from "./publish-offer";
import type { PublishOfferDependencies } from "./publish-offer";

function createDependencies(approvalRequired: boolean): PublishOfferDependencies {
  return {
    ...defaultPublishOfferDependencies,
    approvalMember: vi.fn().mockResolvedValue({ role: "admin", statements: [] }),
    assertCurrentDraft: vi.fn(),
    assertOfferDates: vi.fn(),
    getOfferApprovalPolicy: vi.fn().mockResolvedValue({ approvalRequired }),
    hasPermissionInStatements: vi.fn(() => true),
    hashRequest: vi.fn(() => "snapshot-hash"),
    loadOfferSnapshot: vi.fn().mockResolvedValue({
      baseSalary: 40_000,
      position: "工程师",
    }),
    recordIsVisible: vi.fn().mockResolvedValue(true),
    updateRecruitingNodeTx: vi.fn(),
  };
}

describe("publishOfferTx", () => {
  const offer = {
    contentRevision: 1,
    currentApprovalId: null,
    id: "offer-1",
    publicToken: null,
    publishedAt: null,
    status: "draft",
  };
  const record = {
    id: "record-1",
    offerApprovalRequiredAt: null,
    organizationId: "org-1",
  };

  it("rejects an unapproved draft when an approval template is enabled", async () => {
    const dependencies: PublishOfferDependencies = {
      ...createDependencies(true),
    };
    const tx = {};

    await expect(
      publishOfferTx(
        // SAFETY: This branch rejects before it executes a transaction query.
        tx as never,
        // SAFETY: The test supplies every recruiting record field read before rejection.
        record as never,
        // SAFETY: The test supplies every Offer field read before rejection.
        offer as never,
        "user-1",
        dependencies,
      ),
    ).rejects.toThrow("审批");
  });

  it("publishes directly when no approval template is enabled", async () => {
    const published = { ...offer, publishedAt: new Date(), status: "sent" };
    const insertValues = vi.fn();
    const updateSet = vi.fn(() => ({
      where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([published]) })),
    }));
    const tx = {
      insert: vi.fn(() => ({ values: insertValues })),
      update: vi.fn(() => ({ set: updateSet })),
    };

    const dependencies = createDependencies(false);
    dependencies.assertOfferDates = defaultPublishOfferDependencies.assertOfferDates;
    dependencies.loadOfferSnapshot = vi.fn().mockResolvedValue({
      baseSalary: 40_000,
      expiresAt: null,
      joiningDate: null,
      position: "工程师",
    });

    const result = await publishOfferTx(
      // SAFETY: This in-memory transaction implements the update and insert operations on this branch.
      tx as never,
      // SAFETY: The test supplies every recruiting record field read by publication.
      record as never,
      // SAFETY: The test supplies every Offer field read by publication.
      offer as never,
      "user-1",
      dependencies,
    );

    expect(result).toBe(published);
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ publishedApprovalId: null }));
    expect(insertValues).toHaveBeenCalledOnce();
  });
});
