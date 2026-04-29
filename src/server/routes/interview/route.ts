import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ResumeProfile } from "@/lib/interview/types";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";
import { and, eq, inArray, ne } from "drizzle-orm";
import { AccessToken } from "livekit-server-sdk";
import { db } from "@/lib/db";
import {
  candidateFormSubmission,
  interviewAuditLog,
  interviewer,
  jobDescription,
  jobDescriptionInterviewer,
  studioInterview,
  studioInterviewSchedule,
} from "@/lib/db/schema";
import { buildCandidateFormAnswersSchema } from "@/lib/candidate-forms";
import type { CandidateFormTemplateRecord } from "@/lib/candidate-forms";
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
  streamGenerateInterviewQuestions,
  streamParseResumeProfile,
} from "@/server/agents/resume-analysis-agent";
import { matchJobDescriptionForResume } from "@/server/agents/job-description-match-agent";
import { factory } from "@/server/factory";
import { resumeProfileSchema } from "@/lib/interview/types";
import { listAllJobDescriptions } from "@/server/queries/job-descriptions";
import { getGlobalConfig } from "@/server/queries/global-config";
import {
  loadApplicableCandidateFormTemplates,
  loadCandidateFormTemplateVersionById,
  loadSubmissionsByInterview,
  loadSubmittedTemplateIds,
  resolveOrCreateTemplateVersion,
} from "@/server/queries/candidate-forms";
import {
  autoBindApplicableTemplates,
  dropJobDescriptionBindings,
  ensureApplicableBindings,
  loadInterviewPresetQuestions,
  loadInterviewQuestionTemplateBindings,
  refreshInterviewBindingsToLatest,
  replaceInterviewBindings,
} from "@/server/queries/interview-question-templates";
import { queryInterviewConversationReports } from "@/server/queries/interview-conversations";
import {
  queryPaginatedStudioInterviewRecords,
  queryStudioInterviewSummary,
} from "@/server/queries/studio-interviews";
import {
  buildScheduleRows,
  buildTokenErrorResponse,
  loadCandidateInterviewRecord,
  loadRecordById,
  loadScheduleEntriesForRedirect,
  normalizeResumeFile,
  safeUpdateTag,
  serializeRecord,
  storeInterviewResume,
  toBadRequest,
} from "./utils";
import { getObjectStream } from "@/lib/s3";

