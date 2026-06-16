import type { ContentfulStatusCode } from "hono/utils/http-status";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray, notExists } from "drizzle-orm";
import { uniq } from "lodash-es";
import { z } from "zod";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  candidateFormSubmission,
  interviewAuditLog,
  interviewer,
  jobDescription,
  jobDescriptionInterviewer,
  studioInterview,
  studioInterviewSchedule,
} from "@arc/db-schema/schema";
import { resolveRecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import {
  buildAgentInstructions,
  resolveClosingPrompt,
  resolveOpeningPrompt,
} from "@arc/shared/interview/agent-instructions";
import { parseCsvParam } from "@arc/shared/csv";
import {
  candidateExpectationsMetaSchema,
  candidateOutcomeSchema,
  closedMetaSchema,
  humanInterviewMeetingInputSchema,
  humanInterviewRoundInputSchema,
  nullableInstantDateTimeInputSchema,
  humanInterviewRoundOutcomeSchema,
  offerDraftInputSchema,
  offerResponseInputSchema,
  parseResumePayloadInput,
  parseScheduleEntriesInput,
  pipelineStageSchema,
  scheduleEntryStatusSchema,
  studioInterviewFormSchema,
  toNullableString,
} from "@arc/db-schema/studio-interviews";
import type { StudioInterviewStatus } from "@arc/db-schema/studio-interviews";
import {
  analyzeResumeFile,
  generateInterviewQuestionsForProfile,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { getGlobalConfig } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/global-config/dao";
import { loadSubmissionsByInterview } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/forms/dao/submissions";
import {
  autoBindApplicableTemplates,
  ensureApplicableBindings,
  loadInterviewPresetQuestions,
  loadInterviewQuestionTemplateBindings,
  refreshInterviewBindingsToLatest,
  replaceInterviewBindings,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-questions/dao/bindings";
import {
  cancelHumanInterviewRoundWithMeetings,
  completeHumanInterviewRound,
  createHumanInterviewRound,
  editHumanInterviewRound,
  EditRoundError,
  listHumanInterviewRounds,
  maybeAdvanceToHumanInterview,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/human-interview-rounds";
import {
  createHumanInterviewMeeting,
  deleteHumanInterviewMeeting,
  endHumanInterviewMeeting,
  endHumanInterviewMeetingsByRound,
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
import {
  cancelOfferDraft,
  createOfferDraft,
  editOfferDraft,
  listOfferDrafts,
  maybeAdvanceToOffer,
  OfferDraftError,
  respondOfferDraft,
  sendOfferDraft,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/offer-drafts";
import { queryInterviewDedup } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/studio-interviews";
import { jobDescriptionIdsExist } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { syncResumeSkills } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/skills";
import {
  loadInterviewRoundDetail,
  queryPaginatedInterviewRounds,
  resolveCandidateIdForRound,
  resolveRoundIdFromRecordId,
  summarizeInterviewRoundCounts,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/interview-rounds";
import { recordingsRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/routes/recordings/route";
import { reportsRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/routes/reports/route";
import { roundEmailsRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/routes/round-emails/route";
import {
  buildTokenErrorResponse,
  buildScheduleRows,
  loadRecordById,
  normalizeResumeFile,
  storeInterviewResume,
  toBadRequest,
} from "@arc/ai-recruitment-copilot-backend/server/routes/interview/utils";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import {
  cacheTags,
  invalidateStudioInterviewCaches,
  safeUpdateTag,
} from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import { getObjectBytes, getObjectStream } from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import { createPptxPreviewPdfResponse } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/utils/pptx-preview";

const dedupCheckInputSchema = z.object({
  email: z.string().trim().max(200).nullable().optional(),
  name: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});

// 候选人阶段流转输入。强制 outcome 与 pipelineStage 的不变量：
//   pipelineStage='closed' ⇔ outcome ∈ {hired,rejected,withdrawn,archived}
// 其余阶段下 outcome 必须省略或为 in_pipeline；closedReason 仅 closed 阶段允许。
//
// Candidate stage transition input. Encodes the (pipelineStage, outcome)
// invariant: closed ⇔ a terminal outcome; everything else stays in_pipeline.
const transitionInputSchema = z
  .object({
    // 结案元数据；只在 pipelineStage='closed' 时使用，partial 写入（merge 进现有）。
    // previousStage 不接受用户输入——服务端自动写当前 stage。
    closedMeta: closedMetaSchema.omit({ previousStage: true }).partial().optional(),
    // @deprecated 旧字段，HR 端逐步迁移到 closedMeta.internalNotes；保留以兼容。
    closedReason: z.string().trim().max(500, "结案原因不能超过 500 字").optional().nullable(),
    outcome: candidateOutcomeSchema.optional(),
    pipelineStage: pipelineStageSchema,
  })
  .refine(
    (v) => {
      if (v.pipelineStage === "closed") {
        return v.outcome !== undefined && v.outcome !== "in_pipeline";
      }
      return v.outcome === undefined || v.outcome === "in_pipeline";
    },
    {
      message:
        "结案阶段必须指定一个终态 outcome（hired/rejected/withdrawn/archived）；非结案阶段 outcome 必须为 in_pipeline。",
      path: ["outcome"],
    },
  )
  .refine((v) => v.pipelineStage === "closed" || !v.closedReason, {
    message: "closedReason 仅在结案时允许。",
    path: ["closedReason"],
  })
  .refine((v) => v.pipelineStage === "closed" || !v.closedMeta, {
    message: "closedMeta 仅在结案时允许。",
    path: ["closedMeta"],
  });

// 真人复面：「标记完成」的 input。outcome 必填，score / feedback 可选。
// Human interview "mark complete" input. Outcome required.
const completeHumanRoundSchema = z.object({
  feedback: z.string().trim().max(5000).nullable().optional(),
  outcome: humanInterviewRoundOutcomeSchema,
  score: z.number().int().min(0).max(100).nullable().optional(),
});

// 真人复面：「取消」的 input。reason 可选，便于后续审计 / 通知候选人。
// Human interview "cancel" input; reason optional.
const cancelHumanRoundSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional(),
});

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

// 删除 AI 轮次后回退 parent：若候选人已无任何 schedule entry 且仍处于
// pipeline_stage='ai_interview' / outcome='in_pipeline'，回退到 'screening'。
// 已经被推进到 human_interview/offer/closed 的候选人保持原状（HR 已显式推进）。
// After deleting rounds, roll parent back to 'screening' when no schedules remain
// and the candidate is still active in AI stage. Stages past ai_interview stay put
// because HR has already manually advanced them.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function resetOrphanedAiInterviewParents(
  tx: Tx,
  organizationId: string,
  candidateIds: readonly string[],
): Promise<void> {
  const unique = uniq(candidateIds.filter(Boolean));
  if (unique.length === 0) {
    return;
  }
  // 唯一一个 SQL，安全且无 N+1：用 NOT EXISTS 子查询过滤掉还有 schedule 的候选人。
  // Single SQL guarded by NOT EXISTS — no N+1 and won't touch candidates with surviving rounds.
  await tx
    .update(studioInterview)
    .set({ pipelineStage: "screening", updatedAt: new Date() })
    .where(
      and(
        inArray(studioInterview.id, unique),
        eq(studioInterview.organizationId, organizationId),
        eq(studioInterview.pipelineStage, "ai_interview"),
        eq(studioInterview.outcome, "in_pipeline"),
        notExists(
          tx
            .select({ one: studioInterviewSchedule.id })
            .from(studioInterviewSchedule)
            .where(eq(studioInterviewSchedule.interviewRecordId, studioInterview.id)),
        ),
      ),
    );
}

export const studioInterviewsRouter = factory
  .createApp()
  .get("/summary", requirePermission("interview", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const visibilityScope = await loadVisibilityScope(
      activeOrg.id,
      c.var.member?.role,
      c.var.user?.id,
    );
    const summary = await summarizeInterviewRoundCounts(activeOrg.id, visibilityScope);
    return c.json(summary, 200);
  })
  .post(
    "/dedup-check",
    requirePermission("interview", "read"),
    zValidator("json", dedupCheckInputSchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const input = c.req.valid("json");
      const matches = await queryInterviewDedup(activeOrg.id, {
        email: input.email ?? null,
        name: input.name ?? null,
        phone: input.phone ?? null,
      });
      return c.json({ matches }, 200);
    },
  )
  .get(
    "/",
    requirePermission("interview", "read"),
    zValidator(
      "query",
      z.object({
        creatorIds: z.string().optional(),
        page: z.string().optional(),
        pageSize: z.string().optional(),
        search: z.string().optional(),
        sortBy: z.string().optional(),
        sortOrder: z.string().optional(),
        status: z.string().optional(),
      }),
      jsonValidatorError("查询参数无效。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const q = c.req.valid("query");
      const visibilityScope = await loadVisibilityScope(
        activeOrg.id,
        c.var.member?.role,
        c.var.user?.id,
      );
      const result = await queryPaginatedInterviewRounds(
        activeOrg.id,
        { creatorIds: parseCsvParam(q.creatorIds), search: q.search, status: q.status },
        { page: q.page, pageSize: q.pageSize, sortBy: q.sortBy, sortOrder: q.sortOrder },
        visibilityScope,
      );
      return c.json(result, 200);
    },
  )
  // oxlint-disable-next-line complexity -- CRUD handler orchestrates parse → validate → persist in one flow.
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
        status: toNullableString(formData.get("status")) ?? "ready",
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
      const interviewRecordId = crypto.randomUUID();
      const uploadResult =
        resume && c.var.user
          ? await storeInterviewResume(interviewRecordId, resume, c.var.user.id, activeOrg.id)
          : null;
      const resumeStorageKey = uploadResult?.storageKey ?? null;
      const resumeContentHash = uploadResult?.contentHash ?? null;

      // 解析复用顺序：客户端预解析 > 注册表缓存命中 > 现场跑完整 analyzeResumeFile。
      // Reuse order: client-prebaked → registry cache → server full analysis.
      let analysis = parsedResumePayload;
      if (!analysis && resume) {
        if (uploadResult?.cachedResumeProfile) {
          const interviewQuestions = await generateInterviewQuestionsForProfile(
            uploadResult.cachedResumeProfile,
          );
          analysis = {
            fileName: resume.name,
            interviewQuestions,
            resumeProfile: uploadResult.cachedResumeProfile,
          };
        } else {
          analysis = await analyzeResumeFile(resume);
        }
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
        status: input.data.status,
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
        await syncResumeSkills(tx, {
          interviewId: interviewRecordId,
          organizationId: activeOrg.id,
          skills: analysis?.resumeProfile.skills,
        });
      });

      invalidateStudioInterviewCaches(activeOrg.id);
      // POST / 返回新建轮次的完整 detail，供简历库 onCreated 直接使用。
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
    requirePermission("interview", "read"),
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
    requirePermission("interview", "update"),
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
    requirePermission("interview", "update"),
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
    requirePermission("interview", "read"),
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
          {
            detail: error instanceof Error ? error.message : "Unknown error",
            error: "Failed to sign LiveKit token.",
          },
          500,
        );
      }
    },
  )
  .post(
    "/human-interview-meetings/:meetingId/end",
    requirePermission("interview", "update"),
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
    requirePermission("interview", "update"),
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
  )
  .get(
    "/human-interview-meetings/:meetingId",
    requirePermission("interview", "read"),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const meeting = await loadHumanInterviewMeetingById(c.req.param("meetingId"), activeOrg.id);
      if (!meeting) {
        return c.json({ error: "真人复面会议不存在。" }, 404);
      }
      return c.json(meeting, 200);
    },
  )
  .get("/:id", requirePermission("interview", "read"), async (c) => {
    // `:id` 现为 roundId；返回 StudioInterviewRoundDetail（round + 候选人快照）。
    // `:id` is now roundId; returns StudioInterviewRoundDetail (round + candidate snapshot).
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    // roundId
    const id = c.req.param("id");
    const visibilityScope = await loadVisibilityScope(
      activeOrg.id,
      c.var.member?.role,
      c.var.user?.id,
    );
    const detail = await loadInterviewRoundDetail(id, activeOrg.id, visibilityScope);

    if (!detail) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    return c.json(detail, 200);
  })
  .get("/:id/resume", requirePermission("interview", "read"), async (c) => {
    // `:id` 为 roundId；通过 resolveCandidateIdForRound 找到候选人再读简历。
    // `:id` is roundId; resolve candidateId to read the resume.
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    // roundId
    const id = c.req.param("id");
    const visibilityScope = await loadVisibilityScope(
      activeOrg.id,
      c.var.member?.role,
      c.var.user?.id,
    );
    const candidateId = await resolveCandidateIdForRound(id, activeOrg.id, visibilityScope);
    if (!candidateId) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    const existing = await loadRecordById(candidateId, activeOrg.id);

    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    if (!existing.resumeStorageKey) {
      return c.json({ error: "该候选人没有可预览的简历文件。" }, 404);
    }

    const object = await getObjectStream(existing.resumeStorageKey);
    if (!object) {
      return c.json({ error: "简历文件已不可用。" }, 404);
    }

    const filename = existing.resumeFileName || "resume.pdf";
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
  .get("/:id/resume-preview.pdf", requirePermission("interview", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const visibilityScope = await loadVisibilityScope(
      activeOrg.id,
      c.var.member?.role,
      c.var.user?.id,
    );
    const candidateId = await resolveCandidateIdForRound(id, activeOrg.id, visibilityScope);
    if (!candidateId) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    const existing = await loadRecordById(candidateId, activeOrg.id);
    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    if (!existing.resumeStorageKey) {
      return c.json({ error: "该候选人没有可预览的简历文件。" }, 404);
    }

    const object = await getObjectBytes(existing.resumeStorageKey);
    if (!object) {
      return c.json({ error: "简历文件已不可用。" }, 404);
    }

    return createPptxPreviewPdfResponse({
      bytes: object.bytes,
      cacheKey: existing.resumeStorageKey,
      fileName: existing.resumeFileName,
      mediaType: object.contentType,
    });
  })
  .get("/:id/agent-instructions", requirePermission("interview", "read"), async (c) => {
    // `:id` 为 roundId；通过 resolveCandidateIdForRound 解析候选人再生成指令。
    // `:id` is roundId; resolve candidateId before building agent instructions.
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    // roundId
    const id = c.req.param("id");
    const visibilityScope = await loadVisibilityScope(
      activeOrg.id,
      c.var.member?.role,
      c.var.user?.id,
    );
    const candidateId = await resolveCandidateIdForRound(id, activeOrg.id, visibilityScope);
    if (!candidateId) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const existing = await loadRecordById(candidateId, activeOrg.id);

    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    let jobDescriptionPrompt: string | null = null;
    let jobDescriptionName: string | null = null;
    let interviewers: { name: string; prompt: string }[] = [];

    if (existing.jobDescriptionId) {
      const [jdRow] = await db
        .select({
          name: jobDescription.name,
          prompt: jobDescription.prompt,
        })
        .from(jobDescription)
        .where(
          and(
            eq(jobDescription.id, existing.jobDescriptionId),
            eq(jobDescription.organizationId, activeOrg.id),
          ),
        )
        .limit(1);
      jobDescriptionPrompt = jdRow?.prompt ?? null;
      jobDescriptionName = jdRow?.name ?? null;

      const interviewerRows = await db
        .select({ name: interviewer.name, prompt: interviewer.prompt })
        .from(jobDescriptionInterviewer)
        .innerJoin(interviewer, eq(jobDescriptionInterviewer.interviewerId, interviewer.id))
        .where(
          and(
            eq(jobDescriptionInterviewer.jobDescriptionId, existing.jobDescriptionId),
            eq(interviewer.organizationId, activeOrg.id),
          ),
        );
      interviewers = interviewerRows;
    }

    // Source preset questions from binding-attached template versions, not
    // from the legacy `jobDescription.presetQuestions` column. Lazy-bind any
    // newly applicable templates so e.g. a global template created after this
    // interview shows up in the rendered prompt preview.
    // 绑定检查和预设题目均以 candidateId（interviewRecordId）为键。
    // Bindings and preset questions are keyed by candidateId (interviewRecordId).
    await ensureApplicableBindings(candidateId);
    const jobDescriptionPresetQuestions = await loadInterviewPresetQuestions(candidateId);

    // 注入系统设置（公司情况 / 开场白 / 结束语），保证预览与运行时一致。
    // Inject global config so the preview matches what the agent will receive.
    const globalCfg = await getGlobalConfig(activeOrg.id);
    const candidateName = existing.candidateName?.trim() || "候选人";
    const targetRole = jobDescriptionName?.trim() || "未指定岗位";
    const openingPrompt = resolveOpeningPrompt(
      globalCfg.openingInstructions,
      candidateName,
      targetRole,
    );
    const closingPrompt = resolveClosingPrompt(
      globalCfg.closingInstructions,
      candidateName,
      targetRole,
    );

    const baseContext = {
      candidateName: existing.candidateName,
      companyContext: globalCfg.companyContext,
      interviewQuestions: existing.interviewQuestions,
      jobDescriptionPresetQuestions,
      jobDescriptionPrompt,
      resumeProfile: existing.resumeProfile,
      targetRole: jobDescriptionName,
    } as const;

    const variants =
      interviewers.length > 0
        ? interviewers.map((person) => ({
            closingPrompt,
            instructions: buildAgentInstructions({
              ...baseContext,
              interviewerPrompt: person.prompt,
            }),
            interviewerName: person.name,
            openingPrompt,
          }))
        : [
            {
              closingPrompt,
              instructions: buildAgentInstructions({
                ...baseContext,
                interviewerPrompt: null,
              }),
              interviewerName: null,
              openingPrompt,
            },
          ];

    return c.json({ variants }, 200);
  })
  .route("/:id/reports", reportsRouter)
  .route("/:id/recordings", recordingsRouter)
  .get("/:id/form-submissions", requirePermission("interview", "read"), async (c) => {
    // `:id` 为 roundId；表单与 candidateId 绑定，通过解析后传给查询。
    // `:id` is roundId; form submissions are keyed by candidateId — resolve it first.
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const roundId = c.req.param("id");
    const visibilityScope = await loadVisibilityScope(
      activeOrg.id,
      c.var.member?.role,
      c.var.user?.id,
    );
    const candidateId = await resolveCandidateIdForRound(roundId, activeOrg.id, visibilityScope);
    if (!candidateId) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    const submissions = await loadSubmissionsByInterview(candidateId);
    return c.json({ submissions }, 200);
  })
  .delete(
    "/:id/form-submissions/:submissionId",
    requirePermission("interview", "update"),
    async (c) => {
      // `:id` 为 roundId；candidateFormSubmission 以 candidateId 为 FK。
      // `:id` is roundId; candidateFormSubmission uses candidateId as FK.
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const roundId = c.req.param("id");
      const submissionId = c.req.param("submissionId");

      const visibilityScope = await loadVisibilityScope(
        activeOrg.id,
        c.var.member?.role,
        c.var.user?.id,
      );
      const candidateId = await resolveCandidateIdForRound(roundId, activeOrg.id, visibilityScope);
      if (!candidateId) {
        return c.json({ error: "记录不存在。" }, 404);
      }

      const result = await db
        .delete(candidateFormSubmission)
        .where(
          and(
            eq(candidateFormSubmission.id, submissionId),
            eq(candidateFormSubmission.interviewRecordId, candidateId),
          ),
        )
        .returning({ id: candidateFormSubmission.id });

      if (result.length === 0) {
        return c.json({ error: "答卷不存在或已被重置。" }, 404);
      }

      return c.json({ success: true }, 200);
    },
  )
  .patch(
    "/:id",
    requirePermission("interview", "update"),
    zValidator(
      "json",
      z.object({
        allowTextInput: z.boolean().optional(),
        notes: z.string().trim().max(1000).optional().or(z.literal("")),
        scheduledAt: nullableInstantDateTimeInputSchema,
        status: scheduleEntryStatusSchema.optional(),
      }),
      jsonValidatorError("请求参数无效。"),
    ),
    async (c) => {
      // 轮次级 PATCH：仅更新 round 字段（allowTextInput / notes / scheduledAt / status）。
      // Round-level PATCH: updates only round fields (allowTextInput / notes / scheduledAt / status).
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const roundId = c.req.param("id");
      const body = c.req.valid("json");
      const visibilityScope = await loadVisibilityScope(
        activeOrg.id,
        c.var.member?.role,
        c.var.user?.id,
      );
      const existingRound = await loadInterviewRoundDetail(roundId, activeOrg.id, visibilityScope);
      if (!existingRound) {
        return c.json({ error: "记录不存在。" }, 404);
      }

      // 服务端 AI 阶段守卫：候选人已超过 AI 面试阶段后，禁止改 schedule entry 字段。
      // UI 已禁用按钮（aiStageLockedReason），但仍要服务端兜底防止绕过 UI 调用。
      // Server-side AI-stage guard: once the candidate is past AI interview,
      // schedule-entry mutations are rejected even if a client bypasses the UI.
      const [parent] = await db
        .select({ pipelineStage: studioInterview.pipelineStage })
        .from(studioInterviewSchedule)
        .innerJoin(
          studioInterview,
          eq(studioInterview.id, studioInterviewSchedule.interviewRecordId),
        )
        .where(
          and(
            eq(studioInterviewSchedule.id, roundId),
            eq(studioInterviewSchedule.organizationId, activeOrg.id),
          ),
        )
        .limit(1);
      if (!parent) {
        return c.json({ error: "记录不存在。" }, 404);
      }
      if (parent.pipelineStage !== "screening" && parent.pipelineStage !== "ai_interview") {
        return c.json(
          {
            error: "候选人已不在 AI 面试阶段，无法修改面试轮次。如需修改请先回退阶段或重新激活。",
          },
          409,
        );
      }

      const update: Partial<typeof studioInterviewSchedule.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (body.allowTextInput !== undefined) {
        update.allowTextInput = body.allowTextInput;
      }
      if (body.notes !== undefined) {
        update.notes = body.notes || null;
      }
      if (body.scheduledAt !== undefined) {
        update.scheduledAt =
          body.scheduledAt && body.scheduledAt.length > 0 ? new Date(body.scheduledAt) : null;
      }
      if (body.status !== undefined) {
        update.status = body.status;
      }

      const result = await db
        .update(studioInterviewSchedule)
        .set(update)
        .where(
          and(
            eq(studioInterviewSchedule.id, roundId),
            eq(studioInterviewSchedule.organizationId, activeOrg.id),
          ),
        )
        .returning({ id: studioInterviewSchedule.id });

      if (result.length === 0) {
        return c.json({ error: "记录不存在。" }, 404);
      }

      invalidateStudioInterviewCaches(activeOrg.id);
      const detail = await loadInterviewRoundDetail(roundId, activeOrg.id, visibilityScope);
      return c.json(detail, 200);
    },
  )
  .get("/:id/question-template-bindings", requirePermission("interview", "read"), async (c) => {
    // `:id` 为 roundId；绑定以 candidateId（interviewRecordId）为 FK。
    // `:id` is roundId; bindings use candidateId (interviewRecordId) as FK.
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const roundId = c.req.param("id");
    const visibilityScope = await loadVisibilityScope(
      activeOrg.id,
      c.var.member?.role,
      c.var.user?.id,
    );
    const candidateId = await resolveCandidateIdForRound(roundId, activeOrg.id, visibilityScope);
    if (!candidateId) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    // 懒绑定：确保此面试记录的适用模板全部挂上。
    // Lazy-bind so applicable templates created *after* this interview show
    // up in the section UI without requiring manual re-attach.
    await ensureApplicableBindings(candidateId);
    const data = await loadInterviewQuestionTemplateBindings(candidateId);
    return c.json(data, 200);
  })
  .put(
    "/:id/question-template-bindings",
    requirePermission("interview", "update"),
    zValidator(
      "json",
      z.object({ enabledTemplateIds: z.array(z.string().min(1)) }),
      jsonValidatorError("请求参数缺失。"),
    ),
    async (c) => {
      // `:id` 为 roundId；绑定以 candidateId（interviewRecordId）为 FK。
      // `:id` is roundId; bindings use candidateId (interviewRecordId) as FK.
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const roundId = c.req.param("id");
      const visibilityScope = await loadVisibilityScope(
        activeOrg.id,
        c.var.member?.role,
        c.var.user?.id,
      );
      const candidateId = await resolveCandidateIdForRound(roundId, activeOrg.id, visibilityScope);
      if (!candidateId) {
        return c.json({ error: "记录不存在。" }, 404);
      }
      const existing = await loadRecordById(candidateId, activeOrg.id);
      if (!existing) {
        return c.json({ error: "记录不存在。" }, 404);
      }

      const { enabledTemplateIds } = c.req.valid("json");
      await db.transaction(async (tx) => {
        await replaceInterviewBindings(
          tx,
          candidateId,
          enabledTemplateIds,
          existing.jobDescriptionId,
        );
      });

      const data = await loadInterviewQuestionTemplateBindings(candidateId);
      return c.json(data, 200);
    },
  )
  .post("/:id/reset", requirePermission("interview", "update"), async (c) => {
    // 平铺版重置：`:id` = roundId，保留绑定刷新 + 审计日志 + livekit 锚点清空。
    // Flat reset endpoint: `:id` = roundId; preserves binding refresh, audit log, and livekit anchor clearing.
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const roundId = c.req.param("id");
    const operatorId = c.var.user?.id ?? null;
    const visibilityScope = await loadVisibilityScope(
      activeOrg.id,
      c.var.member?.role,
      c.var.user?.id,
    );
    const existingRound = await loadInterviewRoundDetail(roundId, activeOrg.id, visibilityScope);
    if (!existingRound) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    // 加载轮次行 + 候选人上下文。/ Load round row + candidate context.
    const [scheduleRow] = await db
      .select()
      .from(studioInterviewSchedule)
      .where(
        and(
          eq(studioInterviewSchedule.id, roundId),
          eq(studioInterviewSchedule.organizationId, activeOrg.id),
        ),
      )
      .limit(1);

    if (!scheduleRow) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    if (scheduleRow.status !== "completed") {
      return c.json({ error: "只能重置已结束的轮次。" }, 400);
    }

    const candidateId = scheduleRow.interviewRecordId;
    const [candidateRow] = await db
      .select({
        jobDescriptionId: studioInterview.jobDescriptionId,
        pipelineStage: studioInterview.pipelineStage,
        status: studioInterview.status,
      })
      .from(studioInterview)
      .where(eq(studioInterview.id, candidateId))
      .limit(1);
    if (!candidateRow) {
      return c.json({ error: "候选人记录不存在。" }, 404);
    }
    // 已结案的候选人不可直接 reset 轮次；HR 需要先「重新激活」再操作。
    // 这样避免 outcome=rejected/hired 还能默默被 reset 改回 in_progress。
    // Closed candidates must be reactivated before any round can be reset;
    // prevents silently clobbering an outcome the HR already finalized.
    if (candidateRow.pipelineStage === "closed") {
      return c.json({ error: "已结案的候选人请先重新激活再重置轮次。" }, 400);
    }

    const now = new Date();
    const previousConversationId = scheduleRow.conversationId;
    const previousStatus = scheduleRow.status;

    await db.transaction(async (tx) => {
      await tx
        .update(studioInterviewSchedule)
        .set({
          conversationId: null,
          // 重置时一并清空热重连锚点，避免下一轮复用旧房间名/identity。
          // Clear hot-reconnect anchors so the next attempt mints a fresh room.
          disconnectedAt: null,
          liveKitParticipantIdentity: null,
          liveKitRoomName: null,
          sessionStartedAt: null,
          status: "pending",
          updatedAt: now,
        })
        .where(eq(studioInterviewSchedule.id, roundId));

      if (candidateRow.status === "completed") {
        await tx
          .update(studioInterview)
          .set({ status: "in_progress", updatedAt: now })
          .where(eq(studioInterview.id, candidateId));
      }

      // 重置即「以当下为准」：把题库模板绑定的快照刷新到最新版本。
      // Reset = "snapshot to now": refresh template bindings to the latest version.
      await refreshInterviewBindingsToLatest(tx, candidateId, candidateRow.jobDescriptionId);

      await tx.insert(interviewAuditLog).values({
        action: "round_reset",
        createdAt: now,
        detail: {
          previousConversationId,
          previousStatus,
          roundLabel: scheduleRow.roundLabel,
        },
        id: crypto.randomUUID(),
        interviewRecordId: candidateId,
        operatorId,
        organizationId: activeOrg.id,
        scheduleEntryId: roundId,
      });
    });

    invalidateStudioInterviewCaches(activeOrg.id);
    safeUpdateTag(cacheTags.interviewConversations);
    const detail = await loadInterviewRoundDetail(roundId, activeOrg.id, visibilityScope);
    return c.json(detail, 200);
  })
  .post(
    "/:id/transition",
    requirePermission("interview", "update"),
    zValidator("json", transitionInputSchema, jsonValidatorError("阶段流转参数无效。")),
    async (c) => {
      // 候选人阶段流转：用于「标记结案 + outcome」「重新激活」「推进到下一阶段」。
      // Candidate stage transition: covers close-with-outcome, reactivate, and stage advance.
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const candidateId = c.req.param("id");
      const operatorId = c.var.user?.id ?? null;
      const input = c.req.valid("json");

      const now = new Date();

      // 事务 + FOR UPDATE：读 + 计算 closedMeta merge + 写 + 审计 全部串行化。
      // 防止两个 HR 同时 close / reactivate 时 closedMeta.previousStage 写错。
      // Transaction + FOR UPDATE: serialize read → merge → write → audit so
      // concurrent close/reactivate calls can't mangle closedMeta.previousStage.
      const result = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({
            closedMeta: studioInterview.closedMeta,
            outcome: studioInterview.outcome,
            pipelineStage: studioInterview.pipelineStage,
          })
          .from(studioInterview)
          .where(
            and(
              eq(studioInterview.id, candidateId),
              eq(studioInterview.organizationId, activeOrg.id),
            ),
          )
          .for("update")
          .limit(1);
        if (!existing) {
          return { kind: "not_found" as const };
        }
        // 同态写入直接 200，避免无谓审计噪音。
        // No-op writes short-circuit to keep the audit log clean.
        if (
          existing.pipelineStage === input.pipelineStage &&
          existing.outcome === (input.outcome ?? "in_pipeline")
        ) {
          return { kind: "noop" as const };
        }

        const isClosing = input.pipelineStage === "closed";
        const wasClosed = existing.pipelineStage === "closed";

        // closed metadata 生命周期：
        //   进入 closed → 写 closedAt + closedReason + closedMeta（含 previousStage = 当前阶段）
        //   从 closed 回退 → 清空所有 closed metadata + 旧 schema 的 deprecated 标量字段
        //   非 closed 之间切换 → 保持不变（undefined）
        // Lifecycle: enter closed → write all closed metadata + previousStage;
        // exit closed → clear everything + scrub deprecated legacy scalars so the
        // reactivated record has no stale humanInterview/offer/writtenTest data.
        let closedAtUpdate: Date | null | undefined;
        let closedReasonUpdate: string | null | undefined;
        let closedMetaUpdate: typeof studioInterview.$inferInsert.closedMeta | undefined;
        // legacy 字段在结案/重新激活时一并 dual-write，避免 (新模型已 closed) 与
        // (legacy status 仍是 ready/in_progress) 造成的下游守卫漏洞（参见 livekit-token / forms）。
        // Dual-write the legacy scalars during closing/reactivating so downstream
        // consumers that still read the old columns see a consistent terminal state.
        let legacyStatusUpdate: StudioInterviewStatus | undefined;
        let humanInterviewScheduledAtUpdate: Date | null | undefined;
        let humanInterviewerIdUpdate: string | null | undefined;
        let offerSentAtUpdate: Date | null | undefined;
        let offerAcceptedAtUpdate: Date | null | undefined;
        let writtenTestScheduledAtUpdate: Date | null | undefined;
        let writtenTestScoreUpdate: string | null | undefined;
        if (isClosing) {
          closedAtUpdate = now;
          closedReasonUpdate = input.closedReason ?? null;
          // closedMeta merge：保留之前用户输入的字段（previousStage 自动覆写）。
          // Merge existing meta + input partial; previousStage is server-controlled.
          closedMetaUpdate = {
            ...existing.closedMeta,
            ...input.closedMeta,
            previousStage: existing.pipelineStage,
          };
          legacyStatusUpdate = "archived";
        } else if (wasClosed) {
          closedAtUpdate = null;
          closedReasonUpdate = null;
          closedMetaUpdate = null;
          // 重新激活：把 legacy 标量字段全部回到 null，避免 dialog prefill 看到陈旧值。
          // legacy status 回到非终态；UI 后续操作（如 launch-interview）会按需 dual-write 覆盖。
          // Reactivate: null out all deprecated scalars; legacy status returns to
          // a non-terminal value so downstream guards stop treating the candidate
          // as archived.
          humanInterviewScheduledAtUpdate = null;
          humanInterviewerIdUpdate = null;
          offerSentAtUpdate = null;
          offerAcceptedAtUpdate = null;
          writtenTestScheduledAtUpdate = null;
          writtenTestScoreUpdate = null;
          legacyStatusUpdate = "ready";
        }

        await tx
          .update(studioInterview)
          .set({
            closedAt: closedAtUpdate,
            closedMeta: closedMetaUpdate,
            closedReason: closedReasonUpdate,
            humanInterviewScheduledAt: humanInterviewScheduledAtUpdate,
            humanInterviewerId: humanInterviewerIdUpdate,
            offerAcceptedAt: offerAcceptedAtUpdate,
            offerSentAt: offerSentAtUpdate,
            outcome: input.outcome ?? "in_pipeline",
            pipelineStage: input.pipelineStage,
            status: legacyStatusUpdate,
            updatedAt: now,
            writtenTestScheduledAt: writtenTestScheduledAtUpdate,
            writtenTestScore: writtenTestScoreUpdate,
          })
          .where(eq(studioInterview.id, candidateId));

        await tx.insert(interviewAuditLog).values({
          action: "candidate_transition",
          createdAt: now,
          detail: {
            closedMeta: closedMetaUpdate ?? null,
            fromOutcome: existing.outcome,
            fromStage: existing.pipelineStage,
            reason: input.closedReason ?? null,
            toOutcome: input.outcome ?? "in_pipeline",
            toStage: input.pipelineStage,
          },
          id: crypto.randomUUID(),
          interviewRecordId: candidateId,
          operatorId,
          organizationId: activeOrg.id,
          scheduleEntryId: null,
        });
        return { kind: "ok" as const };
      });

      if (result.kind === "not_found") {
        return c.json({ error: "候选人记录不存在。" }, 404);
      }
      // noop 路径不写库也不刷缓存，但仍返回 200 让客户端把请求当作成功完成。
      // No-op path skips cache invalidation but still returns 200 to clients.
      if (result.kind === "ok") {
        invalidateStudioInterviewCaches(activeOrg.id);
      }
      return c.json({ ok: true }, 200);
    },
  )
  // ── 候选人期望 PATCH ──
  // partial merge：传啥更新啥，没传的保留旧值。
  // Candidate expectations PATCH; partial merge semantics.
  .patch(
    "/:id/candidate-expectations",
    requirePermission("interview", "update"),
    zValidator(
      "json",
      candidateExpectationsMetaSchema.partial(),
      jsonValidatorError("候选人期望参数无效。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const recordId = c.req.param("id");
      const input = c.req.valid("json");
      const now = new Date();

      // 事务 + 行锁：partial merge `{...existing, ...input}` 在并发下会丢字段，
      //   两个 HR 同时改不同字段会互相覆盖。FOR UPDATE 串行化合并；事务外读会等。
      // Transaction + row lock: the partial merge would otherwise lose
      // concurrent writes (two HRs editing different fields would overwrite
      // each other). FOR UPDATE serializes merges on the same record.
      const merged = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ candidateExpectationsMeta: studioInterview.candidateExpectationsMeta })
          .from(studioInterview)
          .where(
            and(eq(studioInterview.id, recordId), eq(studioInterview.organizationId, activeOrg.id)),
          )
          .for("update")
          .limit(1);
        if (!existing) {
          return null;
        }
        const next = { ...existing.candidateExpectationsMeta, ...input };
        await tx
          .update(studioInterview)
          .set({ candidateExpectationsMeta: next, updatedAt: now })
          .where(eq(studioInterview.id, recordId));
        return next;
      });

      if (!merged) {
        return c.json({ error: "候选人记录不存在。" }, 404);
      }
      invalidateStudioInterviewCaches(activeOrg.id);
      return c.json({ candidateExpectationsMeta: merged }, 200);
    },
  )
  // ── 真人复面单轮 endpoints ──
  // 注：这里的 `:id` 是 interviewRecordId（候选人级），跟 `/:id/reset` 的 roundId 语义不同。
  // 历史遗留——下次重构时统一改成 `/:recordId/...`。
  // Note: `:id` here = interview record id (candidate-level), unlike `/:id/reset`
  // which treats `:id` as roundId. Historical mismatch; clean up next refactor.
  .get("/:id/human-interview-rounds", requirePermission("interview", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const recordId = c.req.param("id");
    const rounds = await listHumanInterviewRounds(recordId, activeOrg.id);
    return c.json(rounds, 200);
  })
  .post(
    "/:id/human-interview-rounds",
    requirePermission("interview", "update"),
    zValidator(
      "json",
      humanInterviewRoundInputSchema,
      jsonValidatorError("真人复面轮次参数无效。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const recordId = c.req.param("id");

      // 候选人必须存在、归属当前组织、且未结案（已结案需先重新激活）。
      // Candidate must exist, belong to active org, and not be closed.
      const [candidate] = await db
        .select({ id: studioInterview.id, pipelineStage: studioInterview.pipelineStage })
        .from(studioInterview)
        .where(
          and(eq(studioInterview.id, recordId), eq(studioInterview.organizationId, activeOrg.id)),
        )
        .limit(1);
      if (!candidate) {
        return c.json({ error: "候选人记录不存在。" }, 404);
      }
      if (candidate.pipelineStage === "closed") {
        return c.json({ error: "已结案的候选人请先重新激活。" }, 400);
      }

      const input = c.req.valid("json");
      const created = await createHumanInterviewRound({
        input: {
          ...input,
          format: "online",
          location: null,
          meetingUrl: null,
        },
        interviewRecordId: recordId,
        organizationId: activeOrg.id,
      });
      // 创建第一轮时自动把 pipelineStage 推进到 human_interview（screening/ai_interview 等才推）。
      // Auto-advance pipelineStage when the first round goes in.
      await maybeAdvanceToHumanInterview(recordId, activeOrg.id);
      invalidateStudioInterviewCaches(activeOrg.id);
      return c.json(created, 200);
    },
  )
  .patch(
    "/:id/human-interview-rounds/:roundId",
    requirePermission("interview", "update"),
    zValidator(
      "json",
      humanInterviewRoundInputSchema
        .partial()
        .extend({ validUntil: nullableInstantDateTimeInputSchema }),
      jsonValidatorError("真人复面轮次参数无效。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const roundId = c.req.param("roundId");
      const input = c.req.valid("json");
      try {
        const updated = await editHumanInterviewRound({
          input,
          organizationId: activeOrg.id,
          roundId,
        });
        invalidateStudioInterviewCaches(activeOrg.id);
        return c.json(updated, 200);
      } catch (error) {
        if (error instanceof EditRoundError) {
          return c.json({ error: error.message }, error.status);
        }
        throw error;
      }
    },
  )
  .post(
    "/:id/human-interview-rounds/:roundId/complete",
    requirePermission("interview", "update"),
    zValidator("json", completeHumanRoundSchema, jsonValidatorError("标记完成参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const roundId = c.req.param("roundId");
      const { outcome, score, feedback } = c.req.valid("json");
      try {
        const updated = await completeHumanInterviewRound({
          feedback,
          organizationId: activeOrg.id,
          outcome,
          roundId,
          score,
        });
        const roomNames = await endHumanInterviewMeetingsByRound({
          organizationId: activeOrg.id,
          roundId,
        });
        await Promise.all(
          roomNames.map(async (roomName) => {
            try {
              await deleteHumanInterviewLiveKitRoom(roomName);
            } catch (error) {
              if (!(error instanceof HumanInterviewLiveKitConfigError)) {
                console.warn("failed to delete livekit human interview room", error);
              }
            }
          }),
        );
        invalidateStudioInterviewCaches(activeOrg.id);
        return c.json(updated, 200);
      } catch (error) {
        if (error instanceof EditRoundError) {
          return c.json({ error: error.message }, error.status);
        }
        throw error;
      }
    },
  )
  .post(
    "/:id/human-interview-rounds/:roundId/cancel",
    requirePermission("interview", "update"),
    zValidator("json", cancelHumanRoundSchema, jsonValidatorError("取消参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const roundId = c.req.param("roundId");
      const { reason } = c.req.valid("json");
      try {
        const { deletedLiveKitRoomNames, round: updated } =
          await cancelHumanInterviewRoundWithMeetings({
            organizationId: activeOrg.id,
            reason,
            roundId,
          });
        for (const roomName of deletedLiveKitRoomNames) {
          try {
            await deleteHumanInterviewLiveKitRoom(roomName);
          } catch (error) {
            if (!(error instanceof HumanInterviewLiveKitConfigError)) {
              console.warn("failed to delete livekit human interview room", error);
            }
          }
        }
        invalidateStudioInterviewCaches(activeOrg.id);
        return c.json(updated, 200);
      } catch (error) {
        if (error instanceof EditRoundError) {
          return c.json({ error: error.message }, error.status);
        }
        throw error;
      }
    },
  )
  // ── Offer 草稿 endpoints ──
  // `:id` 同上：interviewRecordId（候选人级）。/ `:id` = candidate id.
  .get("/:id/offer-drafts", requirePermission("interview", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const recordId = c.req.param("id");
    const drafts = await listOfferDrafts(recordId, activeOrg.id);
    return c.json(drafts, 200);
  })
  .post(
    "/:id/offer-drafts",
    requirePermission("interview", "update"),
    zValidator(
      "json",
      offerDraftInputSchema.extend({
        sendImmediately: z.boolean().optional(),
      }),
      jsonValidatorError("Offer 参数无效。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const recordId = c.req.param("id");

      const [candidate] = await db
        .select({ id: studioInterview.id, pipelineStage: studioInterview.pipelineStage })
        .from(studioInterview)
        .where(
          and(eq(studioInterview.id, recordId), eq(studioInterview.organizationId, activeOrg.id)),
        )
        .limit(1);
      if (!candidate) {
        return c.json({ error: "候选人记录不存在。" }, 404);
      }
      if (candidate.pipelineStage === "closed") {
        return c.json({ error: "已结案的候选人请先重新激活。" }, 400);
      }

      const { sendImmediately, ...input } = c.req.valid("json");
      const created = await createOfferDraft({
        input,
        interviewRecordId: recordId,
        organizationId: activeOrg.id,
        sendImmediately,
      });
      await maybeAdvanceToOffer(recordId, activeOrg.id);
      invalidateStudioInterviewCaches(activeOrg.id);
      return c.json(created, 200);
    },
  )
  .patch(
    "/:id/offer-drafts/:draftId",
    requirePermission("interview", "update"),
    zValidator("json", offerDraftInputSchema.partial(), jsonValidatorError("Offer 参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const draftId = c.req.param("draftId");
      const input = c.req.valid("json");
      try {
        const updated = await editOfferDraft({
          draftId,
          input,
          organizationId: activeOrg.id,
        });
        invalidateStudioInterviewCaches(activeOrg.id);
        return c.json(updated, 200);
      } catch (error) {
        if (error instanceof OfferDraftError) {
          return c.json({ error: error.message }, error.status);
        }
        throw error;
      }
    },
  )
  .post("/:id/offer-drafts/:draftId/send", requirePermission("interview", "update"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const draftId = c.req.param("draftId");
    try {
      const updated = await sendOfferDraft(draftId, activeOrg.id);
      invalidateStudioInterviewCaches(activeOrg.id);
      return c.json(updated, 200);
    } catch (error) {
      if (error instanceof OfferDraftError) {
        return c.json({ error: error.message }, error.status);
      }
      throw error;
    }
  })
  .post(
    "/:id/offer-drafts/:draftId/respond",
    requirePermission("interview", "update"),
    zValidator("json", offerResponseInputSchema, jsonValidatorError("响应参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const draftId = c.req.param("draftId");
      const { response, candidateCounter } = c.req.valid("json");
      try {
        const updated = await respondOfferDraft({
          candidateCounter,
          draftId,
          organizationId: activeOrg.id,
          response,
        });
        invalidateStudioInterviewCaches(activeOrg.id);
        return c.json(updated, 200);
      } catch (error) {
        if (error instanceof OfferDraftError) {
          return c.json({ error: error.message }, error.status);
        }
        throw error;
      }
    },
  )
  .post(
    "/:id/offer-drafts/:draftId/cancel",
    requirePermission("interview", "update"),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const draftId = c.req.param("draftId");
      try {
        const updated = await cancelOfferDraft(draftId, activeOrg.id);
        invalidateStudioInterviewCaches(activeOrg.id);
        return c.json(updated, 200);
      } catch (error) {
        if (error instanceof OfferDraftError) {
          return c.json({ error: error.message }, error.status);
        }
        throw error;
      }
    },
  )
  .delete("/:id", requirePermission("interview", "delete"), async (c) => {
    // 轮次级删除：`:id` = roundId。/ Round-level delete: `:id` = roundId.
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const roundId = c.req.param("id");
    const orgId = activeOrg.id;
    const result = await db.transaction(async (tx) => {
      // 阶段守卫：候选人已不在 AI 面试阶段时不允许删除 AI 轮次（防 UI 绕过）。
      // FOR UPDATE 串行化 parent 行，与并发 transition / launch-interview 互斥。
      // Stage guard against UI bypass; FOR UPDATE serializes against concurrent
      // transition / launch-interview on the same parent.
      const [parent] = await tx
        .select({
          pipelineStage: studioInterview.pipelineStage,
        })
        .from(studioInterviewSchedule)
        .innerJoin(
          studioInterview,
          eq(studioInterview.id, studioInterviewSchedule.interviewRecordId),
        )
        .where(
          and(
            eq(studioInterviewSchedule.id, roundId),
            eq(studioInterviewSchedule.organizationId, orgId),
          ),
        )
        .for("update", { of: studioInterview })
        .limit(1);
      if (!parent) {
        return { kind: "not_found" as const };
      }
      if (parent.pipelineStage !== "screening" && parent.pipelineStage !== "ai_interview") {
        return { kind: "locked" as const };
      }
      const removed = await tx
        .delete(studioInterviewSchedule)
        .where(
          and(
            eq(studioInterviewSchedule.id, roundId),
            eq(studioInterviewSchedule.organizationId, orgId),
          ),
        )
        .returning({
          interviewRecordId: studioInterviewSchedule.interviewRecordId,
        });
      if (removed.length === 0) {
        // 极端 race：parent 命中但 round 在 FOR UPDATE 之间被另一个事务删了。返 404。
        // Edge race: round vanished between the SELECT and DELETE; treat as not-found.
        return { kind: "not_found" as const };
      }
      await resetOrphanedAiInterviewParents(
        tx,
        orgId,
        removed.map((r) => r.interviewRecordId),
      );
      return { kind: "ok" as const };
    });
    if (result.kind === "not_found") {
      return c.json({ error: "记录不存在。" }, 404);
    }
    if (result.kind === "locked") {
      return c.json(
        {
          error: "候选人已不在 AI 面试阶段，无法删除面试轮次。如需删除请先回退阶段或重新激活。",
        },
        409,
      );
    }
    invalidateStudioInterviewCaches(orgId);
    return c.json({ success: true }, 200);
  })
  .post(
    "/bulk-delete",
    requirePermission("interview", "delete"),
    zValidator(
      "json",
      z.object({ ids: z.array(z.string()).nonempty() }),
      jsonValidatorError("缺少待删除的轮次 ID。"),
    ),
    async (c) => {
      // 批量轮次删除：ids 为 roundId 数组。/ Bulk round delete: ids are roundIds.
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { ids } = c.req.valid("json");
      const orgId = activeOrg.id;
      const result = await db.transaction(async (tx) => {
        // 联查每个 round 对应 parent 的 pipelineStage；任意一个超过 AI 阶段就拒整批，
        // 避免 partial 删除导致前端看到不一致状态。FOR UPDATE 锁 parent 行。
        // Join each round to its parent stage; reject the whole batch if any parent
        // is past AI to keep client view consistent. FOR UPDATE locks parents.
        const targets = await tx
          .select({
            pipelineStage: studioInterview.pipelineStage,
            roundId: studioInterviewSchedule.id,
          })
          .from(studioInterviewSchedule)
          .innerJoin(
            studioInterview,
            eq(studioInterview.id, studioInterviewSchedule.interviewRecordId),
          )
          .where(
            and(
              inArray(studioInterviewSchedule.id, ids),
              eq(studioInterviewSchedule.organizationId, orgId),
            ),
          )
          .for("update", { of: studioInterview });
        const locked = targets.find(
          (t) => t.pipelineStage !== "screening" && t.pipelineStage !== "ai_interview",
        );
        if (locked) {
          return { kind: "locked" as const };
        }
        const rows = await tx
          .delete(studioInterviewSchedule)
          .where(
            and(
              inArray(studioInterviewSchedule.id, ids),
              eq(studioInterviewSchedule.organizationId, orgId),
            ),
          )
          .returning({
            interviewRecordId: studioInterviewSchedule.interviewRecordId,
          });
        if (rows.length > 0) {
          await resetOrphanedAiInterviewParents(
            tx,
            orgId,
            rows.map((r) => r.interviewRecordId),
          );
        }
        return { kind: "ok" as const, removed: rows };
      });
      if (result.kind === "locked") {
        return c.json(
          {
            error: "存在已超过 AI 面试阶段的候选人，无法批量删除。请先回退阶段或拆分操作。",
          },
          409,
        );
      }
      invalidateStudioInterviewCaches(orgId);
      return c.json({ deletedCount: result.removed.length, success: true }, 200);
    },
  )
  .route("/round-emails", roundEmailsRouter);
