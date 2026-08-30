import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "@app/server/lib/server/db";
import {
  streamGenerateInterviewQuestions,
  streamGenerateResumeReview,
  streamGenerateResumeReviewMarkdownFirst,
  streamParseResumeProfile,
} from "@app/server/server/agents/resume-analysis-agent";
import { createInternalErrorResponse } from "@app/server/server/error-handler";
import { factory, jsonValidatorError } from "@app/server/server/factory";
import { resolveJobDescriptionMatchBestEffort } from "@app/server/server/routes/interview/match-job-description";
import {
  listRecruitingJobDescriptions,
  loadRecruitingJobDescriptionById,
} from "@app/server/server/routes/studio/routes/job-descriptions/dao";
import { resumeProfileSchema } from "@arc/db-schema/interview/types";
import { studioInterview } from "@arc/db-schema/schema";

const streamHeaders = {
  "Cache-Control": "no-cache",
  "Content-Type": "text/event-stream",
  "Transfer-Encoding": "chunked",
  "X-Accel-Buffering": "no",
} as const;

const reviewInputSchema = z.object({
  jobDescriptionId: z.string().trim().optional().nullable(),
  resumeProfile: resumeProfileSchema,
});

const questionInputSchema = z.object({
  jobDescriptionId: z.string().trim().optional().nullable(),
  resumeProfile: resumeProfileSchema,
});

async function loadJobDescriptionText(organizationId: string, jobDescriptionId?: string | null) {
  if (!jobDescriptionId) {
    return null;
  }
  const jd = await loadRecruitingJobDescriptionById(organizationId, jobDescriptionId);
  if (!jd) {
    return null;
  }
  return [`岗位名称：${jd.name}`, `岗位 JD：\n${jd.prompt}`].join("\n\n");
}

export const interviewAnalysisRouter = factory
  .createApp()
  .post("/parse-resume", async (c) => {
    const { activeOrg, user } = c.var;
    if (!(activeOrg && user)) {
      return c.json({ error: "Workspace context is required" }, 403);
    }

    const formData = await c.req.formData();
    const resume = formData.get("resume");
    if (!(resume instanceof File)) {
      return c.json({ error: "缺少简历文件。" }, 400);
    }

    const context = { organizationId: activeOrg.id, userId: user.id };
    try {
      return new Response(streamParseResumeProfile(resume, context), { headers: streamHeaders });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("PDF") || error.message.includes("MB"))
      ) {
        return c.json({ error: error.message, stage: "resume-parsing" }, 400);
      }
      return c.json(
        {
          ...createInternalErrorResponse({
            context,
            error,
            operation: "interview-resume-parse-stream",
            publicMessage: "Failed to parse resume.",
          }),
          stage: "resume-parsing",
        },
        500,
      );
    }
  })
  .post(
    "/match-job-description",
    zValidator(
      "json",
      z.object({
        interviewRecordId: z.string().optional(),
        resumeProfile: resumeProfileSchema,
      }),
      jsonValidatorError("缺少候选人信息 (resumeProfile)。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ error: "Workspace context is required" }, 403);
      }
      const { interviewRecordId, resumeProfile } = c.req.valid("json");

      if (interviewRecordId) {
        const [record] = await db
          .select({ id: studioInterview.id })
          .from(studioInterview)
          .where(
            and(
              eq(studioInterview.id, interviewRecordId),
              eq(studioInterview.organizationId, activeOrg.id),
            ),
          )
          .limit(1);
        if (!record) {
          return c.json({ error: "Interview record not found" }, 404);
        }
      }

      try {
        const jobDescriptions = await listRecruitingJobDescriptions(activeOrg.id);
        const match = await resolveJobDescriptionMatchBestEffort({
          jobDescriptions,
          resumeProfile,
        });
        return c.json(match, 200);
      } catch (error) {
        return c.json(
          createInternalErrorResponse({
            context: { organizationId: activeOrg.id },
            error,
            operation: "interview-job-description-match",
            publicMessage: "在招岗位匹配失败。",
          }),
          500,
        );
      }
    },
  )
  .post(
    "/generate-questions",
    zValidator("json", questionInputSchema, jsonValidatorError("缺少候选人信息 (resumeProfile)。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ error: "Workspace context is required" }, 403);
      }
      const { jobDescriptionId, resumeProfile } = c.req.valid("json");
      const job = jobDescriptionId
        ? await loadRecruitingJobDescriptionById(activeOrg.id, jobDescriptionId)
        : null;
      return new Response(streamGenerateInterviewQuestions(resumeProfile, undefined, { job }), {
        headers: streamHeaders,
      });
    },
  )
  .post(
    "/generate-review",
    zValidator("json", reviewInputSchema, jsonValidatorError("缺少候选人信息 (resumeProfile)。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ error: "Workspace context is required" }, 403);
      }
      const { jobDescriptionId, resumeProfile } = c.req.valid("json");
      const jobDescription = await loadJobDescriptionText(activeOrg.id, jobDescriptionId);
      return new Response(streamGenerateResumeReview({ jobDescription, resumeProfile }), {
        headers: streamHeaders,
      });
    },
  )
  .post(
    "/generate-review-markdown-stream",
    zValidator("json", reviewInputSchema, jsonValidatorError("缺少候选人信息 (resumeProfile)。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ error: "Workspace context is required" }, 403);
      }
      const { jobDescriptionId, resumeProfile } = c.req.valid("json");
      const jobDescription = await loadJobDescriptionText(activeOrg.id, jobDescriptionId);
      return new Response(
        streamGenerateResumeReviewMarkdownFirst({ jobDescription, resumeProfile }),
        { headers: streamHeaders },
      );
    },
  );
