import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  recruitingOffer,
  recruitingFulfillment,
  recruitingNodeState,
} from "@app/db-schema/schema";
import { createOfferDraft as create, respondOfferDraft as respond } from "./offer-drafts";
import type {
  CreateDraftOptions,
  RespondOfferOptions,
  OfferDraftWriteDependencies,
} from "./offer-drafts";
import type { RecruitingTransaction } from "@app/database/recruiting-pipeline";
import type { OfferDraftRecord } from "@app/shared/studio-pipeline-stages";
const mocks = { lock: vi.fn(), merge: vi.fn(), transaction: vi.fn(), updateNode: vi.fn() };
const dependencies: OfferDraftWriteDependencies = {
  lockRecord: mocks.lock,
  mergeExpectations: mocks.merge,
  transaction: mocks.transaction,
  updateNode: mocks.updateNode,
};
const createOfferDraft = (options: CreateDraftOptions) => create(options, dependencies);
const respondOfferDraft = (options: RespondOfferOptions) => respond(options, dependencies);
type Write = Partial<
  typeof recruitingOffer.$inferInsert & typeof recruitingFulfillment.$inferInsert
>;
type Read =
  | Partial<typeof recruitingOffer.$inferSelect>
  | Partial<typeof recruitingNodeState.$inferSelect>
  | { recordId: string };

const base: typeof recruitingOffer.$inferSelect = {
  baseSalary: 28_000,
  bonus: null,
  candidateCounter: null,
  contentRevision: 1,
  createdAt: new Date("2026-09-16T00:00:00Z"),
  currency: "CNY",
  currentApprovalId: null,
  declineReason: null,
  emailRecipient: null,
  emailSentAt: null,
  equity: null,
  expiresAt: new Date("2026-09-16T00:00:00Z"),
  id: "old",
  joiningDate: null,
  notes: null,
  organizationId: "org",
  position: "工程师",
  publicToken: "old-token",
  publishedApprovalId: null,
  publishedAt: null,
  publishedBy: null,
  publishedSnapshot: null,
  recruitingRecordId: "record",
  responseAt: null,
  responseBy: null,
  responseSource: null,
  sentAt: null,
  status: "sent",
  updatedAt: new Date("2026-09-16T00:00:00Z"),
  version: 1,
};
function transaction(reads: Read[][]) {
  const saved: Write[] = [];
  const tx = {
    insert: () => ({
      values: (row: Write) => {
        saved.push(row);
        return Object.assign(Promise.resolve(), { onConflictDoUpdate: () => Promise.resolve() });
      },
    }),
    select: () => ({
      from: () => ({
        where: () => {
          const rows = reads.shift() ?? [{ ...base, ...saved[0] }];
          const promise = Promise.resolve(rows);
          return Object.assign(promise, { for: () => promise, limit: () => promise });
        },
      }),
    }),
    update: () => ({
      set: (row: Write) => ({
        where: () => {
          saved.push(row);
          return { returning: () => Promise.resolve([{ ...base, ...row }]) };
        },
      }),
    }),
  };
  mocks.transaction.mockImplementation(
    async (run: (value: RecruitingTransaction) => Promise<OfferDraftRecord>) =>
      // SAFETY: The fixture implements only the transaction methods used by these operations.
      await run(tx as never),
  );
  return saved;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lock.mockResolvedValue({ currentStage: "offer", id: "record" });
  mocks.merge.mockResolvedValue({});
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-16T08:30:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("Offer 版本与截止日期", () => {
  it("回退历史存在时创建下一版，清空发送与响应状态", async () => {
    const saved = transaction([
      [{ id: "old", status: "superseded", version: 3 }],
      [{ status: "awaiting_send" }],
    ]);
    const result = await createOfferDraft({
      input: { baseSalary: 30_000, expiresAt: "2026-09-16", position: "高级工程师" },
      interviewRecordId: "record",
      organizationId: "org",
    });
    expect(saved[0]).toMatchObject({
      expiresAt: new Date("2026-09-16T15:59:59.999Z"),
      publicToken: null,
      publishedAt: null,
      sentAt: null,
      status: "draft",
      version: 4,
    });
    expect(result.id).not.toBe("old");
    expect(mocks.updateNode).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        effectiveOfferId: result.id,
        result: null,
        status: "awaiting_send",
      }),
    );
  });
  it("已有有效 Offer 时仍拒绝重复创建", async () => {
    transaction([[{ id: "old", status: "sent", version: 1 }]]);
    await expect(
      createOfferDraft({
        input: { baseSalary: 30_000, position: "工程师" },
        interviewRecordId: "record",
        organizationId: "org",
      }),
    ).rejects.toThrow("已有 Offer");
  });
  it.each(["hr", "candidate"] as const)(
    "%s 可以在截止当天确认旧版 UTC 零点 Offer",
    async (responseSource) => {
      transaction([[{ recordId: "record" }], [base], [{ effectiveOfferId: "old" }]]);
      await expect(
        respondOfferDraft({
          draftId: "old",
          organizationId: "org",
          response: "accepted",
          responseSource,
        }),
      ).resolves.toMatchObject({ status: "accepted" });
    },
  );
  it("北京时间次日零点，在写入前拒绝确认", async () => {
    vi.setSystemTime(new Date("2026-09-16T16:00:00Z"));
    const saved = transaction([[{ recordId: "record" }], [base], [{ effectiveOfferId: "old" }]]);
    await expect(
      respondOfferDraft({ draftId: "old", organizationId: "org", response: "accepted" }),
    ).rejects.toThrow("已过期");
    expect(saved).toEqual([]);
  });
  it("旧 Offer 即使有遗留指针也不能重新确认", async () => {
    const saved = transaction([
      [{ recordId: "record" }],
      [{ ...base, status: "superseded" }],
      [{ effectiveOfferId: "old" }],
    ]);
    await expect(
      respondOfferDraft({ draftId: "old", organizationId: "org", response: "accepted" }),
    ).rejects.toThrow("不是当前有效 Offer");
    expect(saved).toEqual([]);
  });
});
