import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";
import { eq, sql } from "drizzle-orm";
import { AccessToken } from "livekit-server-sdk";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  buildRecordingFileKey,
  isRecordingStorageConfigured,
} from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import {
  candidateFormSubmission,
  interviewConversation,
  studioInterviewSchedule,
} from "@arc/db-schema/schema";
import { buildCandidateFormAnswersSchema } from "@arc/db-schema/candidate-forms";
import { RECONNECT_GRACE_MS } from "@arc/db-schema/studio-interviews";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { createInternalErrorResponse } from "@arc/ai-recruitment-copilot-backend/server/error-handler";
import { loadSubmittedTemplateIds } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/forms/dao/submissions";
import { loadActiveInterviewContextSnapshot } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/context-snapshots";
import {
  cacheTags,
  lookupOrgIdByInterviewRecord,
  safeUpdateTag,
} from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import { resolveInterviewRecordingEnabled } from "@arc/shared/interview/recording-config";
import { INTERVIEW_END_REASON } from "@arc/shared/interview/end-reason";
import {
  buildInterviewDispatchMetadata,
  selectInterviewDispatchInterviewer,
} from "@arc/shared/interview/dispatch-contract";
import {
  buildTokenErrorResponse,
  loadCandidateInterviewRecord,
  loadScheduleEntriesForRedirect,
} from "./utils";
import { candidateInterviewFeedbackRouter } from "./routes/feedback/route";
import { resolveAiInterviewAccess } from "./utils/ai-interview-access";
import {
  enqueueAiInterviewCompletedEvent,
  enqueueAiInvitationResponseEvent,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-notifications/utils/events";
import { isInterviewNotificationFlowEnabled } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-notifications/utils/feature-flags";

type InterviewTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const CANDIDATE_CLICKED_END_METADATA = JSON.stringify({
  closeReason: INTERVIEW_END_REASON.CANDIDATE_CLICKED_END,
});

async function recordCandidateClickedEnd(
  tx: InterviewTransaction,
  input: {
    conversationId: string;
    interviewRecordId: string;
    now: Date;
    organizationId: string;
    roundId: string;
  },
): Promise<void> {
  await tx
    .insert(interviewConversation)
    .values({
      conversationId: input.conversationId,
      endedAt: input.now,
      interviewRecordId: input.interviewRecordId,
      lastSyncedAt: input.now,
      metadata: { closeReason: INTERVIEW_END_REASON.CANDIDATE_CLICKED_END },
      mode: "voice",
      organizationId: input.organizationId,
      scheduleEntryId: input.roundId,
      status: "completed",
    })
    .onConflictDoUpdate({
      set: {
        endedAt: input.now,
        lastSyncedAt: input.now,
        metadata: sql`${interviewConversation.metadata} || ${CANDIDATE_CLICKED_END_METADATA}::jsonb`,
        status: "completed",
      },
      target: interviewConversation.conversationId,
    });
}

async function recordDirectAiInterviewAcceptance(
  tx: InterviewTransaction,
  input: { invitationVersion: number; now: Date; roundId: string },
): Promise<void> {
  await tx
    .update(studioInterviewSchedule)
    .set({
      candidateInviteStatus: "accepted" as const,
      candidateRespondedAt: input.now,
      updatedAt: input.now,
    })
    .where(eq(studioInterviewSchedule.id, input.roundId));
  if (isInterviewNotificationFlowEnabled()) {
    await enqueueAiInvitationResponseEvent(tx, {
      action: "accept",
      invitationVersion: input.invitationVersion,
      respondedAt: input.now,
      scheduleEntryId: input.roundId,
    });
  }
}

async function recordDirectAiInterviewVisit(roundId: string): Promise<boolean> {
  const now = new Date();
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        candidateInviteExpiresAt: studioInterviewSchedule.candidateInviteExpiresAt,
        candidateInviteStatus: studioInterviewSchedule.candidateInviteStatus,
        candidateInviteTokenHash: studioInterviewSchedule.candidateInviteTokenHash,
        invitationVersion: studioInterviewSchedule.invitationVersion,
        status: studioInterviewSchedule.status,
      })
      .from(studioInterviewSchedule)
      .where(eq(studioInterviewSchedule.id, roundId))
      .for("update")
      .limit(1);
    if (!row) {
      return false;
    }
    const decision = resolveAiInterviewAccess({
      candidateInviteExpiresAt: row.candidateInviteExpiresAt,
      candidateInviteStatus: row.candidateInviteStatus,
      candidateInviteTokenHash: row.candidateInviteTokenHash,
      now,
      roundStatus: row.status,
    });
    if (decision === "unavailable") {
      return false;
    }
    if (decision === "auto_accept") {
      await recordDirectAiInterviewAcceptance(tx, {
        invitationVersion: row.invitationVersion,
        now,
        roundId,
      });
    }
    return true;
  });
}

