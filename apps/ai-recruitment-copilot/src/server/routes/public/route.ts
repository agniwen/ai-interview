// 中文：公开访问入口的只读路由族。挂在 /api/public 下，不依赖 workspace
// auth；对 roundId/candidateId 做一次反查拿到 organizationId，然后复用
// studio 路由族里既有的 DAO 返回完整数据（候选人姓名、简历 PDF、面试报告、
// 录像、表单答卷……）。任何写操作都不走这里。
//
// English: Read-only public-access router mounted at /api/public. No
// workspace auth — each handler resolves the owning organizationId from the
// supplied id, then defers to the same studio DAOs the authed routes use.
// No write endpoints live here.

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/server/db";
import { getObjectStream, presignRecordingGetObjectUrl } from "@/lib/server/s3";
import { interviewConversation, studioInterview } from "@arc/db-schema/schema";
import { factory, jsonValidatorError } from "@/server/factory";
import { loadSubmissionsByInterview } from "@/server/routes/studio/routes/forms/dao/submissions";
import { queryInterviewConversationReportsByRound } from "@/server/routes/studio/routes/interviews/dao/interview-conversations";
import {
  listInterviewRoundsForCandidate,
  loadInterviewRoundDetail,
  resolvePublicInterviewScope,
  resolvePublicResumeOrgId,
} from "@/server/routes/studio/routes/interviews/dao/interview-rounds";
import { loadResumeDetail } from "@/server/routes/studio/routes/resumes/dao/resumes";

export const publicRouter = factory
  .createApp()
  .get(
    "/interview-rounds/resolve",
    zValidator(
      "query",
      z.object({ id: z.string().trim().min(1) }),
      jsonValidatorError("查询参数无效。"),
    ),
    async (c) => {
      const { id } = c.req.valid("query");
      const scope = await resolvePublicInterviewScope(id);
      if (!scope) {
        return c.json({ error: "记录不存在。" }, 404);
      }
      return c.json({ roundId: scope.roundId }, 200);
    },
  )
  .get("/interview-rounds/:id", async (c) => {
    const roundId = c.req.param("id");
    const scope = await resolvePublicInterviewScope(roundId);
    if (!scope) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const detail = await loadInterviewRoundDetail(scope.roundId, scope.organizationId);
    if (!detail) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    return c.json(detail, 200);
  })
  .get("/interview-rounds/:id/reports", async (c) => {
    const roundId = c.req.param("id");
    const scope = await resolvePublicInterviewScope(roundId);
    if (!scope) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const reports = await queryInterviewConversationReportsByRound(scope.roundId);
    return c.json(reports, 200);
  })
  .get("/interview-rounds/:id/form-submissions", async (c) => {
    const roundId = c.req.param("id");
    const scope = await resolvePublicInterviewScope(roundId);
    if (!scope) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const submissions = await loadSubmissionsByInterview(scope.candidateId);
    return c.json({ submissions }, 200);
  })
  .get("/interview-rounds/:id/recordings/:conversationId", async (c) => {
    const roundId = c.req.param("id");
    const conversationId = c.req.param("conversationId");
    const scope = await resolvePublicInterviewScope(roundId);
    if (!scope) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    const [conversation] = await db
      .select({
        recordingFileKey: interviewConversation.recordingFileKey,
        recordingStatus: interviewConversation.recordingStatus,
        scheduleEntryId: interviewConversation.scheduleEntryId,
      })
      .from(interviewConversation)
      .where(
        and(
          eq(interviewConversation.conversationId, conversationId),
          eq(interviewConversation.organizationId, scope.organizationId),
        ),
      )
      .limit(1);

    if (!conversation || conversation.scheduleEntryId !== scope.roundId) {
      return c.json({ error: "未找到该轮录像。" }, 404);
    }
    if (!conversation.recordingFileKey) {
      return c.json({ error: "本轮面试没有录像文件。" }, 404);
    }
    if (conversation.recordingStatus !== "completed") {
      return c.json(
        {
          error: "录像尚未生成完成, 请稍后再试。",
          status: conversation.recordingStatus ?? "unknown",
        },
        409,
      );
    }

    try {
      const url = await presignRecordingGetObjectUrl(conversation.recordingFileKey, 600);
      return c.json({ expiresInSeconds: 600, url }, 200);
    } catch (error) {
      return c.json(
        {
          detail: error instanceof Error ? error.message : "Unknown error",
          error: "无法生成录像访问链接。",
        },
        500,
      );
    }
  })
  .get("/interview-rounds/:id/resume", async (c) => {
    // PDF 二进制流。和 authed 路由 /studio/interviews/:id/resume 行为一致。
    // PDF binary stream — mirrors /studio/interviews/:id/resume.
    const roundId = c.req.param("id");
    const scope = await resolvePublicInterviewScope(roundId);
    if (!scope) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const [row] = await db
      .select({
        resumeFileName: studioInterview.resumeFileName,
        resumeStorageKey: studioInterview.resumeStorageKey,
      })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, scope.candidateId),
          eq(studioInterview.organizationId, scope.organizationId),
        ),
      )
      .limit(1);
    if (!row?.resumeStorageKey) {
      return c.json({ error: "该候选人没有可预览的简历 PDF。" }, 404);
    }
    const object = await getObjectStream(row.resumeStorageKey);
    if (!object) {
      return c.json({ error: "简历文件已不可用。" }, 404);
    }
    const filename = row.resumeFileName || "resume.pdf";
    return new Response(object.body, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        "Content-Type": object.contentType ?? "application/pdf",
        ...(object.contentLength !== undefined && {
          "Content-Length": String(object.contentLength),
        }),
      },
    });
  })
  .get("/resumes/:id", async (c) => {
    const candidateId = c.req.param("id");
    const organizationId = await resolvePublicResumeOrgId(candidateId);
    if (!organizationId) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const record = await loadResumeDetail(candidateId, organizationId);
    if (!record) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    return c.json(record, 200);
  })
  .get("/resumes/:id/rounds", async (c) => {
    const candidateId = c.req.param("id");
    const organizationId = await resolvePublicResumeOrgId(candidateId);
    if (!organizationId) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const rounds = await listInterviewRoundsForCandidate(candidateId, organizationId);
    return c.json(rounds, 200);
  });
