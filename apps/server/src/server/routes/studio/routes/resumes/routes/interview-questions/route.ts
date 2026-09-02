import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb } from "@server/lib/server/db/index";
import { studioInterview } from "@app/db-schema/schema";
import { studioInterviewQuestionClientSchema } from "@app/db-schema/studio-interviews";
import { resolveRecruitingVisibilityScope as defaultResolveRecruitingVisibilityScope } from "../../../../../../access/recruiting-visibility";
import { invalidateStudioInterviewCaches as defaultInvalidateStudioInterviewCaches } from "../../../../../../cache-tags";
import { factory, jsonValidatorError } from "../../../../../../factory";
import { requirePermission as defaultRequirePermission } from "../../../../../../middlewares/permission";
import { loadResumeDetail as defaultLoadResumeDetail } from "../../dao/resumes";

const interviewQuestionsUpdateSchema = z.object({
  interviewQuestions: z.array(studioInterviewQuestionClientSchema).max(50),
});

const defaultDependencies = {
  db: defaultDb,
  invalidateStudioInterviewCaches: defaultInvalidateStudioInterviewCaches,
  loadResumeDetail: defaultLoadResumeDetail,
  requirePermission: defaultRequirePermission,
  resolveRecruitingVisibilityScope: defaultResolveRecruitingVisibilityScope,
};

export type InterviewQuestionsRouterDependencies = typeof defaultDependencies;

export function createInterviewQuestionsRouter(
  overrides: Partial<InterviewQuestionsRouterDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides };

  return factory
    .createApp()
    .patch(
      "/:id/interview-questions",
      dependencies.requirePermission("resumeLibrary", "update"),
      zValidator("json", interviewQuestionsUpdateSchema, jsonValidatorError("推荐问题参数无效。")),
      async (c) => {
        const { activeOrg } = c.var;
        if (!activeOrg) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const recordId = c.req.param("id");
        const visibilityScope = c.var.user?.id
          ? await dependencies.resolveRecruitingVisibilityScope({
              currentRole: c.var.member?.role,
              organizationId: activeOrg.id,
              userId: c.var.user.id,
            })
          : { kind: "none" as const };
        const existing = await dependencies.loadResumeDetail(
          recordId,
          activeOrg.id,
          visibilityScope,
        );
        if (!existing) {
          return c.json({ error: "记录不存在。" }, 404);
        }
        const interviewQuestions = c.req.valid("json").interviewQuestions.map((question) => ({
          ...question,
          dimension: question.dimension ?? "business",
        }));
        await dependencies.db
          .update(studioInterview)
          .set({ interviewQuestions, updatedAt: new Date() })
          .where(
            and(eq(studioInterview.id, recordId), eq(studioInterview.organizationId, activeOrg.id)),
          );
        dependencies.invalidateStudioInterviewCaches(activeOrg.id);
        return c.json({ interviewQuestions }, 200);
      },
    );
}

export const interviewQuestionsRouter = createInterviewQuestionsRouter();
