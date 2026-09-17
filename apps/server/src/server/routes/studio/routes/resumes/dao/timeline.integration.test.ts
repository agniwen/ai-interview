import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createRecruitingRecords, deleteRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import {
  advanceScreeningRecruitingNodeTx,
  closeRecruitingRecordTx,
  reopenRecruitingRecordTx,
} from "@app/database/recruiting-pipeline";
import { organization, recruitingEvent, user } from "@app/db-schema/schema";
import { db } from "../../../../../../lib/server/db/index";
import { loadCandidateTimeline } from "./timeline";

const testUrl = process.env.RECRUITING_TEST_DATABASE_URL;
describe.skipIf(!testUrl)("真实招聘动作活动记录", () => {
  const org = `timeline-${crypto.randomUUID()}`;
  const actor = `${org}-actor`;
  const id = `${org}-record`;
  const command = { operatorId: actor, organizationId: org, recordId: id };
  beforeAll(async () => {
    if (process.env.DATABASE_URL !== testUrl || !new URL(testUrl ?? "").pathname.includes("test")) {
      throw new Error("仅隔离测试库");
    }
    await db.insert(organization).values({ id: org, name: "活动测试", slug: org });
    await db
      .insert(user)
      .values({ email: `${actor}@example.invalid`, id: actor, name: "流程操作员" });
    await createRecruitingRecords(db, {
      candidateName: "活动记录测试",
      createdBy: actor,
      id,
      organizationId: org,
      resumeParseStatus: "ready",
    });
  });
  afterAll(async () => {
    await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.id, id));
    await db.delete(organization).where(eq(organization.id, org));
    await db.delete(user).where(eq(user.id, actor));
  });
  it("列级流转字段进入中文活动记录，回开和结束保留操作者且不重复合成结束", async () => {
    await db.transaction((tx) =>
      advanceScreeningRecruitingNodeTx(tx, {
        ...command,
        expectedVersion: 0,
        targetNode: "ai_interview",
      }),
    );
    await db.transaction((tx) =>
      closeRecruitingRecordTx(tx, {
        ...command,
        closeReason: "candidate_withdrew",
        outcome: "withdrawn",
      }),
    );
    await db.transaction((tx) =>
      reopenRecruitingRecordTx(tx, { ...command, reason: "重新确认筛选", targetNode: "screening" }),
    );
    await db.transaction((tx) =>
      closeRecruitingRecordTx(tx, {
        ...command,
        closeReason: "resume_rejected",
        outcome: "rejected",
      }),
    );
    const persisted = await db
      .select()
      .from(recruitingEvent)
      .where(eq(recruitingEvent.recruitingRecordId, id));
    const result = await loadCandidateTimeline(id, org);
    expect(result).not.toBeNull();
    for (const event of persisted) {
      const shown = result?.events.find((item) => item.id === `audit:${event.id}`);
      expect(shown, event.action).toMatchObject({ actorName: "流程操作员" });
      expect(shown?.title).not.toBe("系统操作");
      expect(shown?.description).not.toContain("未知阶段");
    }
    expect(result?.events.some((event) => event.description === "简历筛选：通过")).toBe(true);
    expect(result?.events.some((event) => event.description?.includes("简历筛选 → AI 初面"))).toBe(
      true,
    );
    expect(result?.events.filter((event) => event.id === `candidate:${id}:closed`)).toHaveLength(0);
    expect(
      await db.select().from(recruitingEvent).where(eq(recruitingEvent.recruitingRecordId, id)),
    ).toHaveLength(persisted.length);
  });
});
