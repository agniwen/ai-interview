import { createRecruitingRecords, deleteRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { organization, recruitingEvent } from "@app/db-schema/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../../lib/server/db/index";
import { factory } from "../../../../../factory";
import { resetResumeEvaluationForJobChange } from "../dao/evaluation";
import { structuredResumeEvaluationRouter } from "../routes/structured-evaluation/route";

const testUrl = process.env.RECRUITING_TEST_DATABASE_URL;
const organizationId = `evaluation-lock-${crypto.randomUUID()}`;
const recordId = `${organizationId}-record`;

describe.skipIf(!testUrl)("resume evaluation row locking (PostgreSQL)", () => {
  beforeAll(async () => {
    if (
      process.env.DATABASE_URL !== testUrl ||
      !new URL(testUrl ?? "").pathname.includes("_test_")
    ) {
      throw new Error("Use an isolated _test_ database for evaluation locking tests");
    }
    await db
      .insert(organization)
      .values({ id: organizationId, name: "评估锁测试", slug: organizationId });
    await createRecruitingRecords(db, {
      candidateName: "评估锁候选人",
      id: recordId,
      organizationId,
      resumeEvaluationStatus: "pass",
    });
  });

  afterAll(async () => {
    await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.organizationId, organizationId));
    await db.delete(organization).where(eq(organization.id, organizationId));
  });

  it("preserves the completed screening guard after locking the record", async () => {
    const input = {
      id: recordId,
      nextJobDescriptionId: null,
      operatorId: null,
      organizationId,
      previousJobDescriptionId: null,
      previousStatus: "pass" as const,
    };
    expect(
      await resetResumeEvaluationForJobChange({ ...input, organizationId: "other-org" }),
    ).toEqual({ status: "not_found" });
    await expect(resetResumeEvaluationForJobChange(input)).rejects.toThrow(
      "已完成节点需要先回退，才能重新确认结果。",
    );
    const [record] = await db
      .select()
      .from(recruitingRecordReadModel)
      .where(eq(recruitingRecordReadModel.id, recordId));
    expect(record?.resumeEvaluationStatus).toBe("pass");
    const events = await db
      .select()
      .from(recruitingEvent)
      .where(
        and(
          eq(recruitingEvent.recruitingRecordId, recordId),
          eq(recruitingEvent.action, "resume_evaluation_reset_for_job_change"),
        ),
      );
    expect(events).toHaveLength(0);
  });

  it("returns the correction readiness response instead of a database error", async () => {
    const app = factory
      .createApp()
      .use("*", async (c, next) => {
        // SAFETY: The harness supplies only context fields consumed by this route.
        c.set("activeOrg", { id: organizationId } as never);
        // SAFETY: The harness supplies only context fields consumed by this route.
        c.set("user", { id: "test-user" } as never);
        // SAFETY: The harness supplies the workspace role checked by real permission middleware.
        c.set("member", { role: "owner" } as never);
        await next();
      })
      .route("/resumes/:id/structured-evaluation", structuredResumeEvaluationRouter);
    const response = await app.request(`/resumes/${recordId}/structured-evaluation/gates/gate-1`, {
      body: JSON.stringify({ correctedStatus: null, expectedRunId: "test-run" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "当前结构化评估尚未完成。" });
  });
});
