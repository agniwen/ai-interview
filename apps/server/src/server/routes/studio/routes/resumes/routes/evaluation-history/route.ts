import { and, desc, eq } from "drizzle-orm";
import { db } from "../../../../../../../lib/server/db/index";
import {
  jobDescriptionVersion,
  recruitingResumeEvaluation,
  recruitingRecord,
} from "@app/db-schema/schema";
import { resolveRecruitingVisibilityScope } from "../../../../../../access/recruiting-visibility";
import type { ResumeEvaluationHistoryResponse } from "@app/shared/studio-resumes";
import { factory } from "../../../../../../factory";
import { requirePermission } from "../../../../../../middlewares/permission";
import { loadResumeDetail } from "../../dao/resumes";

export const resumeEvaluationHistoryRouter = factory
  .createApp()
  .use("/", requirePermission("resumeLibrary", "read"))
  .get("/", async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: "记录 ID 缺失。" }, 400);
    }
    const visibilityScope = c.var.user
      ? await resolveRecruitingVisibilityScope({
          currentRole: c.var.member?.role,
          organizationId: activeOrg.id,
          userId: c.var.user.id,
        })
      : { kind: "none" as const };
    const current = await loadResumeDetail(id, activeOrg.id, visibilityScope);
    if (!current) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const [rows, failureRows] = await Promise.all([
      db
        .select({
          artifact: recruitingResumeEvaluation.artifact,
          contractVersion: recruitingResumeEvaluation.contractVersion,
          createdAt: recruitingResumeEvaluation.createdAt,
          id: recruitingResumeEvaluation.id,
          jobDescriptionVersion: jobDescriptionVersion.version,
          jobDescriptionVersionId: recruitingResumeEvaluation.jobDescriptionVersionId,
          numericScore: recruitingResumeEvaluation.numericScore,
          recommendationLevel: recruitingResumeEvaluation.recommendationLevel,
        })
        .from(recruitingResumeEvaluation)
        .leftJoin(
          jobDescriptionVersion,
          eq(recruitingResumeEvaluation.jobDescriptionVersionId, jobDescriptionVersion.id),
        )
        .where(
          and(
            eq(recruitingResumeEvaluation.recruitingRecordId, id),
            eq(recruitingResumeEvaluation.organizationId, activeOrg.id),
            eq(recruitingResumeEvaluation.kind, "resume_review"),
            eq(recruitingResumeEvaluation.status, "succeeded"),
          ),
        )
        .orderBy(desc(recruitingResumeEvaluation.createdAt)),
      db
        .select({
          contractVersion: recruitingResumeEvaluation.contractVersion,
          createdAt: recruitingResumeEvaluation.createdAt,
          errorMessage: recruitingResumeEvaluation.errorMessage,
          id: recruitingResumeEvaluation.id,
          jobDescriptionVersion: jobDescriptionVersion.version,
          jobDescriptionVersionId: recruitingResumeEvaluation.jobDescriptionVersionId,
        })
        .from(recruitingResumeEvaluation)
        .leftJoin(
          jobDescriptionVersion,
          eq(recruitingResumeEvaluation.jobDescriptionVersionId, jobDescriptionVersion.id),
        )
        .where(
          and(
            eq(recruitingResumeEvaluation.recruitingRecordId, id),
            eq(recruitingResumeEvaluation.organizationId, activeOrg.id),
            eq(recruitingResumeEvaluation.kind, "resume_review"),
            eq(recruitingResumeEvaluation.status, "failed"),
          ),
        )
        .orderBy(desc(recruitingResumeEvaluation.createdAt)),
    ]);
    const [pointer] = await db
      .select({ currentId: recruitingRecord.currentEvaluationId })
      .from(recruitingRecord)
      .where(and(eq(recruitingRecord.id, id), eq(recruitingRecord.organizationId, activeOrg.id)))
      .limit(1);
    const response: ResumeEvaluationHistoryResponse = {
      failures: failureRows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        errorMessage: row.errorMessage ?? "AI 分析失败",
      })),
      records: rows.map((row) => {
        const isCurrent = row.id === pointer?.currentId;
        return {
          ...row,
          createdAt: row.createdAt.toISOString(),
          isCurrent,
        };
      }),
    };
    return c.json(response, 200);
  });
