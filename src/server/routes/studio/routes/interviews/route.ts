import type { ContentfulStatusCode } from "hono/utils/http-status";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/server/db";
import {
  candidateFormSubmission,
  interviewAuditLog,
  interviewConversation,
  interviewer,
  jobDescription,
  jobDescriptionInterviewer,
  studioInterview,
  studioInterviewSchedule,
} from "@/lib/shared/db/schema";
import {
  buildAgentInstructions,
  resolveClosingPrompt,
  resolveOpeningPrompt,
} from "@/lib/shared/interview/agent-instructions";
import {
  parseResumePayloadInput,
  parseScheduleEntriesInput,
  studioInterviewFormSchema,
  studioInterviewUpdateSchema,
  toNullableString,
} from "@/lib/shared/studio-interviews";
import {
  analyzeResumeFile,
  generateInterviewQuestionsForProfile,
} from "@/server/agents/resume-analysis-agent";
import { factory, jsonValidatorError } from "@/server/factory";
import { getGlobalConfig } from "@/server/routes/studio/routes/global-config/dao";
import { loadSubmissionsByInterview } from "@/server/routes/studio/routes/forms/dao/submissions";
import {
  autoBindApplicableTemplates,
  ensureApplicableBindings,
  loadInterviewPresetQuestions,
  loadInterviewQuestionTemplateBindings,
  refreshInterviewBindingsToLatest,
  replaceInterviewBindings,
} from "@/server/routes/studio/routes/interview-questions/dao/bindings";
import { queryInterviewConversationReportsByRound } from "@/server/routes/studio/routes/interviews/dao/interview-conversations";
import { queryInterviewDedup } from "@/server/routes/studio/routes/interviews/dao/studio-interviews";
import {
  loadInterviewRoundDetail,
  queryPaginatedInterviewRounds,
  resolveCandidateIdForRound,
  summarizeInterviewRoundCounts,
} from "@/server/routes/studio/routes/interviews/dao/interview-rounds";
import {
  buildScheduleRows,
  loadRecordById,
  normalizeResumeFile,
  serializeRecord,
  storeInterviewResume,
  toBadRequest,
} from "@/server/routes/interview/utils";
import { requirePermission } from "@/server/middlewares/permission";
import { invalidateStudioInterviewCaches, safeUpdateTag } from "@/server/cache-tags";
import { getObjectStream, presignRecordingGetObjectUrl } from "@/lib/server/s3";

const dedupCheckInputSchema = z.object({
  email: z.string().trim().max(200).nullable().optional(),
  name: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});