export const interviewRouter = factory
  .createApp()
  .post("/parse-resume", async (c) => {
    const formData = await c.req.formData();
    const resume = formData.get("resume");

    if (!(resume instanceof File)) {
      return c.json({ error: "缺少简历 PDF 文件。" }, 400);
    }

    try {
      const stream = streamParseResumeProfile(resume);
      return new Response(stream, {
        headers: {
          "Cache-Control": "no-cache",
          "Content-Type": "application/x-ndjson",
          "Transfer-Encoding": "chunked",
        },
      });
    } catch (error) {
      if (error instanceof Error) {
        const status = error.message.includes("PDF") || error.message.includes("10 MB") ? 400 : 500;
        return c.json(
          { error: error.message, stage: "resume-parsing" },
          status as ContentfulStatusCode,
        );
      }

      return c.json({ error: "Failed to parse resume.", stage: "resume-parsing" }, 500);
    }
  })
  .post("/match-job-description", async (c) => {
    const body = await c.req
      .json<{ resumeProfile?: unknown }>()
      .catch(() => ({}) as { resumeProfile?: unknown });

    const profileInput = resumeProfileSchema.safeParse(body.resumeProfile);
    if (!profileInput.success) {
      return c.json({ error: "缺少候选人信息 (resumeProfile)。" }, 400);
    }

    try {
      const jobDescriptions = await listAllJobDescriptions();
      if (jobDescriptions.length === 0) {
        return c.json({ matchedId: null, reason: null });
      }

      const match = await matchJobDescriptionForResume(profileInput.data, jobDescriptions);
      if (!match) {
        return c.json({ matchedId: null, reason: null });
      }

      return c.json({ matchedId: match.jobDescriptionId, reason: match.reason });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "在招岗位匹配失败。" }, 500);
    }
  })
  .post("/generate-questions", async (c) => {
    const body = await c.req
      .json<{ resumeProfile?: unknown }>()
      .catch(() => ({}) as { resumeProfile?: unknown });

    if (!body.resumeProfile || typeof body.resumeProfile !== "object") {
      return c.json({ error: "缺少候选人信息 (resumeProfile)。" }, 400);
    }

    const stream = streamGenerateInterviewQuestions(body.resumeProfile as ResumeProfile);

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
      },
    });
  })
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

    const applicable = await loadApplicableCandidateFormTemplates(id);
    const requiredTemplateIds = [...applicable.global, ...applicable.jobSpecific].map((t) => t.id);
    if (requiredTemplateIds.length > 0) {
      const submittedIds = await loadSubmittedTemplateIds(id, requiredTemplateIds);
      if (submittedIds.size < requiredTemplateIds.length) {
        return c.json({ code: "forms_required", error: "请先完成面试表单。" }, 409);
      }
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const serverUrl = process.env.LIVEKIT_URL;
    const agentName = process.env.AGENT_NAME;

    if (!apiKey || !apiSecret || !serverUrl) {
      return c.json(buildTokenErrorResponse(), 500);
    }

    const roomName = `interview_${id}_${roundId}_${Math.floor(Math.random() * 10_000)}`;
    const participantName = interviewRecord.candidateName || "candidate";
    const participantIdentity = `candidate_${id}_${roundId}_${Math.floor(Math.random() * 10_000)}`;

    // Interview context is surfaced to the Python agent worker via participant metadata.
    // Python: `ctx.wait_for_participant()` → `participant.metadata` → JSON.parse.
    // When the JD has multiple interviewers, the agent picks one at random.
    // 全局配置（公司背景、开场/结束指令）在颁发 token 前读取并注入。
    // Global config (company context, opening/closing instructions) is read before token issuance and injected here.
    const globalCfg = await getGlobalConfig();
    const participantMetadata = JSON.stringify({
      candidate_name: interviewRecord.candidateName,
      candidate_profile: interviewRecord.resumeProfile,
      global_closing_instructions: globalCfg.closingInstructions,
      global_company_context: globalCfg.companyContext,
      global_opening_instructions: globalCfg.openingInstructions,
      interview_questions: interviewRecord.interviewQuestions,
      interview_record_id: id,
      interviewers: interviewRecord.interviewers,
      job_description_preset_questions: interviewRecord.jobDescriptionPresetQuestions ?? [],
      job_description_prompt: interviewRecord.jobDescriptionPrompt ?? null,
      round_id: roundId,
      target_role: interviewRecord.targetRole,
    });

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

      if (agentName) {
        at.roomConfig = new RoomConfiguration({
          agents: [new RoomAgentDispatch({ agentName })],
        });
      }

      const participantToken = await at.toJwt();

      return c.json({
        participantName,
        participantToken,
        roomName,
        serverUrl,
      });
    } catch (error) {
      return c.json(
        {
          detail: error instanceof Error ? error.message : "Unknown error",
          error: "Failed to sign LiveKit token.",
        },
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

    return c.json({ interviewId: id, roundId: entry.id });
  })
  .get("/:id/:roundId", async (c) => {
    const id = c.req.param("id");
    const roundId = c.req.param("roundId");
    const interviewRecord = await loadCandidateInterviewRecord(id, roundId);

    if (!interviewRecord) {
      return c.json({ error: "Interview not available." }, 404);
    }

    return c.json(interviewRecord);
  })
  .get("/:id/:roundId/forms", async (c) => {
    const id = c.req.param("id");
    const roundId = c.req.param("roundId");
    const interviewRecord = await loadCandidateInterviewRecord(id, roundId);

    if (!interviewRecord) {
      return c.json({ error: "Interview not available." }, 404);
    }

    const applicable = await loadApplicableCandidateFormTemplates(id);
    const templates: CandidateFormTemplateRecord[] = [
      ...applicable.global,
      ...applicable.jobSpecific,
    ];

    if (templates.length === 0) {
      return c.json({ required: [], submitted: {} });
    }

    const templateIds = templates.map((t) => t.id);
    const submittedIds = await loadSubmittedTemplateIds(id, templateIds);

    // Resolve (or lazily create) the current version for each applicable
    // template. Performed inside one transaction so concurrent candidates
    // converge on the same version rows.
    const required = await db.transaction(async (tx) => {
      const out: {
        templateId: string;
        versionId: string;
        version: number;
        snapshot: unknown;
      }[] = [];
      for (const template of templates) {
        const resolved = await resolveOrCreateTemplateVersion(tx, template.id);
        out.push({
          snapshot: resolved.snapshot,
          templateId: template.id,
          version: resolved.version,
          versionId: resolved.id,
        });
      }
      return out;
    });

    const submitted: Record<string, true> = {};
    for (const templateId of submittedIds) {
      submitted[templateId] = true;
    }

    return c.json({ required, submitted });
  })
  .post("/:id/:roundId/forms/:templateId/submit", async (c) => {
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

    const body = (await c.req.json().catch(() => null)) as {
      versionId?: unknown;
      answers?: unknown;
    } | null;
    if (
      !body ||
      typeof body.versionId !== "string" ||
      body.answers === null ||
      typeof body.answers !== "object"
    ) {
      return c.json({ error: "请求参数缺失。" }, 400);
    }
    const { versionId } = body;
    const rawAnswers = body.answers as Record<string, unknown>;

    const applicable = await loadApplicableCandidateFormTemplates(id);
    const applicableIds = new Set(
      [...applicable.global, ...applicable.jobSpecific].map((t) => t.id),
    );
    if (!applicableIds.has(templateId)) {
      return c.json({ error: "该面试表单不适用于当前面试。" }, 400);
    }

    const version = await loadCandidateFormTemplateVersionById(templateId, versionId);
    if (!version) {
      return c.json({ error: "面试表单版本不存在。" }, 400);
    }

    const answersSchema = buildCandidateFormAnswersSchema(version.snapshot);
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
        submittedAt: now,
        templateId,
        versionId,
      });
    } catch {
      // Unique (templateId, interviewRecordId) — treat as already submitted.
      return c.json({ error: "该面试表单已提交过。" }, 409);
    }

    return c.json({
      submissionId,
      success: true,
      version: version.version,
      versionId,
    });
  })
  .post("/:id/:roundId/complete", async (c) => {
    // "User left the session" signal from the browser. We mark the schedule
    // entry as completed *immediately* so a quick page refresh can't grant
    // the candidate a second attempt at this round. The agent's
    // /api/agent/report callback still arrives later with the transcript and
    // is idempotent — it writes the same `completed` status plus the
    // conversation/summary rows. If the agent callback never arrives, the
    // round stays "completed without transcript" and an admin can use the
    // round reset flow to allow a retake.
    const roundId = c.req.param("roundId");
    const now = new Date();

    const [entry] = await db
      .select({
        id: studioInterviewSchedule.id,
        interviewRecordId: studioInterviewSchedule.interviewRecordId,
        status: studioInterviewSchedule.status,
      })
      .from(studioInterviewSchedule)
      .where(eq(studioInterviewSchedule.id, roundId))
      .limit(1);

    if (!entry) {
      return c.json({ error: "Round not found." }, 404);
    }

    if (entry.status === "completed") {
      return c.json({ success: true });
    }

    await db.transaction(async (tx) => {
      await tx
        .update(studioInterviewSchedule)
        .set({ status: "completed" as const, updatedAt: now })
        .where(eq(studioInterviewSchedule.id, roundId));

      const pendingRounds = await tx
        .select({ id: studioInterviewSchedule.id })
        .from(studioInterviewSchedule)
        .where(
          and(
            eq(studioInterviewSchedule.interviewRecordId, entry.interviewRecordId),
            ne(studioInterviewSchedule.status, "completed"),
          ),
        );

      if (pendingRounds.length === 0) {
        await tx
          .update(studioInterview)
          .set({ status: "completed" as const, updatedAt: now })
          .where(eq(studioInterview.id, entry.interviewRecordId));
      }
    });

    safeUpdateTag("studio-interviews");
    return c.json({ success: true });
  });

