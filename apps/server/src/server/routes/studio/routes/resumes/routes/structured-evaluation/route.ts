import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@server/lib/server/db/index";
import { studioInterview } from "@app/db-schema/schema";
import {
  structuredResumeEvaluationV1Schema,
  structuredResumeGateStatusSchema,
} from "@app/db-schema/structured-resume-evaluation";
import {
  applyGateCorrection,
  deriveStructuredResumeSummaries,
} from "@app/shared/structured-resume-scoring";
import { resolveRecruitingVisibilityScope } from "../../../../../../access/recruiting-visibility";
import { factory, jsonValidatorError } from "../../../../../../factory";
import { requirePermission } from "../../../../../../middlewares/permission";
import { invalidateStudioInterviewCaches } from "../../../../../../cache-tags";

const correctionInputSchema = z
  .object({
    correctedStatus: structuredResumeGateStatusSchema.nullable(),
    expectedRunId: z.string().trim().min(1),
  })
  .strict();

export const structuredResumeEvaluationRouter = factory
  .createApp()
  .patch(
    "/gates/:requirementId",
    requirePermission("resumeLibrary", "update"),
    zValidator("json", correctionInputSchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      const { activeOrg, member, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const visibility = await resolveRecruitingVisibilityScope({
        currentRole: member?.role,
        organizationId: activeOrg.id,
        userId: user.id,
      });
      if (visibility.kind === "none") {
        return c.json({ error: "记录不存在。" }, 404);
      }
      const input = c.req.valid("json");
      const recordId = c.req.param("id");
      const requirementId = c.req.param("requirementId");
      if (!recordId) {
        return c.json({ error: "记录不存在。" }, 404);
      }
      const result = await db.transaction(async (tx) => {
        const visibilityCondition =
          visibility.kind === "restricted"
            ? inArray(studioInterview.createdBy, visibility.userIds)
            : null;
        const conditions = [
          eq(studioInterview.id, recordId),
          eq(studioInterview.organizationId, activeOrg.id),
          visibilityCondition,
        ].filter((condition) => condition !== null);
        const [record] = await tx
          .select({
            resumeReviewRunId: studioInterview.resumeReviewRunId,
            resumeReviewStatus: studioInterview.resumeReviewStatus,
            structuredResumeEvaluation: studioInterview.structuredResumeEvaluation,
          })
          .from(studioInterview)
          .where(and(...conditions))
          .limit(1)
          .for("update");
        if (!record) {
          return { status: "not_found" as const };
        }
        if (record.resumeReviewStatus !== "ready" || !record.structuredResumeEvaluation) {
          return { status: "not_ready" as const };
        }
        if (record.resumeReviewRunId !== input.expectedRunId) {
          return { status: "stale_run" as const };
        }
        const evaluation = structuredResumeEvaluationV1Schema.parse(
          record.structuredResumeEvaluation,
        );
        if (
          !evaluation.gates.judgments.some((judgment) => judgment.requirementId === requirementId)
        ) {
          return { status: "unknown_requirement" as const };
        }
        const correctedEvaluation = structuredResumeEvaluationV1Schema.parse(
          applyGateCorrection(evaluation, {
            correctedAt: new Date().toISOString(),
            correctedBy: user.id,
            correctedStatus: input.correctedStatus,
            requirementId,
          }),
        );
        const summaries = deriveStructuredResumeSummaries(correctedEvaluation);
        const [updated] = await tx
          .update(studioInterview)
          .set({
            structuredGateSortRank: summaries.gateSortRank,
            structuredGateStatus: summaries.gateStatus,
            structuredResumeEvaluation: correctedEvaluation,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(studioInterview.id, recordId),
              eq(studioInterview.organizationId, activeOrg.id),
              eq(studioInterview.resumeReviewRunId, input.expectedRunId),
              visibilityCondition ?? undefined,
            ),
          )
          .returning({ id: studioInterview.id });
        return updated
          ? {
              evaluation: correctedEvaluation,
              status: "updated" as const,
              summaries,
            }
          : { status: "stale_run" as const };
      });
      if (result.status === "not_found") {
        return c.json({ error: "记录不存在。" }, 404);
      }
      if (result.status === "unknown_requirement") {
        return c.json({ error: "门槛条件不存在。" }, 404);
      }
      if (result.status === "not_ready" || result.status === "stale_run") {
        return c.json(
          {
            error:
              result.status === "not_ready"
                ? "当前结构化评估尚未完成。"
                : "评估结果已更新，请刷新后重试。",
          },
          409,
        );
      }
      invalidateStudioInterviewCaches(activeOrg.id);
      return c.json(result, 200);
    },
  );
