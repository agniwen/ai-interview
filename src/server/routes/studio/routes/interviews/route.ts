import type { ContentfulStatusCode } from "hono/utils/http-status";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  candidateFormSubmission,
  interviewAuditLog,
  interviewConversation,
  interviewer,
  jobDescription,
  jobDescriptionInterviewer,
  studioInterview,
  studioInterviewSchedule,
} from "@/lib/db/schema";
import {
  buildAgentInstructions,
  resolveClosingPrompt,
  resolveOpeningPrompt,
} from "@/lib/interview/agent-instructions";
import {
  parseResumePayloadInput,
  parseScheduleEntriesInput,
  studioInterviewFormSchema,
  studioInterviewUpdateSchema,
  toNullableString,
} from "@/lib/studio-interviews";
import {
  analyzeResumeFile,
  generateInterviewQuestionsForProfile,
} from "@/server/agents/resume-analysis-agent";
import { factory } from "@/server/factory";
import { getGlobalConfig } from "@/server/routes/studio/routes/global-config/dao";
import { loadSubmissionsByInterview } from "@/server/routes/studio/routes/forms/dao";
import {
  autoBindApplicableTemplates,
  dropJobDescriptionBindings,
  ensureApplicableBindings,
  loadInterviewPresetQuestions,
  loadInterviewQuestionTemplateBindings,
  refreshInterviewBindingsToLatest,
  replaceInterviewBindings,
} from "@/server/routes/studio/routes/interview-questions/dao";
import { queryInterviewConversationReports } from "@/server/routes/studio/routes/interviews/dao/interview-conversations";
import {
  queryInterviewDedup,
  queryPaginatedStudioInterviewRecords,
  queryStudioInterviewSummary,
} from "@/server/routes/studio/routes/interviews/dao/studio-interviews";
import {
  buildScheduleRows,
  loadRecordById,
  normalizeResumeFile,
  safeUpdateTag,
  serializeRecord,
  storeInterviewResume,
  toBadRequest,
} from "@/server/routes/interview/utils";
import { getObjectStream, presignGetObjectUrl } from "@/lib/s3";

const dedupCheckInputSchema = z.object({
  email: z.string().trim().max(200).nullable().optional(),
  name: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});

