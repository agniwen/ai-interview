// 中文：公开访问入口路由族。挂在 /api/public 下，不依赖 workspace
// auth；对 roundId/candidateId/邀请 token 做一次反查拿到 organizationId，然后复用
// studio 路由族里既有的 DAO 返回完整数据（候选人姓名、简历 PDF、面试报告、
// 录像、表单答卷……）。真人复面的公开入场/结束接口也在这里，因为链接本身
// 已经绑定候选人/面试官身份。
//
// English: Public-access router mounted at /api/public. No
// workspace auth — each handler resolves the owning organizationId from the
// supplied id, then defers to the same studio DAOs the authed routes use.
// Human-interview public join/end endpoints also live here because the invite
// token binds the candidate/interviewer identity.

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../../../lib/server/db/index";
import { getObjectBytes, getObjectStream, presignRecordingGetObjectUrl } from "@app/object-storage";
import { interviewConversation, minimaxVoicePreview, studioInterview } from "@app/db-schema/schema";
import { factory, jsonValidatorError } from "../../factory";
import { createInternalErrorResponse } from "../../error-handler";
import {
  buildTokenErrorResponse,
  normalizeResumeFile,
  storeResumeObjectOnly,
} from "../interview/utils";
import { loadSubmissionsByInterview } from "../studio/routes/forms/dao/submissions";
import {
  queryInterviewConversationReportByRound,
  queryInterviewConversationReportsByRound,
} from "../studio/routes/interviews/dao/interview-conversations";
import {
  endHumanInterviewMeeting,
  isHumanInterviewMeetingBeforeScheduledStart,
  isHumanInterviewMeetingAfterValidUntil,
  resolveHumanInterviewMeetingInterviewerInviteToken,
  resolveHumanInterviewMeetingInviteToken,
} from "../studio/routes/interviews/dao/human-interview-meetings";
import {
  listInterviewRoundsForCandidate,
  loadInterviewRoundDetail,
  resolvePublicInterviewScope,
  resolvePublicResumeOrgId,
} from "../studio/routes/interviews/dao/interview-rounds";
import { createPptxPreviewPdfResponse } from "../studio/utils/pptx-preview";
import {
  deleteHumanInterviewLiveKitRoom,
  HumanInterviewLiveKitConfigError,
  signHumanInterviewMeetingToken,
} from "../studio/routes/interviews/utils/human-interview-livekit";
import { stopActiveHumanInterviewRecording } from "../studio/routes/interviews/utils/human-interview-recording-service";
import { loadResumeDetail } from "../studio/routes/resumes/dao/resumes";
import type { PublicReferralUploadResult } from "@app/shared/referrals";
import {
  handleHumanInterviewInvitationResponseError,
  isCurrentHumanInterviewInvitationToken,
  recordHumanInterviewInvitationException,
  respondHumanInterviewCandidateInvitation,
} from "../studio/routes/interviews/dao/human-interview-candidate-response";
import { aiInterviewInvitationsRouter } from "./routes/ai-interview-invitations/route";
import { humanInterviewCandidateMaterialsRouter } from "./routes/human-interview-candidate-materials/route";
import { humanInterviewLiveTranscriptRouter } from "./routes/human-interview-live-transcript/route";
import { validateResumeFile } from "../../agents/resume-analysis-agent";
import {
  cancelBatch,
  insertBatchWithItems,
  loadBatchDetail,
} from "../studio/routes/resume-upload-batches/dao/batches";
import {
  resolveReferralLink,
  toPublicReferralPreview,
} from "../studio/routes/job-descriptions/dao/referral-links";

async function getResumeParseQueueApi() {
  return await import("@app/resume-parse-queue/resume-parse");
}

export interface PublicRouterDependencies {
  getObjectStream: typeof getObjectStream;
  loadVoicePreview(id: string): Promise<{ contentType: string; storageKey: string } | null>;
  resolveReferralLink: typeof resolveReferralLink;
}

const defaultDependencies: PublicRouterDependencies = {
  getObjectStream,
  async loadVoicePreview(id) {
    const [row] = await db
      .select({
        contentType: minimaxVoicePreview.contentType,
        storageKey: minimaxVoicePreview.storageKey,
      })
      .from(minimaxVoicePreview)
      .where(eq(minimaxVoicePreview.id, id))
      .limit(1);
    return row ?? null;
  },
  resolveReferralLink,
};

