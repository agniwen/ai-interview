/* oxlint-disable complexity, max-lines -- collection router coordinates validation, persistence, and access policy. */
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { resolveRecruitingVisibilityScope } from "../../../../access/recruiting-visibility";
import type { RecruitingVisibilityScope } from "../../../../access/recruiting-visibility";
import {
  humanInterviewMeetingInputSchema,
  humanInterviewMeetingScheduleUpdateSchema,
} from "@app/db-schema/studio-interviews";
import { factory, jsonValidatorError } from "../../../../factory";
import { createInternalErrorResponse } from "../../../../error-handler";
import {
  createHumanInterviewMeeting,
  endHumanInterviewMeeting,
  HumanInterviewMeetingError,
  isHumanInterviewMeetingAfterValidUntil,
  isHumanInterviewMeetingBeforeScheduledStart,
  issueHumanInterviewMeetingLinks,
  listHumanInterviewMeetings,
  loadHumanInterviewMeetingById,
} from "./dao/human-interview-meetings";
import { cancelHumanInterviewMeeting } from "./dao/human-interview-meeting-cancellation";
import { updateHumanInterviewMeetingSchedule } from "./dao/human-interview-meeting-schedule";
import {
  deleteHumanInterviewLiveKitRoom,
  HumanInterviewLiveKitConfigError,
  signHumanInterviewMeetingToken,
} from "./utils/human-interview-livekit";
import { stopActiveHumanInterviewRecordingByRoomName } from "./utils/human-interview-recording-service";
import { getFeishuTenantAccessToken } from "../../../../../lib/server/feishu-access-token";
import {
  getFeishuAppCredentials,
  isFeishuHumanInterviewEnabled,
} from "../../../../integrations/feishu/provider";
import {
  isFeishuSyncConflictError,
  recordFeishuHumanInterviewSyncFailure,
  resolveHumanInterviewFeishuProviderId,
  syncHumanInterviewMeetingToFeishu,
} from "./utils/feishu-human-interview-meeting";
import { recordCandidateActivity } from "./utils/candidate-activity";
import { resolveCandidateIdForRound, resolveRoundIdFromRecordId } from "./dao/interview-rounds";
import { buildTokenErrorResponse } from "../../../interview/utils";
import { requirePermission } from "../../../../middlewares/permission";
import { invalidateStudioInterviewCaches } from "../../../../cache-tags";
import { requireHumanMeetingUpdateAccess } from "./utils/human-meeting-update-access";
import { loadHumanInterviewMeetingInterviewerIds } from "./dao/human-interview-meeting-input";

// 候选人阶段流转输入。强制 outcome 与 pipelineStage 的不变量：
//   pipelineStage='closed' ⇔ outcome ∈ {hired,rejected,withdrawn,archived}
// 其余阶段下 outcome 必须省略或为 in_pipeline；closedReason 仅 closed 阶段允许。
//
// Candidate stage transition input. Encodes the (pipelineStage, outcome)
// invariant: closed ⇔ a terminal outcome; everything else stays in_pipeline.

// 真人复面：「标记完成」的 input。outcome / feedback 必填，score 可选。
// Human interview "mark complete" input. Outcome required.

// 真人复面：「取消」的 input。reason 可选，便于后续审计 / 通知候选人。
// Human interview "cancel" input; reason optional.

const humanMeetingTokenInputSchema = z.object({
  interviewerId: z.string().trim().min(1).optional(),
});

function loadVisibilityScope(
  organizationId: string,
  currentRole: string | null | undefined,
  userId: string | undefined,
): Promise<RecruitingVisibilityScope> {
  if (!userId) {
    return Promise.resolve({ kind: "none" });
  }
  return resolveRecruitingVisibilityScope({ currentRole, organizationId, userId });
}