export const studioInterviewsRouter = factory
  .createApp()
  .get("/summary", async (c) => {
    const summary = await queryStudioInterviewSummary();
    return c.json(summary);
  })
  .post("/dedup-check", async (c) => {
    const body = (await c.req.json().catch(() => null)) as unknown;
    const input = dedupCheckInputSchema.safeParse(body ?? {});
    if (!input.success) {
      return c.json({ error: input.error.issues[0]?.message ?? "请求参数无效。" }, 400);
    }
    const matches = await queryInterviewDedup({
      email: input.data.email ?? null,
      name: input.data.name ?? null,
      phone: input.data.phone ?? null,
    });
    return c.json({ matches });
  })
  .get("/", async (c) => {
    const result = await queryPaginatedStudioInterviewRecords(
      {
        search: c.req.query("search"),
        status: c.req.query("status"),
      },
      {
        page: c.req.query("page"),
        pageSize: c.req.query("pageSize"),
        sortBy: c.req.query("sortBy"),
        sortOrder: c.req.query("sortOrder"),
      },
    );

    return c.json(result);
  })
  // oxlint-disable-next-line complexity -- CRUD handler orchestrates parse → validate → persist in one flow.
  .post("/", async (c) => {
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
          ? await storeInterviewResume(interviewRecordId, resume, c.var.user.id)
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
        resumeContentHash,
        resumeFileName: analysis?.fileName ?? resume?.name ?? null,
        resumeProfile: analysis?.resumeProfile ?? null,
        resumeStorageKey,
        status: input.data.status,
        targetRole: input.data.targetRole || analysis?.resumeProfile.targetRoles[0] || null,
        updatedAt: now,
      } satisfies typeof studioInterview.$inferInsert;
      const scheduleRows = buildScheduleRows(interviewRecordId, input.data.scheduleEntries, now);

      await db.transaction(async (tx) => {
        await tx.insert(studioInterview).values(record);
        await tx.insert(studioInterviewSchedule).values(scheduleRows);
        await autoBindApplicableTemplates(tx, interviewRecordId, record.jobDescriptionId);
      });

      safeUpdateTag("studio-interviews");
      return c.json(serializeRecord(record, scheduleRows), 201);
    } catch (error) {
      const result = toBadRequest(error);
      return c.json({ error: result.error }, { status: result.status as ContentfulStatusCode });
    }
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const record = await loadRecordById(id);

    if (!record) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    return c.json(record);
  })
  .get("/:id/resume", async (c) => {
    const id = c.req.param("id");
    const existing = await loadRecordById(id);

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
  .get("/:id/agent-instructions", async (c) => {
    const id = c.req.param("id");
    const existing = await loadRecordById(id);

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
    await ensureApplicableBindings(id);
    const jobDescriptionPresetQuestions = await loadInterviewPresetQuestions(id);

    // 注入全局配置（公司情况 / 开场白 / 结束语），保证预览与运行时一致。
    // Inject global config so the preview matches what the agent will receive.
    const globalCfg = await getGlobalConfig();
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

    return c.json({ variants });
  })
  .get("/:id/reports", async (c) => {
    const id = c.req.param("id");
    const existing = await loadRecordById(id);

    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    const reports = await queryInterviewConversationReports(id);
    return c.json(reports);
  })
  .get("/:id/recordings/:conversationId", async (c) => {
    // 返回该轮面试录像的 S3 预签名播放 URL (10 分钟有效).
    // Return a 10-min presigned URL so the browser can stream the round's
    // recording mp4 directly from S3.
    const id = c.req.param("id");
    const conversationId = c.req.param("conversationId");

    const existing = await loadRecordById(id);
    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    const [conversation] = await db
      .select({
        interviewRecordId: interviewConversation.interviewRecordId,
        recordingFileKey: interviewConversation.recordingFileKey,
        recordingStatus: interviewConversation.recordingStatus,
      })
      .from(interviewConversation)
      .where(eq(interviewConversation.conversationId, conversationId))
      .limit(1);

    // 防止跨面试访问: conversationId 必须挂在当前 interview 上.
    // Prevent cross-record access: the conversation must belong to this interview.
    if (!conversation || conversation.interviewRecordId !== id) {
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
      const url = await presignGetObjectUrl(conversation.recordingFileKey, 600);
      return c.json({ expiresInSeconds: 600, url });
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
  .get("/:id/form-submissions", async (c) => {
    const id = c.req.param("id");
    const existing = await loadRecordById(id);

    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    const submissions = await loadSubmissionsByInterview(id);
    return c.json({ submissions });
  })
  .delete("/:id/form-submissions/:submissionId", async (c) => {
    const id = c.req.param("id");
    const submissionId = c.req.param("submissionId");

    const existing = await loadRecordById(id);
    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    const result = await db
      .delete(candidateFormSubmission)
      .where(
        and(
          eq(candidateFormSubmission.id, submissionId),
          eq(candidateFormSubmission.interviewRecordId, id),
        ),
      )
      .returning({ id: candidateFormSubmission.id });

    if (result.length === 0) {
      return c.json({ error: "答卷不存在或已被重置。" }, 404);
    }

    return c.json({ success: true });
  })
  // oxlint-disable-next-line complexity -- Patch handler validates, normalizes, and coordinates schedule updates in one flow.
  .patch("/:id", async (c) => {
    const id = c.req.param("id");

    try {
      const existing = await loadRecordById(id);

      if (!existing) {
        return c.json({ error: "记录不存在。" }, 404);
      }

      const formData = await c.req.formData();
      const resume = normalizeResumeFile(formData.get("resume"));
      const parsedScheduleEntries = parseScheduleEntriesInput(formData.get("scheduleEntries"));
      const parsedResumePayload = parseResumePayloadInput(formData.get("resumePayload"));
      const editedQuestionsRaw = toNullableString(formData.get("editedQuestions"));
      const editedQuestions = editedQuestionsRaw
        ? (JSON.parse(editedQuestionsRaw) as typeof existing.interviewQuestions)
        : null;

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

      if (resume && !c.var.user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const analysis = parsedResumePayload;
      const now = new Date();
      // 编辑分支不在此处重新分析简历——storeInterviewResume 会查 chat_attachment
      // 注册表，命中复用 storageKey、未命中按 hash 命名 PUT 新对象。analysis 由
      // parsedResumePayload 提供或保持原 record 上的快照。
      // Edit path: do not re-analyze on resume swap. storeInterviewResume looks
      // up the chat_attachment registry, reusing the storageKey on a hash hit
      // and PUTting a hash-keyed object on a miss. analysis comes from
      // parsedResumePayload or remains the existing snapshot.
      const uploadResult =
        resume && c.var.user ? await storeInterviewResume(id, resume, c.var.user.id) : null;
      const resumeStorageKey = uploadResult?.storageKey ?? existing.resumeStorageKey;
      const resumeContentHash = resume
        ? (uploadResult?.contentHash ?? existing.resumeContentHash)
        : existing.resumeContentHash;

      const existingScheduleRows = await db
        .select()
        .from(studioInterviewSchedule)
        .where(eq(studioInterviewSchedule.interviewRecordId, id));
      const scheduleRows = buildScheduleRows(
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

      const nextRecord = {
        candidateEmail: input.data.candidateEmail || null,
        candidateName:
          input.data.candidateName || analysis?.resumeProfile.name || existing.candidateName,
        candidatePhone:
          input.data.candidatePhone || analysis?.resumeProfile.phone || existing.candidatePhone,
        interviewQuestions:
          analysis?.interviewQuestions ?? editedQuestions ?? existing.interviewQuestions,
        jobDescriptionId: input.data.jobDescriptionId || null,
        notes: input.data.notes || null,
        resumeContentHash,
        resumeFileName: analysis?.fileName ?? resume?.name ?? existing.resumeFileName,
        resumeProfile: analysis?.resumeProfile ?? existing.resumeProfile,
        resumeStorageKey,
        status: resolvedStatus,
        targetRole: input.data.targetRole || analysis?.resumeProfile.targetRoles[0] || null,
        updatedAt: now,
      } satisfies Partial<typeof studioInterview.$inferInsert>;

      const newJobDescriptionId = input.data.jobDescriptionId || null;
      const jdChanged = newJobDescriptionId !== existing.jobDescriptionId;

      await db.transaction(async (tx) => {
        await tx.update(studioInterview).set(nextRecord).where(eq(studioInterview.id, id));
        await tx
          .delete(studioInterviewSchedule)
          .where(eq(studioInterviewSchedule.interviewRecordId, id));
        await tx.insert(studioInterviewSchedule).values(scheduleRows);

        // Re-evaluate JD-scoped bindings only when the job description
        // actually changes. Global bindings (and their disabledByUser state)
        // are preserved across this operation.
        if (jdChanged) {
          await dropJobDescriptionBindings(tx, id);
          await autoBindApplicableTemplates(tx, id, newJobDescriptionId);
        }
      });

      safeUpdateTag("studio-interviews");
      const updatedRecord = await loadRecordById(id);
      return c.json(updatedRecord);
    } catch (error) {
      const result = toBadRequest(error);
      return c.json({ error: result.error }, { status: result.status as ContentfulStatusCode });
    }
  })
  .get("/:id/question-template-bindings", async (c) => {
    const id = c.req.param("id");
    const existing = await loadRecordById(id);
    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    // Lazy-bind so applicable templates created *after* this interview show
    // up in the section UI without requiring manual re-attach.
    await ensureApplicableBindings(id);
    const data = await loadInterviewQuestionTemplateBindings(id);
    return c.json(data);
  })
  .put("/:id/question-template-bindings", async (c) => {
    const id = c.req.param("id");
    const existing = await loadRecordById(id);
    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    const body = (await c.req.json().catch(() => null)) as {
      enabledTemplateIds?: unknown;
    } | null;
    if (!body || !Array.isArray(body.enabledTemplateIds)) {
      return c.json({ error: "请求参数缺失。" }, 400);
    }
    const enabledTemplateIds = body.enabledTemplateIds.filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );

    await db.transaction(async (tx) => {
      await replaceInterviewBindings(tx, id, enabledTemplateIds, existing.jobDescriptionId);
    });

    const data = await loadInterviewQuestionTemplateBindings(id);
    return c.json(data);
  })
  .post("/:id/rounds/:roundId/reset", async (c) => {
    const id = c.req.param("id");
    const roundId = c.req.param("roundId");
    const operatorId = c.var.user?.id ?? null;

    const existing = await loadRecordById(id);

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
        scheduleEntryId: roundId,
      });
    });

    safeUpdateTag("studio-interviews");
    safeUpdateTag("interview-conversations");
    const updatedRecord = await loadRecordById(id);
    return c.json(updatedRecord);
  })
  .patch("/:id/rounds/:roundId", async (c) => {
    // 单轮次内联编辑：当前仅支持切换"是否允许文本输入"。
    // Per-round inline edit: currently only toggles allowTextInput.
    const id = c.req.param("id");
    const roundId = c.req.param("roundId");

    const body = (await c.req.json().catch(() => null)) as { allowTextInput?: unknown } | null;

    if (!body || typeof body.allowTextInput !== "boolean") {
      return c.json({ error: "请求体格式不正确。" }, 400);
    }

    const existing = await loadRecordById(id);

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
        allowTextInput: body.allowTextInput,
        updatedAt: new Date(),
      })
      .where(eq(studioInterviewSchedule.id, roundId));

    safeUpdateTag("studio-interviews");
    const updatedRecord = await loadRecordById(id);
    return c.json(updatedRecord);
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await loadRecordById(id);

    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    await db.delete(studioInterview).where(eq(studioInterview.id, id));
    safeUpdateTag("studio-interviews");
    return c.json({ success: true });
  })
  .post("/bulk-delete", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { ids?: unknown } | null;
    const rawIds = Array.isArray(body?.ids) ? body.ids : null;

    if (!rawIds || rawIds.length === 0) {
      return c.json({ error: "缺少待删除的记录 ID。" }, 400);
    }

    const ids = rawIds.filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );

    if (ids.length === 0) {
      return c.json({ error: "缺少待删除的记录 ID。" }, 400);
    }

    const result = await db
      .delete(studioInterview)
      .where(inArray(studioInterview.id, ids))
      .returning({ id: studioInterview.id });

    safeUpdateTag("studio-interviews");
    return c.json({ deletedCount: result.length, success: true });
  });