export function createPublicRouter(overrides: Partial<PublicRouterDependencies> = {}) {
  const dependencies: PublicRouterDependencies = { ...defaultDependencies, ...overrides };
  return factory
    .createApp()
    .route("/human-interview-candidate-materials", humanInterviewCandidateMaterialsRouter)
    .get("/referrals/:token", async (c) => {
      const link = await dependencies.resolveReferralLink(c.req.param("token"));
      if (!link) {
        return c.json({ error: "内推链接不可用。" }, 404);
      }
      return c.json(toPublicReferralPreview(link), 200);
    })
    .post("/referrals/:token/resumes", async (c) => {
      const link = await dependencies.resolveReferralLink(c.req.param("token"));
      if (!link) {
        return c.json({ error: "内推链接不可用。" }, 404);
      }
      let formData: FormData;
      try {
        formData = await c.req.formData();
      } catch {
        return c.json({ error: "请求体必须是 multipart/form-data。" }, 400);
      }
      const file = normalizeResumeFile(formData.get("resume"));
      if (!file) {
        return c.json({ error: "请上传简历文件。" }, 400);
      }
      try {
        validateResumeFile(file);
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : "文件无效。" }, 400);
      }

      const { enqueueResumeParseJobs, isResumeParseQueueConfigured } =
        await getResumeParseQueueApi();
      if (!isResumeParseQueueConfigured()) {
        return c.json({ error: "简历解析队列暂不可用，请稍后重试。" }, 503);
      }

      const stored = await storeResumeObjectOnly(file, link.createdBy, link.organizationId);
      if (!stored?.storageKey) {
        return c.json({ error: "文件上传失败，请重试。" }, 500);
      }

      const batchId = await insertBatchWithItems({
        dedupPolicy: "create",
        files: [
          {
            contentHash: stored.contentHash,
            fileSize: file.size,
            originalFileName: file.name,
            storageKey: stored.storageKey,
          },
        ],
        jdMode: "bind",
        jobDescriptionId: link.jobDescriptionId,
        organizationId: link.organizationId,
        referralTargetRole: link.jobDescriptionName,
        resumePoolScope: "public",
        sourceChannel: "referral",
        target: "resume_pool",
        userId: link.createdBy,
      });
      const detail = await loadBatchDetail(batchId, link.organizationId, link.createdBy);
      if (!detail) {
        return c.json({ error: "内推简历提交失败。" }, 500);
      }

      try {
        await enqueueResumeParseJobs(
          detail.items.map((item) => ({
            batchId,
            itemId: item.id,
            organizationId: link.organizationId,
            userId: link.createdBy,
          })),
        );
      } catch (error) {
        console.error("[referral-upload] enqueue failed:", error);
        await cancelBatch(batchId, link.organizationId, link.createdBy);
        return c.json({ error: "简历解析队列入队失败，请稍后重试。" }, 503);
      }

      return c.json(
        {
          batchId,
          poolItemId: detail.items[0]?.poolItemId ?? null,
          status: "queued",
        } satisfies PublicReferralUploadResult,
        201,
      );
    })
    .get("/minimax-voice-previews/:id", async (c) => {
      const id = c.req.param("id");
      const row = await dependencies.loadVoicePreview(id);

      if (!row) {
        return c.json({ error: "试听音频不存在。" }, 404);
      }

      const object = await dependencies.getObjectStream(row.storageKey);
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
    .route("/ai-interview-invitations", aiInterviewInvitationsRouter)
    .route("/human-interview-meetings/interviewer", humanInterviewLiveTranscriptRouter)
    .get("/human-interview-meetings/interviewer/:inviteToken", async (c) => {
      const scope = await resolveHumanInterviewMeetingInterviewerInviteToken(
        c.req.param("inviteToken"),
      );
      if (!scope) {
        return c.json({ error: "真人复面链接不可用。" }, 404);
      }
      return c.json(
        {
          candidateName: scope.candidateName,
          interviewerName: scope.interviewerName,
          meetingId: scope.meetingId,
          recordingStatus: scope.recordingStatus,
          role: scope.role,
          roundLabel: scope.roundLabel,
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
        return c.json(token, 200);
      } catch (error) {
        if (error instanceof HumanInterviewLiveKitConfigError) {
          return c.json(buildTokenErrorResponse(), 500);
        }
        return c.json(
          createInternalErrorResponse({
            context: { meetingId: scope.meetingId },
            error,
            operation: "public-interviewer-livekit-token",
            publicMessage: "Failed to sign LiveKit token.",
          }),
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
      try {
        await stopActiveHumanInterviewRecording(scope.meetingId);
      } catch (error) {
        console.warn("failed to stop livekit human interview recording", error);
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
      const inviteToken = c.req.param("inviteToken");
      const scope = await resolveHumanInterviewMeetingInviteToken(inviteToken);
      if (!scope) {
        const expired = await isCurrentHumanInterviewInvitationToken(inviteToken);
        if (expired) {
          await recordHumanInterviewInvitationException({
            exceptionType: "invitation_expired",
            inviteToken,
          }).catch((error) => {
            console.error("[human-invitation-expired-notification] failed", { error });
          });
          return c.json(
            { code: "invitation_expired", error: "真人复面邀请已过期，请联系招聘负责人。" },
            410,
          );
        }
        return c.json({ error: "真人复面链接不可用。" }, 404);
      }
      return c.json(
        {
          candidateInviteStatus: scope.candidateInviteStatus,
          candidateName: scope.candidateName,
          meetingId: scope.meetingId,
          recordingStatus: scope.recordingStatus,
          roundLabel: scope.roundLabel,
          scheduledAt: scope.scheduledAt,
          status: scope.status,
          title: scope.title,
          validUntil: scope.validUntil,
        },
        200,
      );
    })
    .post(
      "/human-interview-meetings/:inviteToken/respond",
      zValidator(
        "json",
        z.object({
          action: z.enum(["accept", "decline"]),
          declineReason: z.string().trim().max(500).nullable().optional(),
        }),
        jsonValidatorError("邀请响应无效。"),
      ),
      async (c) => {
        const inviteToken = c.req.param("inviteToken");
        try {
          const result = await respondHumanInterviewCandidateInvitation({
            ...c.req.valid("json"),
            inviteToken,
          });
          return c.json(result, 200);
        } catch (error) {
          const response = await handleHumanInterviewInvitationResponseError(error, inviteToken);
          return c.json(response.body, response.status);
        }
      },
    )
    .post("/human-interview-meetings/:inviteToken/livekit-token", async (c) => {
      const scope = await resolveHumanInterviewMeetingInviteToken(c.req.param("inviteToken"));
      if (!scope) {
        return c.json({ error: "真人复面链接不可用。" }, 404);
      }
      if (scope.status === "cancelled" || scope.status === "ended") {
        return c.json({ error: "该真人复面会议已结束或取消。" }, 403);
      }
      if (scope.candidateInviteStatus !== "accepted") {
        return c.json({ error: "请先确认参加面试。" }, 403);
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
        return c.json(token, 200);
      } catch (error) {
        if (error instanceof HumanInterviewLiveKitConfigError) {
          return c.json(buildTokenErrorResponse(), 500);
        }
        return c.json(
          createInternalErrorResponse({
            context: { meetingId: scope.meetingId },
            error,
            operation: "public-candidate-livekit-token",
            publicMessage: "Failed to sign LiveKit token.",
          }),
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
      return c.json({ ...detail, candidateFeedback: null }, 200);
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
    .get("/interview-rounds/:id/reports/:conversationId", async (c) => {
      const roundId = c.req.param("id");
      const conversationId = c.req.param("conversationId");
      const scope = await resolvePublicInterviewScope(roundId);
      if (!scope) {
        return c.json({ error: "记录不存在。" }, 404);
      }
      const report = await queryInterviewConversationReportByRound(scope.roundId, conversationId);
      if (!report) {
        return c.json({ error: "面试记录不存在。" }, 404);
      }
      return c.json(report, 200);
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
          createInternalErrorResponse({
            context: { conversationId, roundId: scope.roundId },
            error,
            operation: "public-recording-presign",
            publicMessage: "无法生成录像访问链接。",
          }),
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
        return c.json({ error: "该候选人没有可预览的简历文件。" }, 404);
      }
      const object = await dependencies.getObjectStream(row.resumeStorageKey);
      if (!object) {
        return c.json({ error: "简历文件已不可用。" }, 404);
      }
      const filename = row.resumeFileName || "resume.pdf";
      return new Response(object.body, {
        headers: {
          "Cache-Control": "private, max-age=300",
          "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
          "Content-Type": object.contentType ?? "application/octet-stream",
          ...(object.contentLength !== undefined && {
            "Content-Length": String(object.contentLength),
          }),
        },
      });
    })
    .get("/interview-rounds/:id/resume-preview.pdf", async (c) => {
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
        return c.json({ error: "该候选人没有可预览的简历文件。" }, 404);
      }
      const object = await getObjectBytes(row.resumeStorageKey);
      if (!object) {
        return c.json({ error: "简历文件已不可用。" }, 404);
      }
      return createPptxPreviewPdfResponse({
        bytes: object.bytes,
        cacheKey: row.resumeStorageKey,
        fileName: row.resumeFileName,
        mediaType: object.contentType,
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
}

export const publicRouter = createPublicRouter();
