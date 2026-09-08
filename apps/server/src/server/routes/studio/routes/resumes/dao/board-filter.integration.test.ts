import { createRecruitingRecords, deleteRecruitingRecords } from "@app/database/recruiting-records";
import {
  closeRecruitingRecordTx,
  reopenRecruitingRecordTx,
  transitionRecruitingNodeTx,
  updateRecruitingNodeTx,
} from "@app/database/recruiting-pipeline";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import {
  aiInterviewRound,
  candidate,
  humanInterviewRound,
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
    await seed("offer-pending", "salary_negotiation");
    await seed("offer-negotiating", "salary_negotiation", "negotiating");
    await seed("offer-salary-failed", "salary_negotiation", "pending", "rejected");
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
  it("全部取消阶段约束但保留租户隔离，聚合子标签复用原过滤和分页", async () => {
    const unfiltered = await queryPaginatedResumeRecords(org, {}, { pageSize: 100 });
    expect(await names("all")).toEqual(
      unfiltered.records.map((row) => row.candidateName).toSorted(),
    );
    expect(await names("all")).not.toContain("foreign-screen");
    expect(await names("all:screening:pending")).toEqual(await names("screening:pending"));
    expect(await names("all:offer:negotiating")).toEqual(await names("offer:negotiating"));
    expect(await names("all:closed:hired")).toEqual(await names("closed:hired"));
    const page = await queryPaginatedResumeRecords(
      org,
      { boardView: "all:offer:send" },
      { page: 2, pageSize: 1, sortBy: "candidateName", sortOrder: "asc" },
    );
    expect(page.total).toBe(3);
    expect(page.records[0]?.candidateName).toBe("offer-awaiting-send");
  });
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
  it("HR处理在 SQL 分页前筛出当前存在明确人工作业的候选人", async () => {
    const result = await queryPaginatedResumeRecords(
      org,
      { hrHandling: true },
      { page: 2, pageSize: 2, sortBy: "candidateName", sortOrder: "asc" },
    );
    expect(result.total).toBe(8);
    expect(result.records.map((record) => record.candidateName)).toEqual([
      "offer-awaiting-send",
      "offer-negotiating",
    ]);
  });
  it("HR处理依据实际面试轮次排除待进场和待面试官反馈", async () => {
    const recordIds = {
      aiScheduled: `${org}-hr-ai-scheduled`,
      humanFeedbackReady: `${org}-hr-human-feedback-ready`,
      humanScheduled: `${org}-hr-human-scheduled`,
      humanWaitingFeedback: `${org}-hr-human-waiting-feedback`,
    };
    try {
      await Promise.all([
        createRecruitingRecords(db, {
          candidateName: "hr-ai-scheduled",
          id: recordIds.aiScheduled,
          organizationId: org,
          pipelineStage: "ai_interview",
        }),
        createRecruitingRecords(db, {
          candidateName: "hr-human-scheduled",
          id: recordIds.humanScheduled,
          organizationId: org,
          pipelineStage: "second_interview",
        }),
        createRecruitingRecords(db, {
          candidateName: "hr-human-waiting-feedback",
          id: recordIds.humanWaitingFeedback,
          organizationId: org,
          pipelineStage: "second_interview",
        }),
        createRecruitingRecords(db, {
          candidateName: "hr-human-feedback-ready",
          id: recordIds.humanFeedbackReady,
          organizationId: org,
          pipelineStage: "second_interview",
        }),
      ]);
      await db.insert(aiInterviewRound).values({
        id: `${org}-hr-ai-round`,
        organizationId: org,
        recruitingRecordId: recordIds.aiScheduled,
        roundLabel: "AI 初面",
        sortOrder: 0,
      });
      await db.insert(humanInterviewRound).values([
        {
          format: "online",
          id: `${org}-hr-human-scheduled-round`,
          label: "复试",
          organizationId: org,
          recruitingRecordId: recordIds.humanScheduled,
          roundKind: "second_interview",
          scheduledAt: new Date("2026-09-08T02:00:00.000Z"),
        },
        {
          format: "online",
          id: `${org}-hr-human-waiting-feedback-round`,
          label: "复试",
          organizationId: org,
          recruitingRecordId: recordIds.humanWaitingFeedback,
          roundKind: "second_interview",
          status: "completed",
        },
        {
          feedback: "建议通过",
          format: "online",
          id: `${org}-hr-human-feedback-ready-round`,
          label: "复试",
          organizationId: org,
          recruitingRecordId: recordIds.humanFeedbackReady,
          roundKind: "second_interview",
          status: "completed",
        },
      ]);

      const result = await queryPaginatedResumeRecords(
        org,
        { hrHandling: true },
        { pageSize: 100 },
      );
      const actionableNames = result.records.map((record) => record.candidateName);
      expect(actionableNames).toContain("hr-human-feedback-ready");
      expect(actionableNames).not.toContain("hr-ai-scheduled");
      expect(actionableNames).not.toContain("hr-human-scheduled");
      expect(actionableNames).not.toContain("hr-human-waiting-feedback");
    } finally {
      await deleteRecruitingRecords(
        db,
        inArray(recruitingRecordReadModel.id, Object.values(recordIds)),
      );
    }
  });
  it("实际 Offer 响应持续匹配发 Offer 标签，接受不会自动进入背调", async () => {
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
      await isOnly("offer:send");
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
      await isOnly("offer:send");
      await isOnly("offer:send");
      await respondOfferDraft({ draftId: first.id, organizationId: org, response: "accepted" });
      await isOnly("offer:send");
      expect(await names("offer:background")).not.toContain("offer-real-actions");
      await db.transaction((tx) =>
        transitionRecruitingNodeTx(tx, { ...command, targetNode: "background_check" }),
      );
      expect(await names("offer:background")).toContain("offer-real-actions");
      expect(await names("offer:send")).not.toContain("offer-real-actions");
      await db.transaction((tx) =>
        reopenRecruitingRecordTx(tx, {
          ...command,
          reason: "重新谈薪",
          targetNode: "salary_negotiation",
        }),
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
    ["awaiting_response", "rejected", "salary_disagreement", "offer:send"],
  ] as const)("Offer %s 结束为 %s 后保留正确子流程", async (status, outcome, closeReason, view) => {
    const id = `${org}-close-${status}-${outcome}`;
    const name = `close-${status}-${outcome}`;
    await createRecruitingRecords(db, {
      candidateName: name,
      id,
      organizationId: org,
      pipelineStage: view === "offer:negotiating" ? "salary_negotiation" : "offer",
    });
    try {
      await db.transaction((tx) =>
        updateRecruitingNodeTx(tx, {
          node: view === "offer:negotiating" ? "salary_negotiation" : "offer",
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
