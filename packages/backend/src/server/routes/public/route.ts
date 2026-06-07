// 中文：公开访问入口的只读路由族。挂在 /api/public 下，不依赖 workspace
// auth；对 roundId/candidateId/邀请 token 做一次反查拿到 organizationId，然后复用
// studio 路由族里既有的 DAO 返回完整数据（候选人姓名、简历 PDF、面试报告、
// 录像、表单答卷……）。真人复面的公开入场/结束接口也在这里，因为链接本身
// 已经绑定候选人/面试官身份。
//
// English: Read-only public-access router mounted at /api/public. No
// workspace auth — each handler resolves the owning organizationId from the
// supplied id, then defers to the same studio DAOs the authed routes use.
// Human-interview public join/end endpoints also live here because the invite
// token binds the candidate/interviewer identity.

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "@arc/backend/lib/server/db";
import { getObjectStream, presignRecordingGetObjectUrl } from "@arc/backend/lib/server/s3";
import { interviewConversation, minimaxVoicePreview, studioInterview } from "@arc/db-schema/schema";
import { factory, jsonValidatorError } from "@arc/backend/server/factory";
import { buildTokenErrorResponse } from "@arc/backend/server/routes/interview/utils";
import { loadSubmissionsByInterview } from "@arc/backend/server/routes/studio/routes/forms/dao/submissions";
import { queryInterviewConversationReportsByRound } from "@arc/backend/server/routes/studio/routes/interviews/dao/interview-conversations";
import {
  endHumanInterviewMeeting,
  isHumanInterviewMeetingBeforeScheduledStart,
  isHumanInterviewMeetingAfterValidUntil,
  markHumanInterviewMeetingInProgress,
  resolveHumanInterviewMeetingInterviewerInviteToken,
  resolveHumanInterviewMeetingInviteToken,
} from "@arc/backend/server/routes/studio/routes/interviews/dao/human-interview-meetings";
import {
  listInterviewRoundsForCandidate,
  loadInterviewRoundDetail,
  resolvePublicInterviewScope,
  resolvePublicResumeOrgId,
} from "@arc/backend/server/routes/studio/routes/interviews/dao/interview-rounds";
import {
  deleteHumanInterviewLiveKitRoom,
  HumanInterviewLiveKitConfigError,
  signHumanInterviewMeetingToken,
} from "@arc/backend/server/routes/studio/routes/interviews/utils/human-interview-livekit";
import { loadResumeDetail } from "@arc/backend/server/routes/studio/routes/resumes/dao/resumes";

