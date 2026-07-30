import type { ContentfulStatusCode } from "hono/utils/http-status";
import { zValidator } from "@hono/zod-validator";
import { resumeLibraryReadRouter } from "./read-route";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { interviewAuditLog, studioInterview } from "@arc/db-schema/schema";
import { resumeReviewSchema } from "@arc/shared/resume-review";
import type { ResumeReview } from "@arc/shared/resume-review";
import { resolveRecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import {
  canDeleteResumeRecord,
  canEditResumeRecord,
  resumeEvaluationUpdateSchema,
  resumeIdentityUpdateSchema,
  resumeLibraryEditFormSchema,
  resumeLibraryFormSchema,
} from "@arc/shared/studio-resumes";
import { invalidateStudioInterviewCaches } from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import { removeImportedInterviewFromConversations } from "@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import {
  parseResumeFastToProfile,
  validateResumeFile,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import { loadResumeDetail } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resumes";
import {
  resetResumeEvaluationForJobChange,
  updateResumeEvaluationStatus,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/evaluation";
import { parseResumePayloadInput } from "@arc/db-schema/studio-interviews";
import {
  normalizeResumeFile,
  resolveResumeUploadStorage,
  toBadRequest,
} from "@arc/ai-recruitment-copilot-backend/server/routes/interview/utils";
import { findSemanticResumeDuplicates } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/dedup-service";
import {
  deleteDuplicateMatchesForSource,
  replaceDuplicateMatchesForSource,
} from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/duplicate-matches";
import { enqueueResumeSemanticIndexJobBestEffort } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/enqueue";
import { deleteResumeSemanticIndexBestEffort } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/lifecycle";
import {
  jobDescriptionIdsExist,
  loadJobDescriptionById,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { createResumeRecordFromStorage } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/create-from-storage";
import { syncResumeProfileIdentity } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/profile-sync";
import {
  generateResumeReviewBestEffort,
  generateResumeScreeningBestEffort,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/review-generation";
import { enqueueResumeReassessmentForRecord } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/review-queue";
import { reassessResumeRecord } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/review-worker";
import { retryFailedResumeParse } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/utils/retry";
/* oxlint-disable complexity -- multipart create/update handlers preserve transactional business rules. */

// 「发起 AI 面试」请求体：候选人侧已存在招聘台行，只把（可能被用户编辑过的）
// 面试题落库，并新建一条默认排期。零长度数组允许，方便日后扩展。
// "Launch interview" payload — the candidate row already exists, so we just
// persist the (possibly edited) questions and add a default schedule entry.
// Zero-length is allowed.

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

function toNullableString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

const INVALIDATED_RESUME_ASSESSMENT = {
  notes: null,
  resumeReview: null,
  resumeReviewError: null,
  resumeReviewGeneratedAt: null,
  resumeReviewQueuedAt: null,
  resumeReviewRunId: null,
  resumeReviewStatus: "idle" as const,
  resumeScreeningError: null,
  resumeScreeningEvaluatedAt: null,
  resumeScreeningResult: null,
  resumeScreeningStatus: "idle" as const,
};

async function reassessAfterJobDescriptionChange(input: {
  organizationId: string;
  resumeRecordId: string;
}) {
  try {
    const enqueueResult = await enqueueResumeReassessmentForRecord(input);
    if (enqueueResult !== "fallback_sync") {
      return;
    }
    void (async () => {
      try {
        await reassessResumeRecord(input);
      } catch (error) {
        console.error("[resume-reassess] job-change fallback async failed", {
          error,
          resumeRecordId: input.resumeRecordId,
        });
      }
    })();
  } catch (error) {
    console.error("[resume-reassess] job-change enqueue failed", {
      error,
      resumeRecordId: input.resumeRecordId,
    });
  }
}

function parseResumeLibraryFormData(
  formData: FormData,
  schema: typeof resumeLibraryFormSchema | typeof resumeLibraryEditFormSchema,
) {
  return schema.safeParse({
    candidateEmail: toNullableString(formData.get("candidateEmail")) ?? "",
    candidateName: toNullableString(formData.get("candidateName")) ?? "",
    candidatePhone: toNullableString(formData.get("candidatePhone")) ?? "",
    hrResumeAssessment: toNullableString(formData.get("hrResumeAssessment")) ?? "",
    jobDescriptionId: toNullableString(formData.get("jobDescriptionId")) ?? "",
    notes: toNullableString(formData.get("notes")) ?? "",
    resumeEvaluationStatus:
      toNullableString(formData.get("resumeEvaluationStatus")) ?? "unreviewed",
    targetRole: toNullableString(formData.get("targetRole")) ?? "",
  });
}

export function parseResumeLibraryCreateFormInput(formData: FormData) {
  return parseResumeLibraryFormData(formData, resumeLibraryFormSchema);
}

export function parseResumeLibraryEditFormInput(formData: FormData) {
  return parseResumeLibraryFormData(formData, resumeLibraryEditFormSchema);
}

export function parseResumeReviewFormInput(
  value: FormDataEntryValue | null,
): { data: ResumeReview | null; success: true } | { error: string; success: false } {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { data: null, success: true };
  }
  try {
    const parsed = JSON.parse(value);
    // 写入路径用严格 v3 schema 校验；旧数据如果 HR 原封不动传回，
    // safeParse 会失败并提示"结构无效"，需 HR 重新生成评价。
    const result = resumeReviewSchema.safeParse(parsed);
    if (result.success) {
      return { data: result.data, success: true };
    }
  } catch {
    // Fall through to a stable validation message below.
  }
  return { error: "简历评价结构无效，请重新生成评价。", success: false };
}

export const resumeLibraryRouter = factory
  .createApp()
  .route("/", resumeLibraryReadRouter)
  .post(
    "/:id/retry-parse",
    requirePermission("resumeLibrary", "update"),
    requirePermission("resumeUploadBatch", "process"),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const visibilityScope = await loadVisibilityScope(activeOrg.id, c.var.member?.role, user.id);
      const resumeRecordId = c.req.param("id");
      const record = await loadResumeDetail(resumeRecordId, activeOrg.id, visibilityScope);
      if (!record) {
        return c.json({ error: "记录不存在。" }, 404);
      }
      if (record.resumeParseStatus !== "failed") {
        return c.json({ error: "只有解析失败的简历可以重新解析。" }, 409);
      }
      if (!record.resumeParseRetryable) {
        return c.json({ error: "该简历已重新解析过，不能再次操作。" }, 409);
      }
      try {
        const result = await retryFailedResumeParse({
          organizationId: activeOrg.id,
          requestedBy: user.id,
          resumeRecordId,
        });
        if (result.status === "queued") {
          invalidateStudioInterviewCaches(activeOrg.id);
          return c.json({ status: "queued" as const }, 200);
        }
        if (result.status === "queue_unavailable") {
          return c.json({ error: "简历解析队列未配置 REDIS_URL。" }, 503);
        }
        return c.json({ error: "该简历当前不能重新解析，请刷新后重试。" }, 409);
      } catch (error) {
        return c.json(
          { error: error instanceof Error ? error.message : "简历解析队列入队失败。" },
          503,
        );
      }
    },
  )
  .post("/", requirePermission("resumeLibrary", "create"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    try {
      const formData = await c.req.formData();
      const resume = normalizeResumeFile(formData.get("resume"));
      // 显式前置校验：原先依赖 parseResumeFastToProfile 顺手做的 PDF / 20MB 检查，
      // 但客户端送了 resumePayload 或注册表命中时会跳过解析，那条校验就被绕过了。
      // Explicit upfront validation — parseResumeFastToProfile used to be the
      // gatekeeper, but client-supplied resumePayload or registry hits bypass
      // it, letting non-PDF / oversized files slip through.
      if (resume) {
        validateResumeFile(resume);
      }
      const parsedResumePayload = parseResumePayloadInput(formData.get("resumePayload"));

      const input = parseResumeLibraryCreateFormInput(formData);
      if (!input.success) {
        return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
      }
      const resumeReviewInput = parseResumeReviewFormInput(formData.get("resumeReview"));
      if (!resumeReviewInput.success) {
        return c.json({ error: resumeReviewInput.error }, 400);
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

      const uploadResult = await resolveResumeUploadStorage({
        organizationId: activeOrg.id,
        parsedResumePayload,
        resume,
        userId: c.var.user?.id,
      });
      const resumeStorageKey = uploadResult?.storageKey ?? null;
      const resumeContentHash = uploadResult?.contentHash ?? null;

      // 解析复用顺序：客户端预制 payload > 注册表缓存 > 现场兜底解析。
      // 服务端从不补跑题目生成——客户端没传 questions 就落库空数组。
      // Reuse order: client-prebaked payload → registry cache → server fallback.
      // Questions are NEVER generated server-side; if the client did not ship a
      // resumePayload, the row stores an empty interviewQuestions array.
      let resumeProfile =
        parsedResumePayload?.resumeProfile ?? uploadResult?.cachedResumeProfile ?? null;
      let resumeText = parsedResumePayload?.resumeText ?? uploadResult?.resumeText ?? null;
      let parsedFileName: string | null = parsedResumePayload?.fileName ?? resume?.name ?? null;
      if (resume && !resumeProfile) {
        const parsed = await parseResumeFastToProfile(resume);
        ({ resumeProfile } = parsed);
        resumeText = parsed.parsedText;
        parsedFileName = resume.name;
      }
      const dedupMatches = await findSemanticResumeDuplicates({
        email: input.data.candidateEmail || resumeProfile?.email || null,
        name: input.data.candidateName || resumeProfile?.name || null,
        organizationId: activeOrg.id,
        phone: input.data.candidatePhone || resumeProfile?.phone || null,
        resumeProfile,
      });

      let generatedReview: Awaited<ReturnType<typeof generateResumeReviewBestEffort>> = null;
      let resumeReview = resumeReviewInput.data;
      let resumeScreeningResult = null;
      if (!resumeReview && resumeProfile) {
        generatedReview = await generateResumeReviewBestEffort({
          jobDescriptionId: input.data.jobDescriptionId || null,
          logPrefix: "[studio-resumes]",
          organizationId: activeOrg.id,
          resumeProfile,
          resumeText,
        });
        resumeReview = generatedReview?.structuredReview ?? null;
        resumeScreeningResult = generatedReview?.screeningResult ?? null;
      } else if (resumeProfile) {
        resumeScreeningResult = await generateResumeScreeningBestEffort({
          jobDescriptionId: input.data.jobDescriptionId || null,
          logPrefix: "[studio-resumes]",
          organizationId: activeOrg.id,
          resumeProfile,
          resumeText,
        });
      }
      let resumeReviewStatus: "failed" | "idle" | "ready" = "idle";
      let resumeScreeningStatus: "failed" | "idle" | "ready" = "idle";
      if (resumeProfile) {
        resumeReviewStatus = resumeReview ? "ready" : "failed";
        resumeScreeningStatus = resumeScreeningResult ? "ready" : "failed";
      }

      const recordId = await createResumeRecordFromStorage({
        candidateEmail: input.data.candidateEmail || null,
        candidateName: input.data.candidateName || null,
        candidatePhone: input.data.candidatePhone || null,
        contentHash: resumeContentHash,
        hrResumeAssessment: input.data.hrResumeAssessment || null,
        interviewQuestions: parsedResumePayload?.interviewQuestions ?? [],
        jobDescriptionId: input.data.jobDescriptionId || null,
        notes: input.data.notes || null,
        organizationId: activeOrg.id,
        resumeFileName: parsedFileName,
        resumeProfile,
        resumeReview,
        resumeReviewError: resumeProfile && !resumeReview ? "AI 分析生成失败。" : null,
        resumeReviewStatus,
        resumeScreeningError: resumeProfile && !resumeScreeningResult ? "AI 分析生成失败。" : null,
        resumeScreeningResult,
        resumeScreeningStatus,
        resumeText,
        storageKey: resumeStorageKey,
        targetRole: input.data.targetRole || null,
        userId: c.var.user?.id ?? null,
      });

      await replaceDuplicateMatchesForSource({
        matches: dedupMatches,
        organizationId: activeOrg.id,
        sourceId: recordId,
        sourceType: "studio_interview",
      });
      invalidateStudioInterviewCaches(activeOrg.id);
      await enqueueResumeSemanticIndexJobBestEffort({
        organizationId: activeOrg.id,
        sourceId: recordId,
        sourceType: "studio_interview",
      });
      const visibilityScope = await loadVisibilityScope(
        activeOrg.id,
        c.var.member?.role,
        c.var.user?.id,
      );
      const detail = await loadResumeDetail(recordId, activeOrg.id, visibilityScope);
      return c.json(detail, 201);
    } catch (error) {
      const result = toBadRequest(error);
      return c.json({ error: result.error }, { status: result.status as ContentfulStatusCode });
    }
  })
  .patch(
    "/:id/evaluation",
    requirePermission("resumeLibrary", "update"),
    zValidator("json", resumeEvaluationUpdateSchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
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
      const existing = await loadResumeDetail(id, activeOrg.id, visibilityScope);
      if (!existing) {
        return c.json({ error: "记录不存在。" }, 404);
      }

      const input = c.req.valid("json");
      const result = await updateResumeEvaluationStatus({
        id,
        operatorId: c.var.user?.id ?? null,
        organizationId: activeOrg.id,
        status: input.status,
      });
      if (result.status === "not_found") {
        return c.json({ error: "记录不存在。" }, 404);
      }

      invalidateStudioInterviewCaches(activeOrg.id);
      const detail = await loadResumeDetail(id, activeOrg.id, visibilityScope);
      return c.json(detail, 200);
    },
  )
  .patch(
    "/:id/identity",
    requirePermission("resumeLibrary", "update"),
    zValidator("json", resumeIdentityUpdateSchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
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
      const existing = await loadResumeDetail(id, activeOrg.id, visibilityScope);
      if (!existing) {
        return c.json({ error: "记录不存在。" }, 404);
      }
      if (!canEditResumeRecord(existing.resumeParseStatus)) {
        return c.json({ error: "简历解析完成后才能编辑。" }, 409);
      }

      const input = c.req.valid("json");
      const ok = await jobDescriptionIdsExist([input.jobDescriptionId], activeOrg.id);
      if (!ok) {
        return c.json({ error: "所选在招岗位不存在。" }, 400);
      }

      const nextJobDescriptionId = input.jobDescriptionId;
      const jobDescriptionChanged = existing.jobDescriptionId !== nextJobDescriptionId;
      const nextJobDescription = jobDescriptionChanged
        ? await loadJobDescriptionById(activeOrg.id, nextJobDescriptionId)
        : null;

      // Mirror identity into resumeProfile JSON when a structured profile exists.
      // Table: candidateName/email/phone/targetRole/jobDescriptionId
      // JSON: name/email/phone/gender/age/workYears/targetRoles
      const resumeProfile = syncResumeProfileIdentity(existing.resumeProfile, {
        age: input.age,
        candidateEmail: input.candidateEmail,
        candidateName: input.candidateName,
        candidatePhone: input.candidatePhone,
        gender: input.gender,
        targetRole: input.targetRole || existing.targetRole || "",
        workYears: input.workYears,
      });
      const now = new Date();
      const update = {
        candidateEmail: input.candidateEmail || null,
        candidateName: input.candidateName,
        candidatePhone: input.candidatePhone || null,
        jobDescriptionId: nextJobDescriptionId,
        targetRole:
          input.targetRole || resumeProfile?.targetRoles[0] || existing.targetRole || null,
        updatedAt: now,
        ...(resumeProfile ? { resumeProfile } : {}),
        ...(jobDescriptionChanged ? INVALIDATED_RESUME_ASSESSMENT : {}),
      } satisfies Partial<typeof studioInterview.$inferInsert>;

      await db.transaction(async (tx) => {
        await tx
          .update(studioInterview)
          .set(update)
          .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, activeOrg.id)));
        if (jobDescriptionChanged) {
          await tx.insert(interviewAuditLog).values({
            action: "job_description_changed",
            createdAt: now,
            detail: {
              fromJobDescriptionId: existing.jobDescriptionId,
              fromJobDescriptionName: existing.jobDescriptionName,
              toJobDescriptionId: nextJobDescriptionId,
              toJobDescriptionName: nextJobDescription?.name ?? null,
            },
            id: crypto.randomUUID(),
            interviewRecordId: id,
            operatorId: c.var.user?.id ?? null,
            organizationId: activeOrg.id,
          });
        }
      });

      if (jobDescriptionChanged && existing.resumeEvaluationStatus) {
        await resetResumeEvaluationForJobChange({
          id,
          nextJobDescriptionId,
          operatorId: c.var.user?.id ?? null,
          organizationId: activeOrg.id,
          previousJobDescriptionId: existing.jobDescriptionId,
          previousStatus: existing.resumeEvaluationStatus,
        });
      } else {
        const nextEvaluationStatus =
          input.resumeEvaluationStatus === "unreviewed" ? null : input.resumeEvaluationStatus;
        if (nextEvaluationStatus !== existing.resumeEvaluationStatus) {
          await updateResumeEvaluationStatus({
            id,
            operatorId: c.var.user?.id ?? null,
            organizationId: activeOrg.id,
            status: nextEvaluationStatus,
          });
        }
      }

      if (
        jobDescriptionChanged &&
        resumeProfile &&
        existing.resumeParseStatus === "ready" &&
        existing.pipelineStage !== "closed" &&
        existing.outcome === "in_pipeline"
      ) {
        await reassessAfterJobDescriptionChange({
          organizationId: activeOrg.id,
          resumeRecordId: id,
        });
      }

      invalidateStudioInterviewCaches(activeOrg.id);
      if (resumeProfile) {
        await enqueueResumeSemanticIndexJobBestEffort({
          organizationId: activeOrg.id,
          sourceId: id,
          sourceType: "studio_interview",
        });
      }
      const detail = await loadResumeDetail(id, activeOrg.id, visibilityScope);
      return c.json(detail, 200);
    },
  )
  // oxlint-disable-next-line complexity -- single update handler orchestrates identity + JD + evaluation whitelist write.
  .patch("/:id", requirePermission("resumeLibrary", "update"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    try {
      const visibilityScope = await loadVisibilityScope(
        activeOrg.id,
        c.var.member?.role,
        c.var.user?.id,
      );
      const existing = await loadResumeDetail(id, activeOrg.id, visibilityScope);
      if (!existing) {
        return c.json({ error: "记录不存在。" }, 404);
      }
      if (!canEditResumeRecord(existing.resumeParseStatus)) {
        return c.json({ error: "简历解析完成后才能编辑。" }, 409);
      }

      const formData = await c.req.formData();
      const input = parseResumeLibraryEditFormInput(formData);
      if (!input.success) {
        return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
      }

      // 编辑接口不再接受简历文件替换 / 系统评价（notes、resumeReview）更新。
      // Edit no longer accepts resume file replacement or system notes / review updates.
      if (input.data.jobDescriptionId) {
        const ok = await jobDescriptionIdsExist([input.data.jobDescriptionId], activeOrg.id);
        if (!ok) {
          return c.json({ error: "所选在招岗位不存在。" }, 400);
        }
      }
      const nextJobDescriptionId = input.data.jobDescriptionId || null;
      const jobDescriptionChanged = existing.jobDescriptionId !== nextJobDescriptionId;
      const nextJobDescription =
        jobDescriptionChanged && nextJobDescriptionId
          ? await loadJobDescriptionById(activeOrg.id, nextJobDescriptionId)
          : null;

      const resumeProfile = syncResumeProfileIdentity(existing.resumeProfile, input.data);
      const resumeProfileUpdate: Partial<typeof studioInterview.$inferInsert> = resumeProfile
        ? { resumeProfile }
        : {};

      // 显式白名单写入 —— 绝不触碰 interviewQuestions / status / schedule /
      // notes / resume file / resumeReview。
      // Explicit whitelist — normal identity edits never touch interviewQuestions / status /
      // schedule / notes / resume file / resumeReview. A job change invalidates the old
      // job-bound AI assessment below.
      const now = new Date();
      const nextHrResumeAssessment = input.data.hrResumeAssessment || null;
      const hrAssessmentChanged = existing.hrResumeAssessment !== nextHrResumeAssessment;
      const update = {
        candidateEmail: input.data.candidateEmail || null,
        candidateName: input.data.candidateName || resumeProfile?.name || existing.candidateName,
        candidatePhone: input.data.candidatePhone || resumeProfile?.phone || null,
        hrResumeAssessment: nextHrResumeAssessment,
        ...(hrAssessmentChanged
          ? {
              hrResumeAssessmentUpdatedAt: now,
              hrResumeAssessmentUpdatedBy: c.var.user?.id ?? null,
            }
          : {}),
        jobDescriptionId: nextJobDescriptionId,
        targetRole: input.data.targetRole || resumeProfile?.targetRoles[0] || null,
        updatedAt: now,
        ...resumeProfileUpdate,
        ...(jobDescriptionChanged ? INVALIDATED_RESUME_ASSESSMENT : {}),
      } satisfies Partial<typeof studioInterview.$inferInsert>;

      await db.transaction(async (tx) => {
        await tx
          .update(studioInterview)
          .set(update)
          .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, activeOrg.id)));
        if (jobDescriptionChanged) {
          await tx.insert(interviewAuditLog).values({
            action: "job_description_changed",
            createdAt: now,
            detail: {
              fromJobDescriptionId: existing.jobDescriptionId,
              fromJobDescriptionName: existing.jobDescriptionName,
              toJobDescriptionId: nextJobDescriptionId,
              toJobDescriptionName: nextJobDescription?.name ?? null,
            },
            id: crypto.randomUUID(),
            interviewRecordId: id,
            operatorId: c.var.user?.id ?? null,
            organizationId: activeOrg.id,
          });
        }
      });
      const nextResumeEvaluationStatus =
        jobDescriptionChanged || input.data.resumeEvaluationStatus === "unreviewed"
          ? null
          : input.data.resumeEvaluationStatus;
      if (jobDescriptionChanged && existing.resumeEvaluationStatus) {
        await resetResumeEvaluationForJobChange({
          id,
          nextJobDescriptionId,
          operatorId: c.var.user?.id ?? null,
          organizationId: activeOrg.id,
          previousJobDescriptionId: existing.jobDescriptionId,
          previousStatus: existing.resumeEvaluationStatus,
        });
      } else if (nextResumeEvaluationStatus !== existing.resumeEvaluationStatus) {
        await updateResumeEvaluationStatus({
          id,
          operatorId: c.var.user?.id ?? null,
          organizationId: activeOrg.id,
          status: nextResumeEvaluationStatus,
        });
      }

      if (
        jobDescriptionChanged &&
        resumeProfile &&
        existing.resumeParseStatus === "ready" &&
        existing.pipelineStage !== "closed" &&
        existing.outcome === "in_pipeline"
      ) {
        await reassessAfterJobDescriptionChange({
          organizationId: activeOrg.id,
          resumeRecordId: id,
        });
      }

      invalidateStudioInterviewCaches(activeOrg.id);
      if (resumeProfile) {
        await enqueueResumeSemanticIndexJobBestEffort({
          organizationId: activeOrg.id,
          sourceId: id,
          sourceType: "studio_interview",
        });
      }
      const detail = await loadResumeDetail(id, activeOrg.id, visibilityScope);
      return c.json(detail, 200);
    } catch (error) {
      const result = toBadRequest(error);
      return c.json({ error: result.error }, { status: result.status as ContentfulStatusCode });
    }
  })
  .delete("/:id", requirePermission("resumeLibrary", "delete"), async (c) => {
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
    const record = await loadResumeDetail(id, activeOrg.id, visibilityScope);
    if (!record) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    if (!canDeleteResumeRecord(record.resumeParseStatus)) {
      return c.json({ error: "简历解析排队或处理中，暂不能删除。" }, 409);
    }
    const result = await db
      .delete(studioInterview)
      .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, activeOrg.id)))
      .returning({ id: studioInterview.id });
    if (result.length === 0) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    await deleteResumeSemanticIndexBestEffort({
      sourceId: id,
      sourceType: "studio_interview",
    });
    await deleteDuplicateMatchesForSource({
      organizationId: activeOrg.id,
      sourceId: id,
      sourceType: "studio_interview",
    });
    invalidateStudioInterviewCaches(activeOrg.id);
    // 清理 chat 端的「已入库」状态：把所有 conversation 的 resumeImports
    // map 里指向该 interview 的 entry 都移除，避免 chat UI 残留假状态。
    // Sweep the chat-side "imported" badge state so the UI doesn't render
    // a stale "已入库" indicator after the underlying row is gone.
    await removeImportedInterviewFromConversations(activeOrg.id, id);
    return c.json({ success: true }, 200);
  })
  .post(
    "/bulk-delete",
    requirePermission("resumeLibrary", "delete"),
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
      const ids = rawIds.filter((v): v is string => typeof v === "string" && v.length > 0);
      if (ids.length === 0) {
        return c.json({ error: "缺少待删除的记录 ID。" }, 400);
      }
      const visibilityScope = await loadVisibilityScope(
        activeOrg.id,
        c.var.member?.role,
        c.var.user?.id,
      );
      if (visibilityScope.kind === "none") {
        return c.json({ error: "记录不存在。" }, 404);
      }
      const visibilityCondition =
        visibilityScope.kind === "restricted"
          ? inArray(studioInterview.createdBy, visibilityScope.userIds)
          : undefined;
      const rows = await db
        .select({ id: studioInterview.id, resumeParseStatus: studioInterview.resumeParseStatus })
        .from(studioInterview)
        .where(
          and(
            inArray(studioInterview.id, ids),
            eq(studioInterview.organizationId, activeOrg.id),
            visibilityCondition,
          ),
        );
      if (rows.some((row) => !canDeleteResumeRecord(row.resumeParseStatus))) {
        return c.json({ error: "所选记录包含解析排队或处理中的简历，暂不能删除。" }, 409);
      }

      const result = await db
        .delete(studioInterview)
        .where(
          and(
            inArray(studioInterview.id, ids),
            eq(studioInterview.organizationId, activeOrg.id),
            visibilityCondition,
          ),
        )
        .returning({ id: studioInterview.id });

      invalidateStudioInterviewCaches(activeOrg.id);
      // 跟单删一样：清掉所有 chat conversation 里指向这批 interview 的「已入库」
      // 残留。批量删除时简单串行 N 条小 UPDATE 即可——N 通常很小（手动选中）
      // 且每条 UPDATE 都有 LIKE 预过滤，命不中的 conversation 不会被改。
      // Same idea as single-delete; iterate per id with the LIKE-pre-filter
      // doing most of the work. Sequential is fine for the bulk case (N is
      // small and each UPDATE is essentially free when the LIKE misses).
      for (const deletedId of result) {
        await deleteResumeSemanticIndexBestEffort({
          sourceId: deletedId.id,
          sourceType: "studio_interview",
        });
        await deleteDuplicateMatchesForSource({
          organizationId: activeOrg.id,
          sourceId: deletedId.id,
          sourceType: "studio_interview",
        });
        await removeImportedInterviewFromConversations(activeOrg.id, deletedId.id);
      }
      return c.json({ deletedCount: result.length, success: true }, 200);
    },
  );
