import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@app/server/lib/server/db";
import {
  candidateFormSubmission,
  interviewAuditLog,
  studioInterview,
  studioInterviewSchedule,
} from "@arc/db-schema/schema";
import { resolveRecruitingVisibilityScope } from "@app/server/server/access/recruiting-visibility";
import type { RecruitingVisibilityScope } from "@app/server/server/access/recruiting-visibility";
import { buildInterviewDispatchContract } from "@arc/shared/interview/dispatch-contract";
import {
  nullableInstantDateTimeInputSchema,
  scheduleEntryStatusSchema,
} from "@arc/db-schema/studio-interviews";
import { factory, jsonValidatorError } from "@app/server/server/factory";
import { loadSubmissionsByInterview } from "@app/server/server/routes/studio/routes/forms/dao/submissions";
import {
  ensureApplicableBindings,
  loadInterviewQuestionTemplateBindings,
  replaceInterviewBindings,
} from "@app/server/server/routes/studio/routes/interview-questions/dao/bindings";
import {
  flattenPresetQuestionsFromContextSnapshot,
  loadActiveInterviewContextSnapshot,
  refreshInterviewContextSnapshot,
} from "@app/server/server/routes/studio/routes/interviews/dao/context-snapshots";
import { loadHumanInterviewMeetingById } from "@app/server/server/routes/studio/routes/interviews/dao/human-interview-meetings";
import {
  loadInterviewRoundDetail,
  resolveCandidateIdForRound,
} from "@app/server/server/routes/studio/routes/interviews/dao/interview-rounds";
import { loadLatestEndedInterviewConversationForRound } from "@app/server/server/routes/studio/routes/interviews/dao/evaluation-documents";
import { loadLatestFeishuDocumentUrls } from "@app/server/server/routes/studio/routes/interviews/dao/feishu-document-urls";
import { notifyInterviewSummaryReady } from "@app/server/server/routes/agent/utils/feishu-interview-notifications";
import {
  hasExistingInterviewAnswers,
  isInterviewQuestionSetComplete,
} from "@arc/shared/interview/question-outcomes";
import { recordingsRouter } from "@app/server/server/routes/studio/routes/interviews/routes/recordings/route";
import { reportsRouter } from "@app/server/server/routes/studio/routes/interviews/routes/reports/route";
import { loadRecordById } from "@app/server/server/routes/interview/utils";
import { requirePermission } from "@app/server/server/middlewares/permission";
import { invalidateStudioInterviewCaches } from "@app/server/server/cache-tags";
import { getObjectBytes, getObjectStream } from "@app/server/lib/server/s3";
import { createPptxPreviewPdfResponse } from "@app/server/server/routes/studio/utils/pptx-preview";

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

function resolveScheduledWindow(
  input: {
    scheduledAt?: string | null;
    scheduledEndAt?: string | null;
  },
  existing: {
    scheduledAt: string | null;
    scheduledEndAt: string | null;
  },
):
  | { endAt: string | null; error: null; startAt: string | null }
  | { endAt: null; error: string; startAt: null } {
  const startAt =
    input.scheduledAt === undefined ? existing.scheduledAt : input.scheduledAt || null;
  const endAt =
    input.scheduledEndAt === undefined ? existing.scheduledEndAt : input.scheduledEndAt || null;

  if (Boolean(startAt) !== Boolean(endAt)) {
    return {
      endAt: null,
      error: "面试开始时间和结束时间需要同时填写。",
      startAt: null,
    };
  }
  if (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt)) {
    return {
      endAt: null,
      error: "面试结束时间必须晚于开始时间。",
      startAt: null,
    };
  }
  return { endAt, error: null, startAt };
}

