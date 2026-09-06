import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import {
  candidate,
  humanInterviewRound,
  organization,
  recruitingNodeState,
} from "@app/db-schema/schema";
import { createDatabase } from "./index";
import { createRecruitingRecords, deleteRecruitingRecords } from "./recruiting-records";
import { recruitingRecordReadModel as read } from "./recruiting-read-model";
import {
  advanceScreeningRecruitingNodeTx,
  closeRecruitingRecordTx,
  reopenRecruitingRecordTx,
  transitionRecruitingNodeTx,
  updateRecruitingNodeTx,
} from "./recruiting-pipeline";

const testUrl = process.env.RECRUITING_TEST_DATABASE_URL;
describe.skipIf(!testUrl)("招聘回退后重新确认", () => {
  if (testUrl && !new URL(testUrl).pathname.includes("_test_")) {
    throw new Error("必须使用隔离测试库");
  }
  const client = postgres(testUrl ?? "postgres://localhost/unused", { max: 1 });
  const db = createDatabase(client);
  const org = `reopen-${crypto.randomUUID()}`;
  beforeAll(async () => {
    await db.insert(organization).values({ id: org, name: "回退测试", slug: org });
  });
  afterAll(async () => {
    await deleteRecruitingRecords(db, eq(read.organizationId, org));
    await db.delete(candidate).where(eq(candidate.organizationId, org));
    await db.delete(organization).where(eq(organization.id, org));
    await client.end();
  });
  async function fixture(status: "completed" | "pending" = "completed") {
    const [record] = await createRecruitingRecords(db, {
      candidateName: "回退候选人",
      organizationId: org,
      pipelineStage: "screening",
    });
    if (!record) {
      throw new Error("创建失败");
    }
    const command = { operatorId: null, organizationId: org, recordId: record.id };
    await db.transaction((tx) =>
      advanceScreeningRecruitingNodeTx(tx, { ...command, targetNode: "second_interview" }),
    );
    const roundId = crypto.randomUUID();
    await db.insert(humanInterviewRound).values({
      feedback: "经验符合岗位",
      format: "online",
      id: roundId,
      label: "复试",
      organizationId: org,
      outcome: "pass",
      recruitingRecordId: record.id,
      roundKind: "second_interview",
      status,
    });
    await db.transaction((tx) =>
      updateRecruitingNodeTx(tx, {
        ...command,
        effectiveHumanRoundId: roundId,
        node: "second_interview",
        result: status === "completed" ? "pass" : null,
        status: status === "completed" ? "completed" : "scheduled",
      }),
    );
    return { command, roundId };
  }
  function nodes(recordId: string) {
    return db
      .select()
      .from(recruitingNodeState)
      .where(eq(recruitingNodeState.recruitingRecordId, recordId));
  }
  it("回退复试保留已完成依据、清除下游，连续回退仍可重新确认并推进", async () => {
    const f = await fixture();
    await db.transaction((tx) =>
      transitionRecruitingNodeTx(tx, { ...f.command, targetNode: "final_interview" }),
    );
    for (let i = 0; i < 2; i += 1) {
      await db.transaction((tx) =>
        reopenRecruitingRecordTx(tx, {
          ...f.command,
          reason: "重新确认复试",
          targetNode: "second_interview",
        }),
      );
      const current = await nodes(f.command.recordId);
      expect(current.find((n) => n.node === "second_interview")).toMatchObject({
        decidedAt: null,
        effectiveHumanRoundId: f.roundId,
        result: null,
        status: "awaiting_review",
      });
      expect(current.find((n) => n.node === "final_interview")).toMatchObject({
        effectiveHumanRoundId: null,
        result: null,
        status: "inactive",
      });
    }
    await db.transaction((tx) =>
      updateRecruitingNodeTx(tx, {
        ...f.command,
        expectedEffectiveId: f.roundId,
        node: "second_interview",
        result: "pass",
        status: "completed",
      }),
    );
    const advanced = await db.transaction((tx) =>
      transitionRecruitingNodeTx(tx, { ...f.command, targetNode: "final_interview" }),
    );
    expect(advanced.currentStage).toBe("final_interview");
  });
  it("关闭后重开已完成面试，旧结论不自动通过但依据可重新确认", async () => {
    const f = await fixture();
    await db.transaction((tx) =>
      closeRecruitingRecordTx(tx, {
        ...f.command,
        closeReason: "candidate_withdrew",
        outcome: "withdrawn",
        reason: "候选人暂缓",
      }),
    );
    await db.transaction((tx) =>
      reopenRecruitingRecordTx(tx, {
        ...f.command,
        reason: "继续应聘",
        targetNode: "second_interview",
      }),
    );
    const current = await nodes(f.command.recordId);
    expect(current.find((n) => n.node === "second_interview")).toMatchObject({
      effectiveHumanRoundId: f.roundId,
      result: null,
      status: "awaiting_review",
    });
    await expect(
      db.transaction((tx) =>
        transitionRecruitingNodeTx(tx, { ...f.command, targetNode: "final_interview" }),
      ),
    ).rejects.toThrow();
  });
  it("未完成面试回退不恢复旧排期，也不从其他历史完成轮次猜测依据", async () => {
    const f = await fixture("pending");
    await db.insert(humanInterviewRound).values({
      feedback: "旧反馈",
      format: "online",
      id: crypto.randomUUID(),
      label: "历史复试",
      organizationId: org,
      outcome: "pass",
      recruitingRecordId: f.command.recordId,
      roundKind: "second_interview",
      status: "completed",
    });
    await db.transaction((tx) =>
      reopenRecruitingRecordTx(tx, {
        ...f.command,
        reason: "重新安排",
        targetNode: "second_interview",
      }),
    );
    const current = await nodes(f.command.recordId);
    expect(current.find((n) => n.node === "second_interview")).toMatchObject({
      effectiveHumanRoundId: null,
      result: null,
      status: "pending",
    });
    const [round] = await db
      .select()
      .from(humanInterviewRound)
      .where(
        and(eq(humanInterviewRound.id, f.roundId), eq(humanInterviewRound.organizationId, org)),
      );
    expect(round.status).toBe("pending");
  });
});