export const publicRouter = factory
  .createApp()
  .get("/minimax-voice-previews/:id", async (c) => {
    const id = c.req.param("id");
    const [row] = await db
      .select({
        contentType: minimaxVoicePreview.contentType,
        storageKey: minimaxVoicePreview.storageKey,
      })
      .from(minimaxVoicePreview)
      .where(eq(minimaxVoicePreview.id, id))
      .limit(1);

    if (!row) {
      return c.json({ error: "试听音频不存在。" }, 404);
    }

    const object = await getObjectStream(row.storageKey);
    if (!object) {
      return c.json({ error: "试听音频文件已不可用。" }, 404);
    }

    return new Response(object.body, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": row.contentType || object.contentType || "audio/mpeg",
        ...(object.contentLength !== undefined && {
          "Content-Length": String(object.contentLength),
        }),
      },
    });
  })
  .get("/human-interview-meetings/interviewer/:inviteToken", async (c) => {
    const scope = await resolveHumanInterviewMeetingInterviewerInviteToken(
      c.req.param("inviteToken"),
    );
    if (!scope) {
      return c.json({ error: "真人复面链接不可用。" }, 404);
    }
    return c.json(
      {
        interviewerName: scope.interviewerName,
        meetingId: scope.meetingId,
        role: scope.role,
        scheduledAt: scope.scheduledAt,
        status: scope.status,
        title: scope.title,
        validUntil: scope.validUntil,
      },
      200,
    );
  })
  .post("/human-interview-meetings/interviewer/:inviteToken/livekit-token", async (c) => {
    const scope = await resolveHumanInterviewMeetingInterviewerInviteToken(
      c.req.param("inviteToken"),
    );
    if (!scope) {
      return c.json({ error: "真人复面链接不可用。" }, 404);
    }
    if (scope.status === "cancelled" || scope.status === "ended") {
      return c.json({ error: "该真人复面会议已结束或取消。" }, 403);
    }
    if (
      scope.status === "scheduled" &&
      isHumanInterviewMeetingBeforeScheduledStart(scope.scheduledAt)
    ) {
      return c.json({ error: "未到入会时间，面试开始前 5 分钟可进入会议。" }, 403);
    }
    if (isHumanInterviewMeetingAfterValidUntil(scope.validUntil)) {
      return c.json({ error: "该真人复面会议已超过有效时间。" }, 403);
    }
    if (!scope.liveKitRoomName) {
      return c.json({ error: "会议房间尚未初始化。" }, 409);
    }

    try {
      const token = await signHumanInterviewMeetingToken({
        canPublish: scope.role !== "observer",
        metadata: {
          human_interview_meeting_id: scope.meetingId,
          participant_role: scope.role,
          participant_type: "interviewer",
          user_id: scope.userId,
        },
        participantIdentity: `interviewer_${scope.userId}`,
        participantName: scope.interviewerName,
        participantRole: scope.role,
        roomName: scope.liveKitRoomName,
      });
      await markHumanInterviewMeetingInProgress(scope.meetingId);
      return c.json(token, 200);
    } catch (error) {
      if (error instanceof HumanInterviewLiveKitConfigError) {
        return c.json(buildTokenErrorResponse(), 500);
      }
      return c.json(
        {
          detail: error instanceof Error ? error.message : "Unknown error",
          error: "Failed to sign LiveKit token.",
        },
        500,
      );
    }
  })
  .post("/human-interview-meetings/interviewer/:inviteToken/end", async (c) => {
    const scope = await resolveHumanInterviewMeetingInterviewerInviteToken(
      c.req.param("inviteToken"),
    );
    if (!scope) {
      return c.json({ error: "真人复面链接不可用。" }, 404);
    }
    const roomName = await endHumanInterviewMeeting({ meetingId: scope.meetingId });
    try {
      await deleteHumanInterviewLiveKitRoom(roomName);
    } catch (error) {
      if (!(error instanceof HumanInterviewLiveKitConfigError)) {
        console.warn("failed to delete livekit human interview room", error);
      }
    }
    return c.json({ ok: true }, 200);
  })
  .get("/human-interview-meetings/:inviteToken", async (c) => {
    const scope = await resolveHumanInterviewMeetingInviteToken(c.req.param("inviteToken"));
    if (!scope) {
      return c.json({ error: "真人复面链接不可用。" }, 404);
    }
    return c.json(
      {
        candidateName: scope.candidateName,
        meetingId: scope.meetingId,
        roundLabel: scope.roundLabel,
        scheduledAt: scope.scheduledAt,
        status: scope.status,
        title: scope.title,
        validUntil: scope.validUntil,
      },
      200,
    );
  })
  .post("/human-interview-meetings/:inviteToken/livekit-token", async (c) => {
    const scope = await resolveHumanInterviewMeetingInviteToken(c.req.param("inviteToken"));
    if (!scope) {
      return c.json({ error: "真人复面链接不可用。" }, 404);
    }
    if (scope.status === "cancelled" || scope.status === "ended") {
      return c.json({ error: "该真人复面会议已结束或取消。" }, 403);
    }
    if (
      scope.status === "scheduled" &&
      isHumanInterviewMeetingBeforeScheduledStart(scope.scheduledAt)
    ) {
      return c.json({ error: "未到入会时间，面试开始前 5 分钟可进入会议。" }, 403);
    }
    if (isHumanInterviewMeetingAfterValidUntil(scope.validUntil)) {
      return c.json({ error: "该真人复面会议已超过有效时间。" }, 403);
    }
    if (!scope.liveKitRoomName) {
      return c.json({ error: "会议房间尚未初始化。" }, 409);
    }

    try {
      const token = await signHumanInterviewMeetingToken({
        canPublish: true,
        metadata: {
          human_interview_meeting_id: scope.meetingId,
          interview_record_id: scope.interviewRecordId,
          participant_role: "candidate",
          participant_type: "candidate",
          round_id: scope.roundId,
        },
        participantIdentity: `candidate_${scope.roundId}`,
        participantName: scope.candidateName,
        participantRole: "candidate",
        roomName: scope.liveKitRoomName,
      });
      await markHumanInterviewMeetingInProgress(scope.meetingId);
      return c.json(token, 200);
    } catch (error) {
      if (error instanceof HumanInterviewLiveKitConfigError) {
        return c.json(buildTokenErrorResponse(), 500);
      }
      return c.json(
        {
          detail: error instanceof Error ? error.message : "Unknown error",
          error: "Failed to sign LiveKit token.",
        },
        500,
      );
    }
  })
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
