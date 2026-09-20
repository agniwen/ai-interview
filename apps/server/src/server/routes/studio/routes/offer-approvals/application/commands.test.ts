import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { PgTable } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { recruitingOfferApproval, recruitingOfferApprovalStep } from "@app/db-schema/schema";
import {
  assertAssignedApprover,
  assertManualApproverSelection,
  decideOfferApproval,
  notifyOfferApproval,
  defaultOfferApprovalCommandDependencies,
} from "./commands";
import type { OfferApprovalCommandDependencies } from "./commands";
const request = () => ({ requestId: crypto.randomUUID() });

describe("审批人身份约束", () => {
  it("allows the applicant to approve a node produced by a template", () => {
    expect(() =>
      assertAssignedApprover(
        { organizationId: "org", userId: "applicant" },
        { applicantId: "applicant" },
        { approverId: "applicant", sourceType: "job_reporting_manager" },
      ),
    ).not.toThrow();
  });

  it("keeps self-approval and duplicates blocked in manual mode", () => {
    expect(() => assertManualApproverSelection("applicant", ["a", "a"])).toThrow("不能重复");
    expect(() => assertManualApproverSelection("applicant", ["applicant"])).toThrow("不能审批自己");
    expect(() =>
      assertAssignedApprover(
        { organizationId: "org", userId: "applicant" },
        { applicantId: "applicant" },
        { approverId: "applicant", sourceType: "manual" },
      ),
    ).toThrow("只有当前指定审批人");
  });
});

describe("审批节点催办限频", () => {
  it("limits repeated reminders for one node without blocking the newly activated approver", async () => {
    const approval: Pick<
      typeof recruitingOfferApproval.$inferSelect,
      "applicantId" | "currentStep" | "id" | "invalidatedAt" | "lastRemindedAt" | "status"
    > = {
      applicantId: "hr",
      currentStep: 0,
      id: "approval",
      invalidatedAt: null,
      lastRemindedAt: null,
      status: "pending",
    };
    const steps = [
      { approverId: "a", id: "step-a", position: 0, status: "pending" },
      { approverId: "b", id: "step-b", position: 1, status: "waiting" },
    ];
    const tx = {
      update: (table: PgTable) => ({
        set: (patch: Record<string, string | number | Date | null>) => ({
          where: (condition: SQL) => {
            if (table === recruitingOfferApproval) {
              Object.assign(approval, patch);
            }
            if (table === recruitingOfferApprovalStep) {
              const { params } = new PgDialect().sqlToQuery(condition);
              for (const step of steps) {
                if (
                  params.includes(step.id) ||
                  (params.includes(approval.id) && params.includes(step.status))
                ) {
                  Object.assign(step, patch);
                }
              }
            }
            return Promise.resolve();
          },
        }),
      }),
    };
    const enqueue = vi.fn();
    const dependencies: OfferApprovalCommandDependencies = {
      ...defaultOfferApprovalCommandDependencies,
      assertApprovalPermission: vi.fn(),
      assertCurrentDraft: vi.fn(),
      assertRecordManager: vi.fn(),
      cancelApprovalRemindersTx: vi.fn(),
      db: {
        // SAFETY: The in-memory transaction implements all updates exercised by decision/reminder commands.
        transaction: async (action) => await action(tx as never),
      },
      enqueueApprovalNotificationTx: enqueue,
      lockApproval: vi.fn().mockImplementation(() => ({
        approval: { ...approval },
        offer: { currentApprovalId: approval.id },
        record: { id: "record" },
        steps: steps.map((step) => ({ ...step })),
      })),
      readReceipt: vi.fn(),
      recordApprovalEventTx: vi.fn(),
      saveReceipt: vi.fn(),
    };
    const hr = { organizationId: "org", userId: "hr" };
    await notifyOfferApproval(hr, "approval", "remind", request(), dependencies);
    expect(enqueue).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ recipientUserId: "a" }),
    );
    await expect(
      notifyOfferApproval(hr, "approval", "remind", request(), dependencies),
    ).rejects.toThrow("30 分钟");

    await decideOfferApproval(
      { ...hr, userId: "a" },
      "approval",
      "step-a",
      {
        decision: "approved",
        requestId: crypto.randomUUID(),
      },
      dependencies,
    );
    expect(steps[1]?.status).toBe("pending");
    await notifyOfferApproval(hr, "approval", "remind", request(), dependencies);
    expect(enqueue).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ recipientUserId: "b" }),
    );
    await expect(
      notifyOfferApproval(hr, "approval", "remind", request(), dependencies),
    ).rejects.toThrow("30 分钟");
  });
});
