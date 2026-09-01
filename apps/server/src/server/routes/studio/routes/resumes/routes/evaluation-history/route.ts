import { and, desc, eq } from "drizzle-orm";
import { db } from "../../../../../../../lib/server/db/index";
import {
  jobDescriptionVersion,
  resumeEvaluationFailure,
  resumeEvaluationVersion,
} from "@arc/db-schema/schema";
import { resolveRecruitingVisibilityScope } from "../../../../../../access/recruiting-visibility";
import type { ResumeEvaluationHistoryResponse } from "@arc/shared/studio-resumes";
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
          artifact: resumeEvaluationVersion.artifact,
          contractVersion: resumeEvaluationVersion.contractVersion,
          createdAt: resumeEvaluationVersion.createdAt,
          id: resumeEvaluationVersion.id,
          jobDescriptionVersion: jobDescriptionVersion.version,
          jobDescriptionVersionId: resumeEvaluationVersion.jobDescriptionVersionId,
          numericScore: resumeEvaluationVersion.numericScore,
          recommendationLevel: resumeEvaluationVersion.recommendationLevel,
        })
        .from(resumeEvaluationVersion)
        .leftJoin(
          jobDescriptionVersion,
          eq(resumeEvaluationVersion.jobDescriptionVersionId, jobDescriptionVersion.id),
        )
        .where(
          and(
            eq(resumeEvaluationVersion.resumeRecordId, id),
            eq(resumeEvaluationVersion.organizationId, activeOrg.id),
          ),
        )
        .orderBy(desc(resumeEvaluationVersion.createdAt)),
      db
        .select({
          contractVersion: resumeEvaluationFailure.contractVersion,
          createdAt: resumeEvaluationFailure.createdAt,
          errorMessage: resumeEvaluationFailure.errorMessage,
          id: resumeEvaluationFailure.id,
          jobDescriptionVersion: jobDescriptionVersion.version,
          jobDescriptionVersionId: resumeEvaluationFailure.jobDescriptionVersionId,
        })
        .from(resumeEvaluationFailure)
        .leftJoin(
          jobDescriptionVersion,
          eq(resumeEvaluationFailure.jobDescriptionVersionId, jobDescriptionVersion.id),
        )
        .where(
          and(
            eq(resumeEvaluationFailure.resumeRecordId, id),
            eq(resumeEvaluationFailure.organizationId, activeOrg.id),
          ),
        )
        .orderBy(desc(resumeEvaluationFailure.createdAt)),
    ]);
    let markedCurrent = false;
    const response: ResumeEvaluationHistoryResponse = {
      failures: failureRows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      records: rows.map((row) => {
        const isCurrent =
          !markedCurrent &&
          row.contractVersion.startsWith("qualitative-v") &&
          row.jobDescriptionVersionId === current.qualitativeJobDescriptionVersionId;
        markedCurrent ||= isCurrent;
        return {
          ...row,
          createdAt: row.createdAt.toISOString(),
          isCurrent,
        };
      }),
    };
    return c.json(response, 200);
  });