export const studioInterviewsRouter = factory
  .createApp()
  .get("/summary", requirePermission("interview", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const summary = await summarizeInterviewRoundCounts(activeOrg.id);
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
      const result = await queryPaginatedInterviewRounds(
        activeOrg.id,
        { search: q.search, status: q.status },
        { page: q.page, pageSize: q.pageSize, sortBy: q.sortBy, sortOrder: q.sortOrder },
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
      );

      await db.transaction(async (tx) => {
        await tx.insert(studioInterview).values(record);
        await tx.insert(studioInterviewSchedule).values(scheduleRows);
        await autoBindApplicableTemplates(tx, interviewRecordId, record.jobDescriptionId);
      });

      invalidateStudioInterviewCaches();
      return c.json(serializeRecord(record, scheduleRows), 201);
    } catch (error) {
      const result = toBadRequest(error);
      return c.json({ error: result.error }, { status: result.status as ContentfulStatusCode });
    }
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
    const detail = await loadInterviewRoundDetail(id, activeOrg.id);

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
    const candidateId = await resolveCandidateIdForRound(id, activeOrg.id);
    if (!candidateId) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    const existing = await loadRecordById(candidateId, activeOrg.id);

    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    if (!existing.resumeStorageKey) {
      return c.json({ error: "该候选人没有可预览的简历 PDF。" }, 404);
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
        "Content-Type": object.contentType ?? "application/pdf",
        ...(object.contentLength !== undefined && {
          "Content-Length": String(object.contentLength),
        }),
      },
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
    const candidateId = await resolveCandidateIdForRound(id, activeOrg.id);
    if (!candidateId) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const existing = await loadRecordById(candidateId, activeOrg.id);

    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    let jobDescriptionPrompt: string | null = null;
    let interviewers: { name: string; prompt: string }[] = [];

    if (existing.jobDescriptionId) {
      const [jdRow] = await db
        .select({
          prompt: jobDescription.prompt,
        })
        .from(jobDescription)
        .where(eq(jobDescription.id, existing.jobDescriptionId))
        .limit(1);
      jobDescriptionPrompt = jdRow?.prompt ?? null;

      const interviewerRows = await db
        .select({ name: interviewer.name, prompt: interviewer.prompt })
        .from(jobDescriptionInterviewer)
        .innerJoin(interviewer, eq(jobDescriptionInterviewer.interviewerId, interviewer.id))
        .where(eq(jobDescriptionInterviewer.jobDescriptionId, existing.jobDescriptionId));
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

    // 注入全局配置（公司情况 / 开场白 / 结束语），保证预览与运行时一致。
    // Inject global config so the preview matches what the agent will receive.
    const globalCfg = await getGlobalConfig(activeOrg.id);
    const candidateName = existing.candidateName?.trim() || "候选人";
    const targetRole = existing.targetRole?.trim() || "未指定岗位";
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
      targetRole: existing.targetRole,
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
  .get("/:id/reports", requirePermission("interview", "read"), async (c) => {
    // `:id` 为 roundId；报告按 scheduleEntryId 过滤，仅返回当前轮次的 conversations。
    // `:id` is roundId; reports are filtered by scheduleEntryId (per-round, not per-candidate).
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const roundId = c.req.param("id");
    // 通过解析 candidateId 来验证 org 归属（不存在则 404）。
    // Validate org scope by resolving the candidate (handles 404).
    const candidateId = await resolveCandidateIdForRound(roundId, activeOrg.id);
    if (!candidateId) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const reports = await queryInterviewConversationReportsByRound(roundId);
    return c.json(reports, 200);
  })
  .get("/:id/recordings/:conversationId", requirePermission("interview", "read"), async (c) => {
    // `:id` 为 roundId；返回该轮面试录像的 S3 预签名播放 URL (10 分钟有效).
    // `:id` is roundId; return a 10-min presigned URL for the round's recording mp4.
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    // roundId = scheduleEntryId
    const roundId = c.req.param("id");
    const conversationId = c.req.param("conversationId");

    // 通过解析 candidateId 验证 org 归属。
    // Validate org scope via candidateId resolution.
    const candidateId = await resolveCandidateIdForRound(roundId, activeOrg.id);
    if (!candidateId) {
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
          eq(interviewConversation.organizationId, activeOrg.id),
        ),
      )
      .limit(1);

    // 防止跨轮次访问: conversation 必须属于当前 roundId (scheduleEntryId)。
    // Prevent cross-round access: the conversation must belong to this roundId.
    if (!conversation || conversation.scheduleEntryId !== roundId) {
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
  .get("/:id/form-submissions", requirePermission("interview", "read"), async (c) => {
    // `:id` 为 roundId；表单与 candidateId 绑定，通过解析后传给查询。
    // `:id` is roundId; form submissions are keyed by candidateId — resolve it first.
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const roundId = c.req.param("id");
    const candidateId = await resolveCandidateIdForRound(roundId, activeOrg.id);
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

      const candidateId = await resolveCandidateIdForRound(roundId, activeOrg.id);
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
  // oxlint-disable-next-line complexity -- Patch handler validates, normalizes, and coordinates schedule updates in one flow.
  .patch("/:id", requirePermission("interview", "update"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");

    try {
      const existing = await loadRecordById(id, activeOrg.id);

      if (!existing) {
        return c.json({ error: "记录不存在。" }, 404);
      }

      const formData = await c.req.formData();
      const parsedScheduleEntries = parseScheduleEntriesInput(formData.get("scheduleEntries"));
      const editedQuestionsRaw = toNullableString(formData.get("editedQuestions"));
      const editedQuestions = editedQuestionsRaw
        ? (JSON.parse(editedQuestionsRaw) as typeof existing.interviewQuestions)
        : null;

      // 候选人身份字段（姓名、邮箱、电话、岗位、JD、备注、简历）由简历库 PATCH 专属管理，
      // 此处仅校验 scheduleEntries 与 status，忽略请求中的候选人字段。
      // Candidate-identity fields (name, email, phone, role, JD, notes, resume) are
      // owned exclusively by the resume-library PATCH; only scheduleEntries and status
      // are consumed here — any candidate fields in the request are silently ignored.
      const input = studioInterviewUpdateSchema.safeParse({
        candidateEmail: toNullableString(formData.get("candidateEmail")) ?? "",
        candidateName: toNullableString(formData.get("candidateName")) ?? "",
        candidatePhone: toNullableString(formData.get("candidatePhone")) ?? "",
        jobDescriptionId: toNullableString(formData.get("jobDescriptionId")),
        notes: toNullableString(formData.get("notes")) ?? "",
        scheduleEntries: parsedScheduleEntries,
        status: toNullableString(formData.get("status")) ?? existing.status,
        targetRole: toNullableString(formData.get("targetRole")) ?? "",
      });

      if (!input.success) {
        return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
      }

      const now = new Date();

      const existingScheduleRows = await db
        .select()
        .from(studioInterviewSchedule)
        .where(eq(studioInterviewSchedule.interviewRecordId, id));
      const scheduleRows = buildScheduleRows(
        activeOrg.id,
        id,
        input.data.scheduleEntries,
        now,
        existingScheduleRows,
      );

      const hasPendingRounds = scheduleRows.some((r) => r.status === "pending");
      let resolvedStatus = input.data.status;

      if (resolvedStatus === "completed" && hasPendingRounds) {
        resolvedStatus = "in_progress";
      }

      // 仅写入面试侧字段；候选人身份字段不在此处修改。
      // Only interview-owned fields are written; candidate-identity fields are never updated here.
      const nextRecord = {
        interviewQuestions: editedQuestions ?? existing.interviewQuestions,
        status: resolvedStatus,
        updatedAt: now,
      } satisfies Partial<typeof studioInterview.$inferInsert>;

      await db.transaction(async (tx) => {
        await tx.update(studioInterview).set(nextRecord).where(eq(studioInterview.id, id));
        await tx
          .delete(studioInterviewSchedule)
          .where(eq(studioInterviewSchedule.interviewRecordId, id));
        await tx.insert(studioInterviewSchedule).values(scheduleRows);
      });

      invalidateStudioInterviewCaches();
      const updatedRecord = await loadRecordById(id, activeOrg.id);
      return c.json(updatedRecord, 200);
    } catch (error) {
      const result = toBadRequest(error);
      return c.json({ error: result.error }, { status: result.status as ContentfulStatusCode });
    }
  })
  .get("/:id/question-template-bindings", requirePermission("interview", "read"), async (c) => {
    // `:id` 为 roundId；绑定以 candidateId（interviewRecordId）为 FK。
    // `:id` is roundId; bindings use candidateId (interviewRecordId) as FK.
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const roundId = c.req.param("id");
    const candidateId = await resolveCandidateIdForRound(roundId, activeOrg.id);
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
      const candidateId = await resolveCandidateIdForRound(roundId, activeOrg.id);
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
  .post("/:id/rounds/:roundId/reset", requirePermission("interview", "update"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const roundId = c.req.param("roundId");
    const operatorId = c.var.user?.id ?? null;

    const existing = await loadRecordById(id, activeOrg.id);

    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    const targetEntry = existing.scheduleEntries.find((e) => e.id === roundId);

    if (!targetEntry) {
      return c.json({ error: "轮次不存在。" }, 404);
    }

    if (targetEntry.status !== "completed") {
      return c.json({ error: "只能重置已结束的轮次。" }, 400);
    }

    const now = new Date();

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

      if (existing.status === "completed") {
        await tx
          .update(studioInterview)
          .set({
            status: "in_progress",
            updatedAt: now,
          })
          .where(eq(studioInterview.id, id));
      }

      // 重置即「以当下为准」：把题库模板绑定的快照刷新到最新版本，
      // 并补上自上次绑定以来新建的适用模板。
      // Reset = "snapshot to now": refresh template bindings to the
      // latest version and lazy-bind any newly-applicable templates.
      await refreshInterviewBindingsToLatest(tx, id, existing.jobDescriptionId);

      await tx.insert(interviewAuditLog).values({
        action: "round_reset",
        createdAt: now,
        detail: {
          previousConversationId: targetEntry.conversationId,
          previousStatus: targetEntry.status,
          roundLabel: targetEntry.roundLabel,
        },
        id: crypto.randomUUID(),
        interviewRecordId: id,
        operatorId,
        organizationId: activeOrg.id,
        scheduleEntryId: roundId,
      });
    });

    invalidateStudioInterviewCaches();
    safeUpdateTag("interview-conversations");
    const updatedRecord = await loadRecordById(id, activeOrg.id);
    return c.json(updatedRecord, 200);
  })
  .patch(
    "/:id/rounds/:roundId",
    requirePermission("interview", "update"),
    zValidator(
      "json",
      z.object({ allowTextInput: z.boolean() }),
      jsonValidatorError("请求体格式不正确。"),
    ),
    async (c) => {
      // 单轮次内联编辑：当前仅支持切换"是否允许文本输入"。
      // Per-round inline edit: currently only toggles allowTextInput.
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const id = c.req.param("id");
      const roundId = c.req.param("roundId");
      const { allowTextInput } = c.req.valid("json");

      const existing = await loadRecordById(id, activeOrg.id);

      if (!existing) {
        return c.json({ error: "记录不存在。" }, 404);
      }

      const targetEntry = existing.scheduleEntries.find((e) => e.id === roundId);

      if (!targetEntry) {
        return c.json({ error: "轮次不存在。" }, 404);
      }

      if (targetEntry.status === "completed") {
        return c.json({ error: "已结束的轮次无法修改设置。" }, 400);
      }

      await db
        .update(studioInterviewSchedule)
        .set({
          allowTextInput,
          updatedAt: new Date(),
        })
        .where(eq(studioInterviewSchedule.id, roundId));

      invalidateStudioInterviewCaches();
      const updatedRecord = await loadRecordById(id, activeOrg.id);
      return c.json(updatedRecord, 200);
    },
  )
  .delete("/:id", requirePermission("interview", "delete"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const existing = await loadRecordById(id, activeOrg.id);

    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    await db
      .delete(studioInterview)
      .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, activeOrg.id)));
    invalidateStudioInterviewCaches();
    return c.json({ success: true }, 200);
  })
  .post(
    "/bulk-delete",
    requirePermission("interview", "delete"),
    zValidator(
      "json",
      z.object({ ids: z.array(z.string()).nonempty() }),
      jsonValidatorError("缺少待删除的记录 ID。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { ids: rawIds } = c.req.valid("json");
      const ids = rawIds.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      );

      if (ids.length === 0) {
        return c.json({ error: "缺少待删除的记录 ID。" }, 400);
      }

      const result = await db
        .delete(studioInterview)
        .where(
          and(inArray(studioInterview.id, ids), eq(studioInterview.organizationId, activeOrg.id)),
        )
        .returning({ id: studioInterview.id });

      invalidateStudioInterviewCaches();
      return c.json({ deletedCount: result.length, success: true }, 200);
    },
  );