export const studioInterviewsRouter = factory
  .createApp()
  .get("/summary", async (c) => {
    const summary = await queryStudioInterviewSummary();
    return c.json(summary);
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
        jobDescriptionId: toNullableString(formData.get("jobDescriptionId")),
        notes: toNullableString(formData.get("notes")) ?? "",
        scheduleEntries: parsedScheduleEntries,
        status: toNullableString(formData.get("status")) ?? "ready",
        targetRole: toNullableString(formData.get("targetRole")) ?? "",
      });

      if (!input.success) {
        return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
      }

      const analysis = parsedResumePayload ?? (resume ? await analyzeResumeFile(resume) : null);
      const now = new Date();
      const interviewRecordId = crypto.randomUUID();
      const resumeStorageKey = resume
        ? await storeInterviewResume(interviewRecordId, resume)
        : null;
      const record = {
        candidateEmail: input.data.candidateEmail || null,
        candidateName: input.data.candidateName || analysis?.resumeProfile.name || "未命名候选人",
        createdAt: now,
        createdBy: c.var.user?.id ?? null,
        id: interviewRecordId,
        interviewQuestions: analysis?.interviewQuestions ?? manualInterviewQuestions ?? [],
        jobDescriptionId: input.data.jobDescriptionId || null,
        notes: input.data.notes || null,
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
        jobDescriptionId: toNullableString(formData.get("jobDescriptionId")),
        notes: toNullableString(formData.get("notes")) ?? "",
        scheduleEntries: parsedScheduleEntries,
        status: toNullableString(formData.get("status")) ?? existing.status,
        targetRole: toNullableString(formData.get("targetRole")) ?? "",
      });

      if (!input.success) {
        return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
      }

      const analysis = parsedResumePayload;
      const now = new Date();
      // When the user re-uploads a resume during edit, overwrite the S3 object
      // (same key derived from interview id) so preview always reflects the
      // latest file. Keep the existing key when no new file is sent.
      const resumeStorageKey = resume
        ? ((await storeInterviewResume(id, resume)) ?? existing.resumeStorageKey)
        : existing.resumeStorageKey;

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
        interviewQuestions:
          analysis?.interviewQuestions ?? editedQuestions ?? existing.interviewQuestions,
        jobDescriptionId: input.data.jobDescriptionId || null,
        notes: input.data.notes || null,
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