export const studioInterviewDetailRouter = factory
  .createApp()
  .get(
    "/human-interview-meetings/:meetingId",
    requirePermission("humanInterview", "read"),
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
  .post("/:id/evaluation-document", requirePermission("interview", "update"), async (c) => {
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
    const round = await loadInterviewRoundDetail(roundId, activeOrg.id, visibilityScope);
    if (!round) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    // Always resolve the latest ended attempt on the server. The list row can
    // become stale while a candidate reconnects or restarts the same round.
    const conversation = await loadLatestEndedInterviewConversationForRound(roundId, activeOrg.id);
    if (!conversation?.interviewRecordId) {
      return c.json({ error: "本轮面试还没有可用于生成评价表的已结束记录。" }, 409);
    }
    if (conversation.summaryStatus !== "ready") {
      return c.json({ error: "最新一轮面试报告尚未生成完成，请稍后再试。" }, 409);
    }
    if (
      !isInterviewQuestionSetComplete(conversation.dataCollectionResults) &&
      !hasExistingInterviewAnswers(conversation.dataCollectionResults)
    ) {
      return c.json({ error: "最新一轮面试没有可用于生成评价表的候选人回答。" }, 409);
    }

    await notifyInterviewSummaryReady({
      allowIncomplete: true,
      conversationId: conversation.conversationId,
      interviewRecordId: conversation.interviewRecordId,
    });
    const documentUrls = await loadLatestFeishuDocumentUrls({
      ids: [conversation.conversationId],
      key: "conversationId",
      organizationId: activeOrg.id,
    });
    const feishuDocumentUrl = documentUrls.get(conversation.conversationId) ?? null;
    if (!feishuDocumentUrl) {
      return c.json({ error: "评价表生成失败。请确认面试创建人已绑定飞书账号后重试。" }, 422);
    }

    invalidateStudioInterviewCaches(activeOrg.id);
    return c.json(
      {
        conversationId: conversation.conversationId,
        feishuDocumentUrl,
      },
      200,
    );
  })
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
  // oxlint-disable-next-line complexity -- Route handler performs auth, round resolution, snapshot loading, and preview rendering in one request.
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

    const contextSnapshot = await loadActiveInterviewContextSnapshot(candidateId);
    if (!contextSnapshot) {
      return c.json({ error: "面试上下文尚未创建，请先发起 AI 面试。" }, 404);
    }
    const snapshotPayload = contextSnapshot.payload;
    const jobDescriptionPresetQuestions =
      flattenPresetQuestionsFromContextSnapshot(snapshotPayload);

    const baseContext = {
      allowTextInput: false,
      candidateName: snapshotPayload.candidate.candidateName,
      closingInstructions: snapshotPayload.globalConfig.closingInstructions,
      companyContext: snapshotPayload.globalConfig.companyContext ?? "",
      interviewQuestions: snapshotPayload.personalizedQuestions,
      interviewRecordId: candidateId,
      jobDescriptionPresetQuestions,
      jobDescriptionPrompt: snapshotPayload.jobDescription?.prompt ?? null,
      openingInstructions: snapshotPayload.globalConfig.openingInstructions,
      recordingEnabled: false,
      recordingFileKey: null,
      resumeProfile: snapshotPayload.candidate.resumeProfile,
      roundId: id,
      targetRole: snapshotPayload.jobDescription?.name ?? null,
    } as const;

    const buildVariant = (
      selectedInterviewer: (typeof snapshotPayload.interviewers)[number] | null,
    ) => {
      const contract = buildInterviewDispatchContract({
        ...baseContext,
        selectedInterviewer,
      });
      return {
        closingPrompt: contract.prompts.closing,
        instructions: contract.prompts.system,
        interviewerName: contract.selectedInterviewer?.name ?? null,
        openingPrompt: contract.prompts.opening,
      };
    };

    const variants =
      snapshotPayload.interviewers.length > 0
        ? snapshotPayload.interviewers.map(buildVariant)
        : [buildVariant(null)];

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

      const now = new Date();
      const operatorId = c.var.user?.id ?? null;
      const result = await db.transaction(async (tx) => {
        const deleted = await tx
          .delete(candidateFormSubmission)
          .where(
            and(
              eq(candidateFormSubmission.id, submissionId),
              eq(candidateFormSubmission.interviewRecordId, candidateId),
            ),
          )
          .returning({ id: candidateFormSubmission.id });
        if (deleted.length === 0) {
          return null;
        }

        const refreshed = await refreshInterviewContextSnapshot(tx, {
          createdAt: now,
          createdBy: operatorId,
          interviewRecordId: candidateId,
          reason: "manual_refresh",
          scheduleEntryId: roundId,
        });
        await tx.insert(interviewAuditLog).values({
          action: "context_snapshot_refresh",
          createdAt: now,
          detail: {
            reason: "form_submission_reset",
            snapshotId: refreshed.id,
            snapshotVersion: refreshed.version,
            submissionId,
          },
          id: crypto.randomUUID(),
          interviewRecordId: candidateId,
          operatorId,
          organizationId: activeOrg.id,
          scheduleEntryId: roundId,
        });
        return refreshed;
      });

      if (!result) {
        return c.json({ error: "答卷不存在或已被重置。" }, 404);
      }

      return c.json(
        {
          snapshot: result,
          success: true,
        },
        200,
      );
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
        scheduledEndAt: nullableInstantDateTimeInputSchema,
        status: scheduleEntryStatusSchema.optional(),
      }),
      jsonValidatorError("请求参数无效。"),
    ),
    async (c) => {
      // 轮次级 PATCH：仅更新 round 字段。
      // Round-level PATCH: updates only round fields.
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
      const scheduledWindow = resolveScheduledWindow(body, existingRound);
      if (scheduledWindow.error) {
        return c.json({ error: scheduledWindow.error }, 400);
      }
      if (body.scheduledAt !== undefined) {
        update.scheduledAt = scheduledWindow.startAt ? new Date(scheduledWindow.startAt) : null;
      }
      if (body.scheduledEndAt !== undefined) {
        update.scheduledEndAt = scheduledWindow.endAt ? new Date(scheduledWindow.endAt) : null;
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
      if (!detail) {
        return c.json({ error: "更新后的面试轮次读取失败。" }, 500);
      }
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
  .post("/:id/context-snapshot/refresh", requirePermission("interview", "update"), async (c) => {
    // Explicit operator action: refresh this interview's frozen runtime
    // context to current templates/config. Ordinary template edits do not
    // affect existing snapshots.
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

    const now = new Date();
    const operatorId = c.var.user?.id ?? null;
    const snapshot = await db.transaction(async (tx) => {
      const refreshed = await refreshInterviewContextSnapshot(tx, {
        createdAt: now,
        createdBy: operatorId,
        interviewRecordId: candidateId,
        reason: "manual_refresh",
        scheduleEntryId: roundId,
      });
      await tx.insert(interviewAuditLog).values({
        action: "context_snapshot_refresh",
        createdAt: now,
        detail: {
          snapshotId: refreshed.id,
          snapshotVersion: refreshed.version,
        },
        id: crypto.randomUUID(),
        interviewRecordId: candidateId,
        operatorId,
        organizationId: activeOrg.id,
        scheduleEntryId: roundId,
      });
      return refreshed;
    });

    invalidateStudioInterviewCaches(activeOrg.id);
    return c.json({ snapshot }, 200);
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
  );
