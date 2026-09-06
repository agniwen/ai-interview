import { createRecruitingRecords, deleteRecruitingRecords } from "@app/database/recruiting-records";
import {
  closeRecruitingRecordTx,
  reopenRecruitingRecordTx,
  transitionRecruitingNodeTx,
  updateRecruitingNodeTx,
} from "@app/database/recruiting-pipeline";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import {
  candidate,
  organization,
  recruitingNodeState,
  recruitingRecord,
} from "@app/db-schema/schema";
import type { RecruitingBoardView } from "@app/shared/recruiting-board";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../../lib/server/db/index";
import { queryPaginatedResumeRecords } from "./resumes";
import {
  createOfferDraft,
  sendOfferDraft,
  respondOfferDraft,
} from "../../interviews/dao/offer-drafts";

const url = process.env.RECRUITING_TEST_DATABASE_URL;
if (url && (url !== process.env.DATABASE_URL || !new URL(url).pathname.includes("_test_"))) {
  throw new Error("招聘台测试仅可在隔离库执行");
}
const org = `board-${crypto.randomUUID()}`;
const otherOrg = `${org}-other`;
type Node = typeof recruitingNodeState.$inferSelect.node;
type Status = typeof recruitingNodeState.$inferSelect.status;

describe.skipIf(!url)("招聘台主标签和子标签 SQL 分页", () => {
  beforeAll(async () => {
    await db.insert(organization).values([org, otherOrg].map((id) => ({ id, name: id, slug: id })));
    async function seed(
      name: string,
      node: Node,
      status: Status = "pending",
      outcome?: "rejected" | "withdrawn" | "hired",
      tenant = org,
    ) {
      const [record] = await createRecruitingRecords(db, {
        candidateName: name,
        id: `${org}-${name}`,
        organizationId: tenant,
        pipelineStage: node,
      });
      if (!record) {
        throw new Error("缺少招聘记录");
      }
      await db
        .update(recruitingNodeState)
        .set({ result: status === "completed" ? "pass" : null, status })
        .where(
          and(
            eq(recruitingNodeState.recruitingRecordId, record.id),
            eq(recruitingNodeState.node, node),
          ),
        );
      const closeReasons = {
        hired: "onboarded",
        rejected: node === "offer" ? "salary_disagreement" : "resume_rejected",
        withdrawn: "candidate_withdrew",
      } as const;
      if (outcome) {
        await db.transaction((tx) =>
          closeRecruitingRecordTx(tx, {
            closeReason: closeReasons[outcome],
            operatorId: null,
            organizationId: tenant,
            outcome,
            recordId: record.id,
          }),
        );
      }
    }
    await seed("screen-pending", "screening");
    await seed("screen-pass", "screening", "completed");
    await seed("screen-fail", "screening", "pending", "rejected");
    await seed("advanced-ai", "ai_interview");
    await seed("offer-pending", "offer");
    await seed("offer-negotiating", "offer", "negotiating");
    await seed("offer-salary-failed", "offer", "pending", "rejected");
    await seed("offer-awaiting-send", "offer", "awaiting_send");
    await seed("offer-sent", "offer", "awaiting_response");
    await seed("offer-accepted", "offer", "completed");
    await seed("onboarding-pending", "onboarding");
    await seed("onboarding-withdrawn", "onboarding", "pending", "withdrawn");
    await seed("onboarding-hired", "onboarding", "completed", "hired");
    await seed("foreign-screen", "screening", "pending", undefined, otherOrg);
  }, 120_000);
  afterAll(async () => {
    await deleteRecruitingRecords(
      db,
      inArray(recruitingRecordReadModel.organizationId, [org, otherOrg]),
    );
    await db.delete(candidate).where(inArray(candidate.organizationId, [org, otherOrg]));
    await db.delete(organization).where(inArray(organization.id, [org, otherOrg]));
  }, 120_000);
  async function names(boardView: RecruitingBoardView) {
    const result = await queryPaginatedResumeRecords(org, { boardView }, { pageSize: 100 });
    return result.records.map((record) => record.candidateName).toSorted();
  }
  it("结束的淘汰归原筛选，合格只含未推进的筛选节点", async () => {
    expect(await names("screening:all")).toEqual(["screen-fail", "screen-pass", "screen-pending"]);
    expect(await names("screening:pending")).toEqual(["screen-pending"]);
    expect(await names("screening:fail")).toEqual(["screen-fail"]);
    expect(await names("screening:pass")).toEqual(["screen-pass"]);
    expect(await names("interview:ai")).toEqual(["advanced-ai"]);
  });
  it("谈薪失败留在谈薪，待发/已发/接受归发 Offer 且不重叠", async () => {
    expect(await names("offer:negotiating")).toEqual([
      "offer-negotiating",
      "offer-pending",
      "offer-salary-failed",
    ]);
    expect(await names("offer:send")).toEqual([
      "offer-accepted",
      "offer-awaiting-send",
      "offer-sent",
    ]);
  });
  it("入职办理包含结束后的放弃和入职结果", async () => {
    expect(await names("onboarding:pending")).toEqual(["onboarding-pending"]);
    expect(await names("onboarding:withdrawn")).toEqual(["onboarding-withdrawn"]);
    expect(await names("onboarding:hired")).toEqual(["onboarding-hired"]);
    expect(await names("closed:hired")).toEqual(["onboarding-hired"]);
  });
  it("SQL 过滤先于分页和count，租户及旧pipelineStages筛选取交集", async () => {
    const result = await queryPaginatedResumeRecords(
      org,
      { boardView: "screening:all" },
      { page: 2, pageSize: 1, sortBy: "candidateName", sortOrder: "asc" },
    );
    expect(result.total).toBe(3);
    expect(result.records.map((record) => record.candidateName)).toEqual(["screen-pass"]);
    const closed = await queryPaginatedResumeRecords(org, {
      boardView: "screening:all",
      pipelineStages: ["closed"],
    });
    expect(closed.total).toBe(1);
    expect(closed.records[0]?.candidateName).toBe("screen-fail");
  });
  it("实际 Offer 响应和重发持续匹配子标签，接受不会自动进入背调", async () => {
    const id = `${org}-offer-real-actions`;
    const command = { operatorId: null, organizationId: org, recordId: id };
    await createRecruitingRecords(db, {
      candidateName: "offer-real-actions",
      id,
      organizationId: org,
      pipelineStage: "offer",
    });
    await db
      .update(recruitingNodeState)
      .set({ result: "pass", status: "completed" })
      .where(
        and(
          eq(recruitingNodeState.recruitingRecordId, id),
          eq(recruitingNodeState.node, "screening"),
        ),
      );
    async function isOnly(view: "offer:negotiating" | "offer:send") {
      expect(await names(view)).toContain("offer-real-actions");
      expect(await names(view === "offer:send" ? "offer:negotiating" : "offer:send")).not.toContain(
        "offer-real-actions",
      );
      expect(await names("offer:all")).toContain("offer-real-actions");
    }
    try {
      await isOnly("offer:negotiating");
      const first = await createOfferDraft({
        input: { baseSalary: 20_000, position: "测试岗位" },
        interviewRecordId: id,
        organizationId: org,
      });
      await isOnly("offer:send");
      await sendOfferDraft(first.id, org);
      await isOnly("offer:send");
      await respondOfferDraft({
        candidateCounter: "调整薪资",
        draftId: first.id,
        organizationId: org,
        response: "counter",
      });
      await isOnly("offer:negotiating");
      const second = await createOfferDraft({
        input: { baseSalary: 22_000, position: "测试岗位" },
        interviewRecordId: id,
        organizationId: org,
      });
      await isOnly("offer:send");
      await sendOfferDraft(second.id, org);
      await respondOfferDraft({ draftId: second.id, organizationId: org, response: "accepted" });
      await isOnly("offer:send");
      expect(await names("offer:background")).not.toContain("offer-real-actions");
      await db.transaction((tx) =>
        transitionRecruitingNodeTx(tx, { ...command, targetNode: "background_check" }),
      );
      expect(await names("offer:background")).toContain("offer-real-actions");
      expect(await names("offer:send")).not.toContain("offer-real-actions");
      await db.transaction((tx) =>
        reopenRecruitingRecordTx(tx, { ...command, reason: "重新谈薪", targetNode: "offer" }),
      );
      await isOnly("offer:negotiating");
      await db.transaction((tx) =>
        closeRecruitingRecordTx(tx, {
          ...command,
          closeReason: "salary_disagreement",
          outcome: "rejected",
        }),
      );
      await isOnly("offer:negotiating");
      expect(await names("closed:rejected")).toContain("offer-real-actions");
    } finally {
      await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.id, id));
    }
  }, 60_000);

  it.each([
    ["pending", "withdrawn", "candidate_withdrew", "offer:negotiating"],
    ["negotiating", "archived", "other", "offer:negotiating"],
    ["awaiting_send", "withdrawn", "candidate_withdrew", "offer:send"],
    ["awaiting_response", "withdrawn", "candidate_withdrew", "offer:send"],
    ["awaiting_response", "rejected", "salary_disagreement", "offer:negotiating"],
  ] as const)("Offer %s 结束为 %s 后保留正确子流程", async (status, outcome, closeReason, view) => {
    const id = `${org}-close-${status}-${outcome}`;
    const name = `close-${status}-${outcome}`;
    await createRecruitingRecords(db, {
      candidateName: name,
      id,
      organizationId: org,
      pipelineStage: "offer",
    });
    try {
      await db.transaction((tx) =>
        updateRecruitingNodeTx(tx, {
          node: "offer",
          operatorId: null,
          organizationId: org,
          recordId: id,
          status,
        }),
      );
      await db.transaction((tx) =>
        closeRecruitingRecordTx(tx, {
          closeReason,
          operatorId: null,
          organizationId: org,
          outcome,
          recordId: id,
        }),
      );
      expect(await names(view)).toContain(name);
      expect(await names(view === "offer:send" ? "offer:negotiating" : "offer:send")).not.toContain(
        name,
      );
      expect(await names("closed:all")).toContain(name);
      // 兼容仅保存关闭事件快照的既有记录，无需回填旧 closeDetails。
      await db
        .update(recruitingRecord)
        .set({ closeDetails: null })
        .where(eq(recruitingRecord.id, id));
      expect(await names(view)).toContain(name);
      expect(await names(view === "offer:send" ? "offer:negotiating" : "offer:send")).not.toContain(
        name,
      );
    } finally {
      await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.id, id));
    }
  });

  it("筛选合格只改变结果；淘汰双归属；重新回开恢复未处理", async () => {
    const id = `${org}-screen-real-actions`;
    const command = { operatorId: null, organizationId: org, recordId: id };
    await createRecruitingRecords(db, {
      candidateName: "screen-real-actions",
      id,
      organizationId: org,
    });
    try {
      await db.transaction((tx) =>
        updateRecruitingNodeTx(tx, {
          ...command,
          node: "screening",
          result: "pass",
          status: "completed",
        }),
      );
      expect(await names("screening:pass")).toContain("screen-real-actions");
      expect(await names("interview:all")).not.toContain("screen-real-actions");
      await db.transaction((tx) =>
        reopenRecruitingRecordTx(tx, { ...command, reason: "重新审核", targetNode: "screening" }),
      );
      expect(await names("screening:pending")).toContain("screen-real-actions");
      await db.transaction((tx) =>
        updateRecruitingNodeTx(tx, {
          ...command,
          node: "screening",
          result: "fail",
          status: "completed",
        }),
      );
      expect(await names("screening:fail")).toContain("screen-real-actions");
      expect(await names("closed:rejected")).toContain("screen-real-actions");
      await db.transaction((tx) =>
        reopenRecruitingRecordTx(tx, { ...command, reason: "再次应聘", targetNode: "screening" }),
      );
      expect(await names("screening:pending")).toContain("screen-real-actions");
      expect(await names("screening:fail")).not.toContain("screen-real-actions");
      expect(await names("closed:all")).not.toContain("screen-real-actions");
    } finally {
      await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.id, id));
    }
  }, 60_000);
});