export function createStudioInterviewCollectionRouter(dependencies?: {
  humanMeetingUpdateAccess?: typeof requireHumanMeetingUpdateAccess;
  permission: typeof requirePermission;
}) {
  const permission = dependencies?.permission ?? requirePermission;
  const humanMeetingUpdateAccess =
    dependencies?.humanMeetingUpdateAccess ?? requireHumanMeetingUpdateAccess;
  return (
    factory
      .createApp()
      .post("/", permission("interview", "create"), (c) => {
        if (!c.var.activeOrg) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        // 新面试必须基于已经人工筛选通过的招聘记录，不能通过新建候选人绕过筛选。
        return c.json({ error: "请先在招聘台添加简历并筛选通过，再发起 AI 面试。" }, 409);
      })
      .get(
        "/resolve",
        permission("interview", "read"),
        zValidator(
          "query",
          z.object({ id: z.string().trim().min(1) }),
          jsonValidatorError("查询参数无效。"),
        ),
        async (c) => {
          // 兼容历史链接：传入 id 既可能是 roundId,也可能是 candidateId
          // (studio_interview.id),统一解析成 roundId。命中失败返回 404。
          // Back-compat resolver: external id can be either a roundId or a
          // legacy candidateId (studio_interview.id). Returns 404 on miss.
          const { activeOrg } = c.var;
          if (!activeOrg) {
            return c.json({ message: "Unauthorized" }, 401);
          }
          const { id } = c.req.valid("query");
          const visibilityScope = await loadVisibilityScope(
            activeOrg.id,
            c.var.member?.role,
            c.var.user?.id,
          );
          const roundId = await resolveRoundIdFromRecordId(id, activeOrg.id);
          const visibleRoundId = roundId
            ? await resolveCandidateIdForRound(roundId, activeOrg.id, visibilityScope)
            : null;
          if (!roundId || !visibleRoundId) {
            return c.json({ error: "记录不存在。" }, 404);
          }
          return c.json({ roundId }, 200);
        },
      )
      // ── 真人复面会议 endpoints ──
      // 静态路径必须放在 `/:id` 前面，否则会被当作 roundId 命中详情路由。
      // Static routes must stay before `/:id`; otherwise Hono treats the segment as a roundId.
      .get(
        "/human-interview-meetings",
        permission("humanInterview", "read"),
        zValidator(
          "query",
          z.object({
            interviewRecordId: z.string().trim().optional(),
          }),
          jsonValidatorError("查询参数无效。"),
        ),
        async (c) => {
          const { activeOrg } = c.var;
          if (!activeOrg) {
            return c.json({ message: "Unauthorized" }, 401);
          }
          const { interviewRecordId } = c.req.valid("query");
          const meetings = await listHumanInterviewMeetings({
            interviewRecordId,
            organizationId: activeOrg.id,
          });
          return c.json(meetings, 200);
        },
      )
      .post(
        "/human-interview-meetings",
        permission("humanInterview", "create"),
        zValidator(
          "json",
          humanInterviewMeetingInputSchema,
          jsonValidatorError("真人复面会议参数无效。"),
        ),
        async (c) => {
          const { activeOrg, user } = c.var;
          if (!activeOrg || !user) {
            return c.json({ message: "Unauthorized" }, 401);
          }
          try {
            const feishuEnabled = isFeishuHumanInterviewEnabled();
            const input = c.req.valid("json");
            const interviewerIds = await loadHumanInterviewMeetingInterviewerIds(input.roundIds);
            const providerId =
              feishuEnabled && interviewerIds.length > 0
                ? await resolveHumanInterviewFeishuProviderId({
                    interviewerIds,
                    organizationId: activeOrg.id,
                  })
                : null;
            const created = await createHumanInterviewMeeting({
              createdBy: user.id,
              feishuProviderId: providerId,
              input,
              organizationId: activeOrg.id,
            });
            if (!feishuEnabled || !providerId) {
              invalidateStudioInterviewCaches(activeOrg.id);
              return c.json(created, 200);
            }
            let synced;
            try {
              const credentials = getFeishuAppCredentials(providerId);
              const accessToken = await getFeishuTenantAccessToken(
                credentials.appId,
                credentials.appSecret,
              );
              synced = await syncHumanInterviewMeetingToFeishu({
                accessToken,
                meetingId: created.id,
                organizationId: activeOrg.id,
                providerId,
              });
            } catch (error) {
              if (isFeishuSyncConflictError(error)) {
                return c.json(
                  {
                    error: error.message,
                    feishuStatus: error.feishuStatus,
                    meetingId: created.id,
                  },
                  409,
                );
              }
              const failure = await recordFeishuHumanInterviewSyncFailure({
                error,
                meetingId: created.id,
                organizationId: activeOrg.id,
              });
              return c.json(
                {
                  error: failure.message,
                  feishuStatus: failure.status,
                  meetingId: created.id,
                },
                502,
              );
            }
            invalidateStudioInterviewCaches(activeOrg.id);
            return c.json(synced, 200);
          } catch (error) {
            if (error instanceof HumanInterviewMeetingError) {
              return c.json({ error: error.message }, error.status);
            }
            throw error;
          }
        },
      )
      .patch(
        "/human-interview-meetings/:meetingId",
        humanMeetingUpdateAccess(),
        zValidator(
          "json",
          humanInterviewMeetingScheduleUpdateSchema,
          jsonValidatorError("真人复面会议时间参数无效。"),
        ),
        async (c) => {
          const { activeOrg, user } = c.var;
          if (!activeOrg || !user) {
            return c.json({ message: "Unauthorized" }, 401);
          }
          const meetingId = c.req.param("meetingId");
          try {
            const updated = await updateHumanInterviewMeetingSchedule({
              actorUserId: user.id,
              input: c.req.valid("json"),
              meetingId,
              organizationId: activeOrg.id,
            });
            await Promise.all(
              updated.rounds.map((round) =>
                recordCandidateActivity({
                  action: "human_interview_round_updated",
                  detail: {
                    roundId: round.roundId,
                    roundLabel: round.label,
                    scheduledAt: updated.scheduledAt,
                  },
                  interviewRecordId: round.interviewRecordId,
                  operatorId: user.id,
                  organizationId: activeOrg.id,
                }),
              ),
            );
            invalidateStudioInterviewCaches(activeOrg.id);
            if (!isFeishuHumanInterviewEnabled() || !updated.feishu) {
              return c.json(updated, 200);
            }

            try {
              const credentials = getFeishuAppCredentials(updated.feishu.providerId);
              const accessToken = await getFeishuTenantAccessToken(
                credentials.appId,
                credentials.appSecret,
              );
              const synced = await syncHumanInterviewMeetingToFeishu({
                accessToken,
                meetingId,
                organizationId: activeOrg.id,
                providerId: updated.feishu.providerId,
              });
              return c.json(synced, 200);
            } catch (error) {
              if (isFeishuSyncConflictError(error)) {
                return c.json(
                  {
                    error: error.message,
                    feishuStatus: error.feishuStatus,
                    meetingId,
                  },
                  409,
                );
              }
              const failure = await recordFeishuHumanInterviewSyncFailure({
                error,
                meetingId,
                organizationId: activeOrg.id,
              });
              return c.json(
                {
                  error: failure.message,
                  feishuStatus: failure.status,
                  meetingId,
                },
                502,
              );
            }
          } catch (error) {
            if (error instanceof HumanInterviewMeetingError) {
              return c.json({ error: error.message }, error.status);
            }
            throw error;
          }
        },
      )
      .post(
        "/human-interview-meetings/:meetingId/feishu-sync",
        permission("humanInterview", "update"),
        async (c) => {
          const { activeOrg, user } = c.var;
          if (!activeOrg || !user) {
            return c.json({ message: "Unauthorized" }, 401);
          }
          if (!isFeishuHumanInterviewEnabled()) {
            return c.json({ error: "飞书真人面试功能未启用。" }, 409);
          }
          const meetingId = c.req.param("meetingId");
          const meeting = await loadHumanInterviewMeetingById(meetingId, activeOrg.id);
          if (!meeting) {
            return c.json({ error: "真人复面会议不存在。" }, 404);
          }
          if (!meeting.feishu) {
            return c.json({ error: "该真人复面会议尚未配置飞书同步。" }, 400);
          }
          if (meeting.feishu.status === "ready") {
            return c.json(meeting, 200);
          }
          if (meeting.feishu.status === "unknown") {
            return c.json(
              {
                error: "历史飞书同步结果未知，请先在飞书中核查，不能直接重试。",
                feishuStatus: "unknown" as const,
                meetingId,
              },
              409,
            );
          }

          try {
            const credentials = getFeishuAppCredentials(meeting.feishu.providerId);
            const accessToken = await getFeishuTenantAccessToken(
              credentials.appId,
              credentials.appSecret,
            );
            const synced = await syncHumanInterviewMeetingToFeishu({
              accessToken,
              meetingId,
              organizationId: activeOrg.id,
              providerId: meeting.feishu.providerId,
            });
            invalidateStudioInterviewCaches(activeOrg.id);
            return c.json(synced, 200);
          } catch (error) {
            if (isFeishuSyncConflictError(error)) {
              return c.json(
                {
                  error: error.message,
                  feishuStatus: error.feishuStatus,
                  meetingId,
                },
                409,
              );
            }
            const failure = await recordFeishuHumanInterviewSyncFailure({
              error,
              meetingId,
              organizationId: activeOrg.id,
            });
            return c.json(
              {
                error: failure.message,
                feishuStatus: failure.status,
                meetingId,
              },
              502,
            );
          }
        },
      )
      .post(
        "/human-interview-meetings/:meetingId/links",
        permission("humanInterview", "read"),
        async (c) => {
          const { activeOrg } = c.var;
          if (!activeOrg) {
            return c.json({ message: "Unauthorized" }, 401);
          }
          try {
            const links = await issueHumanInterviewMeetingLinks({
              meetingId: c.req.param("meetingId"),
              organizationId: activeOrg.id,
            });
            return c.json(links, 200);
          } catch (error) {
            if (error instanceof HumanInterviewMeetingError) {
              return c.json({ error: error.message }, error.status);
            }
            throw error;
          }
        },
      )
      .post(
        "/human-interview-meetings/:meetingId/livekit-token",
        permission("humanInterview", "read"),
        zValidator("json", humanMeetingTokenInputSchema, jsonValidatorError("会议入场参数无效。")),
        async (c) => {
          const { activeOrg, user } = c.var;
          if (!activeOrg || !user) {
            return c.json({ message: "Unauthorized" }, 401);
          }

          const meeting = await loadHumanInterviewMeetingById(
            c.req.param("meetingId"),
            activeOrg.id,
          );
          if (!meeting) {
            return c.json({ error: "真人复面会议不存在。" }, 404);
          }
          if (meeting.status === "cancelled" || meeting.status === "ended") {
            return c.json({ error: "该真人复面会议已结束或取消。" }, 403);
          }
          if (
            meeting.status === "scheduled" &&
            isHumanInterviewMeetingBeforeScheduledStart(meeting.scheduledAt)
          ) {
            return c.json({ error: "未到入会时间，面试开始前 5 分钟可进入会议。" }, 403);
          }
          if (isHumanInterviewMeetingAfterValidUntil(meeting.validUntil)) {
            return c.json({ error: "该真人复面会议已超过有效时间。" }, 403);
          }

          const { interviewerId } = c.req.valid("json");
          const resolvedInterviewerId = interviewerId ?? user.id;
          if (resolvedInterviewerId !== user.id) {
            return c.json({ error: "请使用本人账号打开该面试官链接。" }, 403);
          }

          const meetingInterviewer = meeting.interviewers.find(
            (item) => item.id === resolvedInterviewerId,
          );
          if (!meetingInterviewer) {
            return c.json({ error: "你不是该会议的面试官。" }, 403);
          }
          if (!meeting.liveKitRoomName) {
            return c.json({ error: "会议房间尚未初始化。" }, 409);
          }

          try {
            const token = await signHumanInterviewMeetingToken({
              canPublish: meetingInterviewer.role !== "observer",
              metadata: {
                human_interview_meeting_id: meeting.id,
                participant_role: meetingInterviewer.role,
                participant_type: "interviewer",
                user_id: meetingInterviewer.id,
              },
              participantIdentity: `interviewer_${meetingInterviewer.id}`,
              participantName: meetingInterviewer.name,
              participantRole: meetingInterviewer.role,
              roomName: meeting.liveKitRoomName,
            });
            return c.json(token, 200);
          } catch (error) {
            if (error instanceof HumanInterviewLiveKitConfigError) {
              return c.json(buildTokenErrorResponse(), 500);
            }
            return c.json(
              createInternalErrorResponse({
                context: { meetingId: meeting.id },
                error,
                operation: "studio-interviewer-livekit-token",
                publicMessage: "Failed to sign LiveKit token.",
              }),
              500,
            );
          }
        },
      )
      .post(
        "/human-interview-meetings/:meetingId/end",
        permission("humanInterview", "update"),
        async (c) => {
          const { activeOrg } = c.var;
          if (!activeOrg) {
            return c.json({ message: "Unauthorized" }, 401);
          }
          try {
            const roomName = await endHumanInterviewMeeting({
              meetingId: c.req.param("meetingId"),
              organizationId: activeOrg.id,
            });
            if (roomName) {
              try {
                await stopActiveHumanInterviewRecordingByRoomName(roomName);
              } catch (error) {
                console.warn("failed to stop livekit human interview recording", error);
              }
            }
            try {
              await deleteHumanInterviewLiveKitRoom(roomName);
            } catch (error) {
              if (!(error instanceof HumanInterviewLiveKitConfigError)) {
                console.warn("failed to delete livekit human interview room", error);
              }
            }
            invalidateStudioInterviewCaches(activeOrg.id);
            return c.json({ ok: true }, 200);
          } catch (error) {
            if (error instanceof HumanInterviewMeetingError) {
              return c.json({ error: error.message }, error.status);
            }
            throw error;
          }
        },
      )
      .delete(
        "/human-interview-meetings/:meetingId",
        permission("humanInterview", "delete"),
        async (c) => {
          const { activeOrg, user } = c.var;
          if (!activeOrg || !user) {
            return c.json({ message: "Unauthorized" }, 401);
          }
          try {
            const roomName = await cancelHumanInterviewMeeting({
              actorUserId: user.id,
              meetingId: c.req.param("meetingId"),
              organizationId: activeOrg.id,
            });
            if (roomName) {
              try {
                await stopActiveHumanInterviewRecordingByRoomName(roomName);
              } catch (error) {
                console.warn("failed to stop livekit human interview recording", error);
              }
            }
            try {
              await deleteHumanInterviewLiveKitRoom(roomName);
            } catch (error) {
              if (!(error instanceof HumanInterviewLiveKitConfigError)) {
                console.warn("failed to delete livekit human interview room", error);
              }
            }
            invalidateStudioInterviewCaches(activeOrg.id);
            return c.json({ ok: true }, 200);
          } catch (error) {
            if (error instanceof HumanInterviewMeetingError) {
              return c.json({ error: error.message }, error.status);
            }
            throw error;
          }
        },
      )
  );
}

export const studioInterviewCollectionRouter = createStudioInterviewCollectionRouter();