export const interviewRouter = factory
  .createApp()
  .route("/", candidateInterviewFeedbackRouter)
  // oxlint-disable-next-line complexity -- Token issuance composes auth, form gate, and the hot-reconnect state machine in one flow.
  .post("/:id/:roundId/livekit-token", async (c) => {
    const id = c.req.param("id");
    const roundId = c.req.param("roundId");
    const interviewRecord = await loadCandidateInterviewRecord(id, roundId);

    if (!interviewRecord) {
      return c.json({ error: "Interview not available." }, 404);
    }

    if (!interviewRecord.currentRoundId) {
      return c.json({ error: "Round not found." }, 404);
    }

    if (interviewRecord.currentRoundStatus === "completed") {
      return c.json({ error: "当前面试轮次已结束，如需重新面试请联系管理员。" }, 403);
    }

    const contextSnapshot = await loadActiveInterviewContextSnapshot(id);
    if (!contextSnapshot) {
      return c.json({ error: "Interview not available." }, 404);
    }
    if (interviewRecord.jobDescriptionPresetQuestions.length === 0) {
      return c.json(
        {
          code: "questions_required",
          error: "当前面试轮次未绑定必问题目，请联系招聘方完成配置。",
        },
        409,
      );
    }
    const requiredTemplateIds = contextSnapshot.payload.forms.map((form) => form.templateId);
    if (requiredTemplateIds.length > 0) {
      const submittedIds = await loadSubmittedTemplateIds(id, requiredTemplateIds);
      if (submittedIds.size < requiredTemplateIds.length) {
        return c.json({ code: "forms_required", error: "请先完成面试表单。" }, 409);
      }
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const serverUrl = process.env.LIVEKIT_URL;
    const agentName = process.env.AGENT_NAME?.trim() || "giaogiao";

    if (!apiKey || !apiSecret || !serverUrl) {
      return c.json(buildTokenErrorResponse(), 500);
    }

    // 热重连：在事务里加行锁后判定状态机；
    //   pending → 生成新 roomName/identity 并写库；
    //   interrupted 在 3 分钟内 → 复用持久化的 roomName/identity；
    //   interrupted 已过期 → 同事务置 completed 并返回 410；
    //   in_progress 且 disconnectedAt 为空 → 视为占用中，返回 409；
    // 用 FOR UPDATE 防止两个 tab/设备并发竞争同一轮次。
    // Hot-reconnect: a SELECT … FOR UPDATE state-machine inside a transaction.
    // pending → mint and persist new roomName/identity; interrupted-in-window →
    // reuse the persisted ones; interrupted-expired → flip to completed + 410;
    // in_progress with disconnectedAt null → 409 (taken by another tab/device).
    type TokenResolution =
      | {
          status: "ready";
          roomName: string;
          participantIdentity: string;
          isReconnect: boolean;
        }
      | { status: "grace_expired" }
      | { status: "invitation_unavailable" }
      | { status: "round_completed" };

    const participantName = interviewRecord.candidateName || "candidate";
    const now = new Date();

    const resolution = await db.transaction(async (tx): Promise<TokenResolution> => {
      const [row] = await tx
        .select({
          candidateInviteExpiresAt: studioInterviewSchedule.candidateInviteExpiresAt,
          candidateInviteStatus: studioInterviewSchedule.candidateInviteStatus,
          candidateInviteTokenHash: studioInterviewSchedule.candidateInviteTokenHash,
          disconnectedAt: studioInterviewSchedule.disconnectedAt,
          invitationVersion: studioInterviewSchedule.invitationVersion,
          liveKitParticipantIdentity: studioInterviewSchedule.liveKitParticipantIdentity,
          liveKitRoomName: studioInterviewSchedule.liveKitRoomName,
          status: studioInterviewSchedule.status,
        })
        .from(studioInterviewSchedule)
        .where(eq(studioInterviewSchedule.id, roundId))
        .for("update")
        .limit(1);

      if (!row) {
        return { status: "round_completed" };
      }

      // 同事务里再校验一遍 completed —— 早先 loadCandidateInterviewRecord 之后
      // 可能被 agent /report 抢先置 completed，避免发出错乱的 token。
      // Re-check completed under the row lock to defend against a race where
      // /api/agent/report flipped status between our earlier read and now.
      if (row.status === "completed") {
        return { status: "round_completed" };
      }

      const accessDecision = resolveAiInterviewAccess({
        candidateInviteExpiresAt: row.candidateInviteExpiresAt,
        candidateInviteStatus: row.candidateInviteStatus,
        candidateInviteTokenHash: row.candidateInviteTokenHash,
        now,
        roundStatus: row.status,
      });
      if (accessDecision === "unavailable") {
        return { status: "invitation_unavailable" };
      }
      if (accessDecision === "auto_accept") {
        await recordDirectAiInterviewAcceptance(tx, {
          invitationVersion: row.invitationVersion,
          now,
          roundId,
        });
      }

      // interrupted 已过期：写 completed + 清 anchor 后返 410。
      // Expired grace: persist completed and clear anchors before 410.
      if (row.status === "interrupted" && row.disconnectedAt) {
        const elapsed = now.getTime() - new Date(row.disconnectedAt).getTime();
        if (elapsed > RECONNECT_GRACE_MS) {
          await tx
            .update(studioInterviewSchedule)
            .set({
              disconnectedAt: null,
              liveKitParticipantIdentity: null,
              liveKitRoomName: null,
              status: "completed" as const,
              updatedAt: now,
            })
            .where(eq(studioInterviewSchedule.id, roundId));
          if (isInterviewNotificationFlowEnabled()) {
            await enqueueAiInterviewCompletedEvent(tx, { scheduleEntryId: roundId });
          }
          return { status: "grace_expired" };
        }
      }

      // 复用现有 anchor，幂等：in_progress 与 interrupted-in-window 都走这里。
      // useSession() 在 mount 时会先调一次 prepareConnection 拿 token 预热，
      // 之后用户 session.start() 又调一次。如果这里写 status / disconnectedAt
      // 第二次调用会因为状态已变被拒，所以保持只读。
      // Reuse existing anchors as a pure read (idempotent path); applies to
      // in_progress and interrupted-in-window. useSession's mount-time
      // prepareConnection fetches once, then session.start() fetches again;
      // if we mutated state on the first call, the second would be rejected.
      if (row.liveKitRoomName && row.liveKitParticipantIdentity) {
        return {
          isReconnect: row.status === "interrupted",
          participantIdentity: row.liveKitParticipantIdentity,
          roomName: row.liveKitRoomName,
          status: "ready",
        };
      }

      // 首次开始（pending），或异常缺失锚点的 in_progress（兜底当作首次）。
      // Fresh start (pending) or in_progress without anchors (defensive fallback).
      const freshRoomName = `interview_${id}_${roundId}_${Math.floor(Math.random() * 10_000)}`;
      const freshIdentity = `candidate_${id}_${roundId}_${Math.floor(Math.random() * 10_000)}`;
      await tx
        .update(studioInterviewSchedule)
        .set({
          disconnectedAt: null,
          liveKitParticipantIdentity: freshIdentity,
          liveKitRoomName: freshRoomName,
          sessionStartedAt: now,
          status: "in_progress" as const,
          updatedAt: now,
        })
        .where(eq(studioInterviewSchedule.id, roundId));
      return {
        isReconnect: false,
        participantIdentity: freshIdentity,
        roomName: freshRoomName,
        status: "ready",
      };
    });

    if (resolution.status === "round_completed") {
      return c.json({ error: "当前面试轮次已结束，如需重新面试请联系管理员。" }, 403);
    }

    if (resolution.status === "grace_expired") {
      return c.json({ code: "grace_expired", error: "重连超时，本轮面试已结束。" }, 410);
    }

    if (resolution.status === "invitation_unavailable") {
      return c.json({ code: "invitation_unavailable", error: "面试邀请已拒绝或已过期。" }, 403);
    }

    const { roomName, participantIdentity, isReconnect } = resolution;

    // Interview context is surfaced to the Python agent worker via participant metadata.
    // Python: `ctx.wait_for_participant()` → `participant.metadata` → JSON.parse.
    // When the JD has multiple interviewers, select one before dispatch so the
    // metadata contains the exact prompt and voice that the worker must use.
    // Candidate-facing route has no authenticated org context; derive the org from the
    // interview record itself. studio_interview.organization_id 已 NOT NULL,直接取。
    // studio_interview.organization_id is NOT NULL — read it directly.
    const snapshotPayload = contextSnapshot.payload;
    // 录像开关：显式环境变量未关闭且 R2 录像桶凭据齐全时，才让 Agent 启动 Egress。
    // 候选人浏览器拒绝摄像头时由前端侧降级；这里只判服务端能力与部署开关。
    // Recording switch: only enable when both the feature flag and R2 storage are present.
    const recordingEnabled =
      resolveInterviewRecordingEnabled(process.env) && isRecordingStorageConfigured();
    const recordingFileKey = recordingEnabled
      ? await buildRecordingFileKey({
          interviewRecordId: id,
          roomName,
          roundId,
        })
      : null;
    const selectedInterviewer = selectInterviewDispatchInterviewer(
      snapshotPayload.interviewers,
      roundId,
    );
    const participantMetadata = JSON.stringify(
      buildInterviewDispatchMetadata({
        allowTextInput: interviewRecord.currentRoundAllowTextInput,
        candidateName: snapshotPayload.candidate.candidateName,
        closingInstructions: snapshotPayload.globalConfig.closingInstructions,
        companyContext: snapshotPayload.globalConfig.companyContext,
        interviewQuestions: snapshotPayload.personalizedQuestions,
        interviewRecordId: id,
        jobDescriptionPresetQuestions: interviewRecord.jobDescriptionPresetQuestions ?? [],
        jobDescriptionPrompt: snapshotPayload.jobDescription?.prompt ?? null,
        openingInstructions: snapshotPayload.globalConfig.openingInstructions,
        recordingEnabled,
        recordingFileKey,
        resumeProfile: snapshotPayload.candidate.resumeProfile,
        roundId,
        selectedInterviewer,
        targetRole: snapshotPayload.jobDescription?.name ?? null,
      }),
    );

    try {
      const at = new AccessToken(apiKey, apiSecret, {
        identity: participantIdentity,
        metadata: participantMetadata,
        name: participantName,
        ttl: "15m",
      });

      at.addGrant({
        canPublish: true,
        canPublishData: true,
        canSubscribe: true,
        room: roomName,
        roomJoin: true,
      });

      at.roomConfig = new RoomConfiguration({
        agents: [new RoomAgentDispatch({ agentName })],
      });

      const participantToken = await at.toJwt();

      return c.json({ isReconnect, participantName, participantToken, roomName, serverUrl }, 200);
    } catch (error) {
      return c.json(
        createInternalErrorResponse({
          context: { interviewRecordId: id, roundId },
          error,
          operation: "interview-livekit-token",
          publicMessage: "Failed to sign LiveKit token.",
        }),
        500,
      );
    }
  })
  .get("/:id/resolve", async (c) => {
    const id = c.req.param("id");
    const entry = await loadScheduleEntriesForRedirect(id);

    if (!entry) {
      return c.json({ error: "Interview not available." }, 404);
    }

    return c.json({ interviewId: id, roundId: entry.id }, 200);
  })
  .get("/:id/:roundId", async (c) => {
    const id = c.req.param("id");
    const roundId = c.req.param("roundId");
    const interviewRecord = await loadCandidateInterviewRecord(id, roundId);

    if (!interviewRecord) {
      return c.json({ error: "Interview not available." }, 404);
    }

    if (!(await recordDirectAiInterviewVisit(roundId))) {
      return c.json({ code: "invitation_unavailable", error: "面试邀请已拒绝或已过期。" }, 403);
    }

    return c.json(interviewRecord, 200);
  })
  .get("/:id/:roundId/forms", async (c) => {
    const id = c.req.param("id");
    const roundId = c.req.param("roundId");
    const interviewRecord = await loadCandidateInterviewRecord(id, roundId);

    if (!interviewRecord) {
      return c.json({ error: "Interview not available." }, 404);
    }

    const contextSnapshot = await loadActiveInterviewContextSnapshot(id);
    if (!contextSnapshot) {
      return c.json({ error: "Interview not available." }, 404);
    }
    const required = contextSnapshot.payload.forms.map((form) => ({
      snapshot: form.snapshot,
      templateId: form.templateId,
      version: form.version,
      versionId: form.versionId,
    }));

    if (required.length === 0) {
      return c.json({ required: [], submitted: {} satisfies Record<string, true> }, 200);
    }

    const templateIds = required.map((form) => form.templateId);
    const submittedIds = await loadSubmittedTemplateIds(id, templateIds);

    const submitted: Record<string, true> = {};
    for (const templateId of submittedIds) {
      submitted[templateId] = true;
    }

    return c.json({ required, submitted }, 200);
  })
  .post(
    "/:id/:roundId/forms/:templateId/submit",
    zValidator(
      "json",
      // 中文：answers 形状由 templateVersion 动态决定，这里只做粗校验。
      // English: answers shape is dynamic per templateVersion — only shallow check here.
      z.object({ answers: z.record(z.string(), z.unknown()), versionId: z.string().min(1) }),
      jsonValidatorError("请求参数缺失。"),
    ),
    async (c) => {
      const id = c.req.param("id");
      const roundId = c.req.param("roundId");
      const templateId = c.req.param("templateId");

      const interviewRecord = await loadCandidateInterviewRecord(id, roundId);
      if (!interviewRecord) {
        return c.json({ error: "Interview not available." }, 404);
      }
      if (interviewRecord.currentRoundStatus === "completed") {
        return c.json({ error: "当前面试轮次已结束，无法再提交面试表单。" }, 403);
      }

      const { versionId, answers: rawAnswers } = c.req.valid("json");

      const contextSnapshot = await loadActiveInterviewContextSnapshot(id);
      if (!contextSnapshot) {
        return c.json({ error: "Interview not available." }, 404);
      }
      const requiredForm = contextSnapshot.payload.forms.find(
        (form) => form.templateId === templateId,
      );
      if (!requiredForm) {
        return c.json({ error: "该面试表单不适用于当前面试。" }, 400);
      }
      if (requiredForm.versionId !== versionId) {
        return c.json({ error: "面试表单版本已过期，请刷新页面后重试。" }, 409);
      }

      const answersSchema = buildCandidateFormAnswersSchema(requiredForm.snapshot);
      const parsed = answersSchema.safeParse(rawAnswers);
      if (!parsed.success) {
        return c.json({ error: parsed.error.issues[0]?.message ?? "面试表单填写不完整。" }, 400);
      }

      const now = new Date();
      const submissionId = crypto.randomUUID();
      try {
        await db.insert(candidateFormSubmission).values({
          answers: parsed.data,
          id: submissionId,
          interviewRecordId: id,
          organizationId: interviewRecord.organizationId,
          submittedAt: now,
          templateId,
          versionId,
        });
      } catch {
        // Unique (templateId, interviewRecordId) — treat as already submitted.
        return c.json({ error: "该面试表单已提交过。" }, 409);
      }

      return c.json({ submissionId, success: true, version: requiredForm.version, versionId }, 200);
    },
  )
  .post(
    "/:id/:roundId/complete",
    zValidator("query", z.object({ mode: z.enum(["interrupt", "final"]).optional() })),
    async (c) => {
      // 浏览器侧发出的「会话状态变更」信号，按 mode 区分：
      //   mode=interrupt（默认）：候选人断连。把状态置为 interrupted 并写入
      //     首次断开时间，开启 3 分钟热重连窗口；不级联面试整体状态。
      //   mode=final：候选人点击结束。立刻记录 candidate_clicked_end、置
      //     completed 并级联面试整体状态；Agent 后续报告只能补充技术原因，
      //     不能覆盖这个显式用户行为。
      // Agent grace 超时后由 shutdown 回调走 /api/agent/report 把轮次最终
      // 落到 completed，因此 interrupt 不需要做任何兜底「结束」工作。
      //
      // Browser-side session-state signal. mode=interrupt (default) marks the
      // round "interrupted" with disconnectedAt to open the 3-minute rejoin
      // window; mode=final records the candidate's explicit end-button action
      // and cascades to completed. A later Agent report can enrich the metadata
      // but must preserve that higher-confidence business reason.
      const roundId = c.req.param("roundId");
      const mode = c.req.valid("query").mode === "final" ? "final" : "interrupt";
      const now = new Date();

      const [entry] = await db
        .select({
          conversationId: studioInterviewSchedule.conversationId,
          disconnectedAt: studioInterviewSchedule.disconnectedAt,
          id: studioInterviewSchedule.id,
          interviewRecordId: studioInterviewSchedule.interviewRecordId,
          liveKitRoomName: studioInterviewSchedule.liveKitRoomName,
          organizationId: studioInterviewSchedule.organizationId,
          status: studioInterviewSchedule.status,
        })
        .from(studioInterviewSchedule)
        .where(eq(studioInterviewSchedule.id, roundId))
        .limit(1);

      if (!entry) {
        return c.json({ error: "Round not found." }, 404);
      }

      if (entry.status === "completed") {
        return c.json({ success: true }, 200);
      }

      if (mode === "interrupt") {
        // 每次断连都覆盖 disconnectedAt = now，让 3 分钟宽限窗口与 agent 端的
        // grace 计时器（每次 participant_disconnected 重启）保持同步。
        // 之前"只在首次写"的策略会让多次断连时两端窗口错位 —— 例如用户首次断
        // 30 秒后重连，又过 60 秒再次断开，agent 重启 grace 等 180 秒，但 web
        // 仍按首次断的时间算（剩余 90 秒）就会过早判 410。
        // pending 没有 anchor 不能重连，忽略；completed 已结束，忽略。
        // Always overwrite disconnectedAt = now on every drop so the web grace
        // window stays in lockstep with agent's grace timer (which restarts on
        // each participant_disconnected). The earlier "first-drop only" rule
        // caused the two windows to drift apart on multiple reconnects.
        if (entry.status === "in_progress" || entry.status === "interrupted") {
          await db
            .update(studioInterviewSchedule)
            .set({
              disconnectedAt: now,
              status: "interrupted" as const,
              updatedAt: now,
            })
            .where(eq(studioInterviewSchedule.id, roundId));
          // 候选人侧路由没有 activeOrg，反查 interview record 拿 orgId。
          // 找不到时跳过失效（约定见 cache-tags.ts），等 cacheLife 自然过期。
          // Candidate-side route has no activeOrg; reverse-lookup org from the
          // interview record. Skip invalidation on miss; cacheLife will refresh.
          const orgId = await lookupOrgIdByInterviewRecord(entry.interviewRecordId);
          if (orgId) {
            safeUpdateTag(cacheTags.studioInterviews(orgId));
          }
        }
        return c.json({ success: true }, 200);
      }

      const conversationId = entry.conversationId ?? entry.liveKitRoomName;
      await db.transaction(async (tx) => {
        await tx
          .update(studioInterviewSchedule)
          .set({
            conversationId: conversationId ?? entry.conversationId,
            status: "completed" as const,
            updatedAt: now,
          })
          .where(eq(studioInterviewSchedule.id, roundId));
        if (conversationId) {
          await recordCandidateClickedEnd(tx, {
            conversationId,
            interviewRecordId: entry.interviewRecordId,
            now,
            organizationId: entry.organizationId,
            roundId,
          });
        }
        if (isInterviewNotificationFlowEnabled()) {
          await enqueueAiInterviewCompletedEvent(tx, { scheduleEntryId: roundId });
        }
      });

      // 候选人侧路由没有 activeOrg —— 反查 org 拼 org-scoped tag。
      // Reverse-lookup orgId on the candidate-side path; tag is org-scoped now.
      const completedOrgId = await lookupOrgIdByInterviewRecord(entry.interviewRecordId);
      if (completedOrgId) {
        safeUpdateTag(cacheTags.studioInterviews(completedOrgId));
      }
      return c.json({ success: true }, 200);
    },
  );
