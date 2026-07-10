/* oxlint-disable complexity -- collection router coordinates validation, persistence, and access policy. */
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { studioInterview, studioInterviewSchedule } from "@arc/db-schema/schema";
import { resolveRecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import {
  humanInterviewMeetingInputSchema,
  parseResumePayloadInput,
  parseScheduleEntriesInput,
  studioInterviewFormSchema,
  toNullableString,
} from "@arc/db-schema/studio-interviews";
import {
  analyzeResumeFile,
  generateInterviewQuestionsForProfile,
  parseResumeFastToProfile,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { createInternalErrorResponse } from "@arc/ai-recruitment-copilot-backend/server/error-handler";
import { resolveCandidateQuestionGenerationEnabled } from "@arc/shared/interview/candidate-question-generation-config";
import { autoBindApplicableTemplates } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-questions/dao/bindings";
import { createInterviewContextSnapshot } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/context-snapshots";
import {
  createHumanInterviewMeeting,
  deleteHumanInterviewMeeting,
  endHumanInterviewMeeting,
  HumanInterviewMeetingError,
  isHumanInterviewMeetingAfterValidUntil,
  isHumanInterviewMeetingBeforeScheduledStart,
  issueHumanInterviewMeetingLinks,
  listHumanInterviewMeetings,
  loadHumanInterviewMeetingById,
  markHumanInterviewMeetingInProgress,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/human-interview-meetings";
import {
  deleteHumanInterviewLiveKitRoom,
  HumanInterviewLiveKitConfigError,
  signHumanInterviewMeetingToken,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/utils/human-interview-livekit";
import { enqueueResumeSemanticIndexJobBestEffort } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/enqueue";
import { jobDescriptionIdsExist } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { syncResumeSkills } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/skills";
import {
  loadInterviewRoundDetail,
  resolveCandidateIdForRound,
  resolveRoundIdFromRecordId,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/interview-rounds";
import {
  buildTokenErrorResponse,
  buildScheduleRows,
  normalizeResumeFile,
  resolveResumeUploadStorage,
  toBadRequest,
} from "@arc/ai-recruitment-copilot-backend/server/routes/interview/utils";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import { invalidateStudioInterviewCaches } from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import {
  parseResumeCreateDedupPolicy,
  resolveResumeCreateDedupConflict,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/dedup";

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

export const studioInterviewCollectionRouter = factory
  .createApp()
  .post("/", requirePermission("interview", "create"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    try {
      const formData = await c.req.formData();
      const resume = normalizeResumeFile(formData.get("resume"));
      const parsedScheduleEntries = parseScheduleEntriesInput(formData.get("scheduleEntries"));
      const parsedResumePayload = parseResumePayloadInput(formData.get("resumePayload"));
      const manualQuestionsRaw = toNullableString(formData.get("manualInterviewQuestions"));
      const manualInterviewQuestions = manualQuestionsRaw
        ? (JSON.parse(
            manualQuestionsRaw,
          ) as (typeof studioInterview.$inferSelect)["interviewQuestions"])
        : null;

      const input = studioInterviewFormSchema.safeParse({
        candidateEmail: toNullableString(formData.get("candidateEmail")) ?? "",
        candidateName: toNullableString(formData.get("candidateName")) ?? "",
        candidatePhone: toNullableString(formData.get("candidatePhone")) ?? "",
        jobDescriptionId: toNullableString(formData.get("jobDescriptionId")),
        notes: toNullableString(formData.get("notes")) ?? "",
        scheduleEntries: parsedScheduleEntries,
        targetRole: toNullableString(formData.get("targetRole")) ?? "",
      });

      if (!input.success) {
        return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
      }

      if (resume && !c.var.user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      if (input.data.jobDescriptionId) {
        const ok = await jobDescriptionIdsExist([input.data.jobDescriptionId], activeOrg.id);
        if (!ok) {
          return c.json({ error: "所选在招岗位不存在。" }, 400);
        }
      }

      const now = new Date();
      const candidateQuestionGenerationEnabled = resolveCandidateQuestionGenerationEnabled(
        process.env,
      );
      const interviewRecordId = crypto.randomUUID();
      const uploadResult = await resolveResumeUploadStorage({
        interviewRecordId,
        organizationId: activeOrg.id,
        parsedResumePayload,
        resume,
        userId: c.var.user?.id,
      });
      const resumeStorageKey = uploadResult?.storageKey ?? null;
      const resumeContentHash = uploadResult?.contentHash ?? null;
      let resumeText = parsedResumePayload?.resumeText ?? uploadResult?.resumeText ?? null;

      // 解析复用顺序：客户端预解析 > 注册表缓存命中 > 现场跑完整 analyzeResumeFile。
      // Reuse order: client-prebaked → registry cache → server full analysis.
      let analysis = parsedResumePayload;
      if (!analysis && resume) {
        if (uploadResult?.cachedResumeProfile) {
          const interviewQuestions = candidateQuestionGenerationEnabled
            ? await generateInterviewQuestionsForProfile(uploadResult.cachedResumeProfile)
            : [];
          analysis = {
            fileName: resume.name,
            interviewQuestions,
            resumeProfile: uploadResult.cachedResumeProfile,
            resumeText: uploadResult.resumeText,
          };
        } else if (candidateQuestionGenerationEnabled) {
          analysis = await analyzeResumeFile(resume);
          ({ resumeText } = analysis);
        } else {
          const parsed = await parseResumeFastToProfile(resume);
          resumeText = parsed.parsedText;
          analysis = {
            fileName: resume.name,
            interviewQuestions: [],
            resumeProfile: parsed.resumeProfile,
            resumeText,
          };
        }
      }
      const dedupConflict = await resolveResumeCreateDedupConflict({
        candidateEmail: input.data.candidateEmail || null,
        candidateName: input.data.candidateName || null,
        candidatePhone: input.data.candidatePhone || null,
        dedupPolicy: parseResumeCreateDedupPolicy(formData.get("dedupPolicy")),
        organizationId: activeOrg.id,
        resumeProfile: analysis?.resumeProfile ?? null,
      });
      if (dedupConflict) {
        return c.json(dedupConflict, 409);
      }
      const record = {
        candidateEmail: input.data.candidateEmail || null,
        candidateName: input.data.candidateName || analysis?.resumeProfile.name || "未命名候选人",
        candidatePhone: input.data.candidatePhone || analysis?.resumeProfile.phone || null,
        createdAt: now,
        createdBy: c.var.user?.id ?? null,
        id: interviewRecordId,
        interviewQuestions: analysis?.interviewQuestions ?? manualInterviewQuestions ?? [],
        jobDescriptionId: input.data.jobDescriptionId || null,
        notes: input.data.notes || null,
        organizationId: activeOrg.id,
        // 从 AI 面试页面直接创建：起步就在 ai_interview 阶段。
        // Created from the AI interview page → record starts at ai_interview.
        pipelineStage: "ai_interview" as const,
        resumeContentHash,
        resumeFileName: analysis?.fileName ?? resume?.name ?? null,
        resumeProfile: analysis?.resumeProfile ?? null,
        resumeStorageKey,
        resumeText,
        targetRole: input.data.targetRole || analysis?.resumeProfile.targetRoles[0] || null,
        updatedAt: now,
      } satisfies typeof studioInterview.$inferInsert;
      const scheduleRows = buildScheduleRows(
        activeOrg.id,
        interviewRecordId,
        input.data.scheduleEntries,
        now,
        undefined,
        c.var.user?.id ?? null,
      );

      await db.transaction(async (tx) => {
        await tx.insert(studioInterview).values(record);
        await tx.insert(studioInterviewSchedule).values(scheduleRows);
        await autoBindApplicableTemplates(tx, interviewRecordId, record.jobDescriptionId);
        await createInterviewContextSnapshot(tx, {
          createdAt: now,
          createdBy: c.var.user?.id ?? null,
          interviewRecordId,
          reason: "create",
          scheduleEntryId: scheduleRows[0]?.id ?? null,
        });
        await syncResumeSkills(tx, {
          interviewId: interviewRecordId,
          organizationId: activeOrg.id,
          skills: analysis?.resumeProfile.skills,
        });
      });

      invalidateStudioInterviewCaches(activeOrg.id);
      if (analysis?.resumeProfile) {
        await enqueueResumeSemanticIndexJobBestEffort({
          organizationId: activeOrg.id,
          sourceId: interviewRecordId,
          sourceType: "studio_interview",
        });
      }
      // POST / 返回新建轮次的完整 detail，供招聘台 onCreated 直接使用。
      // Return the first round's full detail so the resume library onCreated can use it directly.
      const firstRoundId = scheduleRows[0]?.id;
      if (!firstRoundId) {
        return c.json({ error: "未生成面试轮次。" }, 400);
      }
      const detail = await loadInterviewRoundDetail(firstRoundId, activeOrg.id);
      return c.json(detail, 201);
    } catch (error) {
      const result = toBadRequest(error);
      return c.json({ error: result.error }, { status: result.status as ContentfulStatusCode });
    }
  })
  .get(
    "/resolve",
    requirePermission("interview", "read"),
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
    requirePermission("humanInterview", "read"),
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
    requirePermission("humanInterview", "create"),
    zValidator(
      "json",
      humanInterviewMeetingInputSchema,
      jsonValidatorError("真人复面会议参数无效。"),
    ),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      try {
        const created = await createHumanInterviewMeeting({
          createdBy: user?.id ?? null,
          input: c.req.valid("json"),
          organizationId: activeOrg.id,
        });
        invalidateStudioInterviewCaches(activeOrg.id);
        return c.json(created, 200);
      } catch (error) {
        if (error instanceof HumanInterviewMeetingError) {
          return c.json({ error: error.message }, error.status);
        }
        throw error;
      }
    },
  )
  .post(
    "/human-interview-meetings/:meetingId/links",
    requirePermission("humanInterview", "read"),
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
    requirePermission("humanInterview", "read"),
    zValidator("json", humanMeetingTokenInputSchema, jsonValidatorError("会议入场参数无效。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }

      const meeting = await loadHumanInterviewMeetingById(c.req.param("meetingId"), activeOrg.id);
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
        await markHumanInterviewMeetingInProgress(meeting.id);
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
    requirePermission("humanInterview", "update"),
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
    requirePermission("humanInterview", "delete"),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      try {
        const roomName = await deleteHumanInterviewMeeting({
          meetingId: c.req.param("meetingId"),
          organizationId: activeOrg.id,
        });
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
  );
