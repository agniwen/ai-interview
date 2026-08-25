/* oxlint-disable max-lines -- resume collection commands and mounted child-resource routers remain co-located at the route boundary. */
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { zValidator } from "@hono/zod-validator";
import { resumeLibraryReadRouter as defaultResumeLibraryReadRouter } from "./read-route";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { interviewAuditLog, resumeEvaluationVersion, studioInterview } from "@arc/db-schema/schema";
import { resumeReviewSchema } from "@arc/shared/resume-review";
import type { ResumeReview } from "@arc/shared/resume-review";
import { resolveRecruitingVisibilityScope as defaultResolveRecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import {
  canDeleteResumeRecord,
  canEditResumeRecord,
  resumeEvaluationUpdateSchema,
  resumeIdentityUpdateSchema,
  resumeLibraryEditFormSchema,
  resumeLibraryFormSchema,
} from "@arc/shared/studio-resumes";
import { invalidateStudioInterviewCaches as defaultInvalidateStudioInterviewCaches } from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import { removeImportedInterviewFromConversations as defaultRemoveImportedInterviewFromConversations } from "@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import {
  parseResumeFastToProfile as defaultParseResumeFastToProfile,
  validateResumeFile as defaultValidateResumeFile,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import { requirePermission as defaultRequirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import { loadResumeDetail as defaultLoadResumeDetail } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resumes";
import {
  resetResumeEvaluationForJobChange as defaultResetResumeEvaluationForJobChange,
  updateResumeEvaluationStatus as defaultUpdateResumeEvaluationStatus,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/evaluation";
import { parseResumePayloadInput } from "@arc/db-schema/studio-interviews";
import {
  normalizeResumeFile as defaultNormalizeResumeFile,
  resolveResumeUploadStorage as defaultResolveResumeUploadStorage,
  toBadRequest as defaultToBadRequest,
} from "@arc/ai-recruitment-copilot-backend/server/routes/interview/utils";
import { findSemanticResumeDuplicates as defaultFindSemanticResumeDuplicates } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/dedup-service";
import {
  deleteDuplicateMatchesForSource as defaultDeleteDuplicateMatchesForSource,
  replaceDuplicateMatchesForSource as defaultReplaceDuplicateMatchesForSource,
} from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/duplicate-matches";
import { enqueueResumeSemanticIndexJobBestEffort as defaultEnqueueResumeSemanticIndexJobBestEffort } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/enqueue";
import { deleteResumeSemanticIndexBestEffort as defaultDeleteResumeSemanticIndexBestEffort } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/lifecycle";
import {
  loadRecruitingJobDescriptionById as defaultLoadRecruitingJobDescriptionById,
  recruitingJobDescriptionIdsExist as defaultRecruitingJobDescriptionIdsExist,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { createResumeRecordFromStorage as defaultCreateResumeRecordFromStorage } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/create-from-storage";
import { syncResumeProfileIdentity as defaultSyncResumeProfileIdentity } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/profile-sync";
import { generateResumeScreeningBestEffort as defaultGenerateResumeScreeningBestEffort } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/review-generation";
import {
  enqueueResumeReassessmentForRecord as defaultEnqueueResumeReassessmentForRecord,
  scheduleResumeEvaluationForRecord as defaultScheduleResumeEvaluationForRecord,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/review-queue";
import { reassessResumeRecord as defaultReassessResumeRecord } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/review-worker";
import { computeResumeEvaluationInputHash } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-evaluation-input-hash";
import {
  INVALIDATED_AI_RESUME_ASSESSMENT,
  INVALIDATED_RESUME_ASSESSMENT_FOR_JOB_CHANGE,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/resume-assessment-invalidation";
import { buildPreQualitativeEvaluationArchive } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/resume-evaluation-history";
import { structuredResumeEvaluationRouter as defaultStructuredResumeEvaluationRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/routes/structured-evaluation/route";
import { recruitingRecordMeetingsRouter as defaultRecruitingRecordMeetingsRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/routes/meetings/route";
import { resumeEvaluationHistoryRouter as defaultResumeEvaluationHistoryRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/routes/evaluation-history/route";
import {
  forceResumeReparse as defaultForceResumeReparse,
  retryFailedResumeParse as defaultRetryFailedResumeParse,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/utils/retry";
/* oxlint-disable complexity -- multipart create/update handlers preserve transactional business rules. */

// 「发起 AI 面试」请求体：候选人侧已存在招聘台行，只把（可能被用户编辑过的）
// 面试题落库，并新建一条默认排期。零长度数组允许，方便日后扩展。
// "Launch interview" payload — the candidate row already exists, so we just
// persist the (possibly edited) questions and add a default schedule entry.
// Zero-length is allowed.

const formDataTextSchema = z.string();

function toNullableString(value: FormDataEntryValue | null): string | null {
  const parsed = formDataTextSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const trimmed = parsed.data.trim();
  return trimmed.length === 0 ? null : trimmed;
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
  const parsedValue = formDataTextSchema.safeParse(value);
  if (!parsedValue.success || parsedValue.data.trim().length === 0) {
    return { data: null, success: true };
  }
  try {
    const parsed = JSON.parse(parsedValue.data);
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

const defaultResumeLibraryRouterDependencies = {
  createResumeRecordFromStorage: defaultCreateResumeRecordFromStorage,
  db: defaultDb,
  deleteDuplicateMatchesForSource: defaultDeleteDuplicateMatchesForSource,
  deleteResumeSemanticIndexBestEffort: defaultDeleteResumeSemanticIndexBestEffort,
  enqueueResumeReassessmentForRecord: defaultEnqueueResumeReassessmentForRecord,
  enqueueResumeSemanticIndexJobBestEffort: defaultEnqueueResumeSemanticIndexJobBestEffort,
  findSemanticResumeDuplicates: defaultFindSemanticResumeDuplicates,
  forceResumeReparse: defaultForceResumeReparse,
  generateResumeScreeningBestEffort: defaultGenerateResumeScreeningBestEffort,
  invalidateStudioInterviewCaches: defaultInvalidateStudioInterviewCaches,
  loadRecruitingJobDescriptionById: defaultLoadRecruitingJobDescriptionById,
  loadResumeDetail: defaultLoadResumeDetail,
  normalizeResumeFile: defaultNormalizeResumeFile,
  parseResumeFastToProfile: defaultParseResumeFastToProfile,
  reassessResumeRecord: defaultReassessResumeRecord,
  recruitingJobDescriptionIdsExist: defaultRecruitingJobDescriptionIdsExist,
  recruitingRecordMeetingsRouter: defaultRecruitingRecordMeetingsRouter,
  removeImportedInterviewFromConversations: defaultRemoveImportedInterviewFromConversations,
  replaceDuplicateMatchesForSource: defaultReplaceDuplicateMatchesForSource,
  requirePermission: defaultRequirePermission,
  resetResumeEvaluationForJobChange: defaultResetResumeEvaluationForJobChange,
  resolveRecruitingVisibilityScope: defaultResolveRecruitingVisibilityScope,
  resolveResumeUploadStorage: defaultResolveResumeUploadStorage,
  resumeLibraryReadRouter: defaultResumeLibraryReadRouter,
  retryFailedResumeParse: defaultRetryFailedResumeParse,
  scheduleResumeEvaluationForRecord: defaultScheduleResumeEvaluationForRecord,
  structuredResumeEvaluationRouter: defaultStructuredResumeEvaluationRouter,
  syncResumeProfileIdentity: defaultSyncResumeProfileIdentity,
  toBadRequest: defaultToBadRequest,
  updateResumeEvaluationStatus: defaultUpdateResumeEvaluationStatus,
  validateResumeFile: defaultValidateResumeFile,
};

export type ResumeLibraryRouterDependencies = typeof defaultResumeLibraryRouterDependencies;

export function createResumeLibraryRouter(
  overrides: Partial<ResumeLibraryRouterDependencies> = {},
) {
  const dependencies = { ...defaultResumeLibraryRouterDependencies, ...overrides };
  const {
    createResumeRecordFromStorage,
    db,
    deleteDuplicateMatchesForSource,
    deleteResumeSemanticIndexBestEffort,
    enqueueResumeReassessmentForRecord,
    enqueueResumeSemanticIndexJobBestEffort,
    findSemanticResumeDuplicates,
    forceResumeReparse,
    generateResumeScreeningBestEffort,
    invalidateStudioInterviewCaches,
    loadRecruitingJobDescriptionById,
    loadResumeDetail,
    normalizeResumeFile,
    parseResumeFastToProfile,
    reassessResumeRecord,
    recruitingJobDescriptionIdsExist,
    removeImportedInterviewFromConversations,
    replaceDuplicateMatchesForSource,
    resetResumeEvaluationForJobChange,
    resolveRecruitingVisibilityScope,
    resolveResumeUploadStorage,
    retryFailedResumeParse,
    scheduleResumeEvaluationForRecord,
    syncResumeProfileIdentity,
    toBadRequest,
    requirePermission,
    resumeLibraryReadRouter,
    recruitingRecordMeetingsRouter,
    structuredResumeEvaluationRouter,
    validateResumeFile,
    updateResumeEvaluationStatus,
  } = dependencies;
  const loadVisibilityScope = (
    organizationId: string,
    currentRole: string | null | undefined,
    userId: string | undefined,
  ): Promise<RecruitingVisibilityScope> => {
    if (!userId) {
      return Promise.resolve({ kind: "none" });
    }
    return resolveRecruitingVisibilityScope({ currentRole, organizationId, userId });
  };
  const reassessAfterJobDescriptionChange = async (input: {
    organizationId: string;
    resumeRecordId: string;
  }) => {
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
  };
  return (
    factory
      .createApp()
      .route("/", resumeLibraryReadRouter)
      .route("/:id/evaluation-history", defaultResumeEvaluationHistoryRouter)
      .route("/:id/meetings", recruitingRecordMeetingsRouter)
      .route("/:id/structured-evaluation", structuredResumeEvaluationRouter)
      .post(
        "/:id/retry-parse",
        requirePermission("resumeLibrary", "update"),
        requirePermission("resumeUploadBatch", "process"),
        async (c) => {
          const { activeOrg, user } = c.var;
          if (!activeOrg || !user) {
            return c.json({ message: "Unauthorized" }, 401);
          }
          const visibilityScope = await loadVisibilityScope(
            activeOrg.id,
            c.var.member?.role,
            user.id,
          );
          const resumeRecordId = c.req.param("id");
          const record = await loadResumeDetail(resumeRecordId, activeOrg.id, visibilityScope);
          if (!record) {
            return c.json({ error: "记录不存在。" }, 404);
          }
          if (record.resumeParseStatus !== "failed") {
            return c.json({ error: "只有解析失败的简历可以重新解析。" }, 409);
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
      .post(
        "/:id/force-reparse",
        requirePermission("resumeLibrary", "update"),
        requirePermission("resumeUploadBatch", "process"),
        async (c) => {
          const { activeOrg, member, user } = c.var;
          if (!activeOrg || !user) {
            return c.json({ message: "Unauthorized" }, 401);
          }
          // Workspace admins (and owners) only — not ordinary members with update permission.
          if (member?.role !== "admin" && member?.role !== "owner") {
            return c.json({ error: "仅工作区管理员可强制重新解析。" }, 403);
          }
          const visibilityScope = await loadVisibilityScope(activeOrg.id, member?.role, user.id);
          const resumeRecordId = c.req.param("id");
          const record = await loadResumeDetail(resumeRecordId, activeOrg.id, visibilityScope);
          if (!record) {
            return c.json({ error: "记录不存在。" }, 404);
          }
          if (!record.hasResumeFile) {
            return c.json({ error: "该记录没有可重新解析的简历文件。" }, 409);
          }
          try {
            const result = await forceResumeReparse({
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
            if (result.status === "no_file") {
              return c.json({ error: "该记录没有可重新解析的简历文件。" }, 409);
            }
            if (result.status === "busy") {
              return c.json({ error: "该简历正在解析中，请稍后再试。" }, 409);
            }
            return c.json({ error: "记录不存在。" }, 404);
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
          const selectedJob = input.data.jobDescriptionId
            ? await loadRecruitingJobDescriptionById(activeOrg.id, input.data.jobDescriptionId)
            : null;
          if (input.data.jobDescriptionId && !selectedJob) {
            return c.json({ error: "所选在招岗位不存在。" }, 400);
          }
          if (resumeReviewInput.data && selectedJob) {
            return c.json({ error: "关联岗位的候选人不接受客户端写入旧版简历评价。" }, 400);
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

          const resumeReview = resumeReviewInput.data;
          let resumeScreeningResult = null;
          if (resumeReview && resumeProfile) {
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
          if (resumeReview) {
            resumeReviewStatus = "ready";
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
            resumeReviewError: null,
            resumeReviewStatus,
            resumeScreeningError:
              resumeReview && !resumeScreeningResult ? "AI 分析生成失败。" : null,
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
          if (resumeProfile && selectedJob) {
            const scheduling = await scheduleResumeEvaluationForRecord({
              jobDescriptionId: selectedJob.id,
              organizationId: activeOrg.id,
              resumeRecordId: recordId,
              source: "resume_upload",
            });
            if (scheduling.status === "fallback_sync") {
              void (async () => {
                try {
                  await reassessResumeRecord({
                    organizationId: activeOrg.id,
                    resumeRecordId: recordId,
                  });
                } catch (error) {
                  console.error("[studio-resumes] fallback assessment failed", {
                    error,
                    resumeRecordId: recordId,
                  });
                }
              })();
            }
          }
          const visibilityScope = await loadVisibilityScope(
            activeOrg.id,
            c.var.member?.role,
            c.var.user?.id,
          );
          const detail = await loadResumeDetail(recordId, activeOrg.id, visibilityScope);
          return c.json(detail, 201);
        } catch (error) {
          const result = toBadRequest(error);
          // SAFETY: toBadRequest only returns the literal status values 400 or 500, both valid Hono status codes.
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
          const ok = await recruitingJobDescriptionIdsExist([input.jobDescriptionId], activeOrg.id);
          if (!ok) {
            return c.json({ error: "所选在招岗位不存在。" }, 400);
          }

          const nextJobDescriptionId = input.jobDescriptionId;
          const jobDescriptionChanged = existing.jobDescriptionId !== nextJobDescriptionId;
          const nextJobDescription = jobDescriptionChanged
            ? await loadRecruitingJobDescriptionById(activeOrg.id, nextJobDescriptionId)
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
          const resumeEvidenceChanged = Boolean(
            resumeProfile &&
            existing.resumeProfile &&
            computeResumeEvaluationInputHash({
              resumeContentHash: existing.resumeContentHash,
              resumeProfile,
              resumeText: null,
            }) !==
              computeResumeEvaluationInputHash({
                resumeContentHash: existing.resumeContentHash,
                resumeProfile: existing.resumeProfile,
                resumeText: null,
              }),
          );
          const now = new Date();
          let invalidatedAssessment = {};
          if (jobDescriptionChanged) {
            invalidatedAssessment = INVALIDATED_RESUME_ASSESSMENT_FOR_JOB_CHANGE;
          } else if (resumeEvidenceChanged) {
            invalidatedAssessment = INVALIDATED_AI_RESUME_ASSESSMENT;
          }
          const update: Partial<typeof studioInterview.$inferInsert> = {
            candidateEmail: input.candidateEmail || null,
            candidateName: input.candidateName,
            candidatePhone: input.candidatePhone || null,
            jobDescriptionId: nextJobDescriptionId,
            targetRole:
              input.targetRole || resumeProfile?.targetRoles[0] || existing.targetRole || null,
            updatedAt: now,
            ...invalidatedAssessment,
          };
          if (resumeProfile) {
            update.resumeProfile = resumeProfile;
          }

          await db.transaction(async (tx) => {
            if (jobDescriptionChanged || resumeEvidenceChanged) {
              const archive = buildPreQualitativeEvaluationArchive({
                organizationId: activeOrg.id,
                record: existing,
                resumeRecordId: id,
              });
              if (archive) {
                await tx.insert(resumeEvaluationVersion).values(archive).onConflictDoNothing();
              }
            }
            await tx
              .update(studioInterview)
              .set(update)
              .where(
                and(eq(studioInterview.id, id), eq(studioInterview.organizationId, activeOrg.id)),
              );
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
            (jobDescriptionChanged || resumeEvidenceChanged) &&
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
            const ok = await recruitingJobDescriptionIdsExist(
              [input.data.jobDescriptionId],
              activeOrg.id,
            );
            if (!ok) {
              return c.json({ error: "所选在招岗位不存在。" }, 400);
            }
          }
          const nextJobDescriptionId = input.data.jobDescriptionId || null;
          const jobDescriptionChanged = existing.jobDescriptionId !== nextJobDescriptionId;
          const nextJobDescription =
            jobDescriptionChanged && nextJobDescriptionId
              ? await loadRecruitingJobDescriptionById(activeOrg.id, nextJobDescriptionId)
              : null;

          const resumeProfile = syncResumeProfileIdentity(existing.resumeProfile, input.data);
          const resumeEvidenceChanged = Boolean(
            resumeProfile &&
            existing.resumeProfile &&
            computeResumeEvaluationInputHash({
              resumeContentHash: existing.resumeContentHash,
              resumeProfile,
              resumeText: null,
            }) !==
              computeResumeEvaluationInputHash({
                resumeContentHash: existing.resumeContentHash,
                resumeProfile: existing.resumeProfile,
                resumeText: null,
              }),
          );
          const resumeProfileUpdate: Partial<typeof studioInterview.$inferInsert> = resumeProfile
            ? { resumeProfile }
            : {};

          // 显式白名单写入 —— 绝不触碰 interviewQuestions / status / schedule /
          // notes / resume file / resumeReview。
          // Explicit whitelist — normal identity edits never touch interviewQuestions / status /
          // schedule / notes / resume file / resumeReview. A job change invalidates the old
          // job-bound AI assessment below.
          const now = new Date();
          let invalidatedAssessment = {};
          if (jobDescriptionChanged) {
            invalidatedAssessment = INVALIDATED_RESUME_ASSESSMENT_FOR_JOB_CHANGE;
          } else if (resumeEvidenceChanged) {
            invalidatedAssessment = INVALIDATED_AI_RESUME_ASSESSMENT;
          }
          const nextHrResumeAssessment = input.data.hrResumeAssessment || null;
          const hrAssessmentChanged = existing.hrResumeAssessment !== nextHrResumeAssessment;
          const update: Partial<typeof studioInterview.$inferInsert> = {
            candidateEmail: input.data.candidateEmail || null,
            candidateName:
              input.data.candidateName || resumeProfile?.name || existing.candidateName,
            candidatePhone: input.data.candidatePhone || resumeProfile?.phone || null,
            hrResumeAssessment: nextHrResumeAssessment,
            jobDescriptionId: nextJobDescriptionId,
            targetRole: input.data.targetRole || resumeProfile?.targetRoles[0] || null,
            updatedAt: now,
            ...resumeProfileUpdate,
            ...invalidatedAssessment,
          };
          if (hrAssessmentChanged) {
            update.hrResumeAssessmentUpdatedAt = now;
            update.hrResumeAssessmentUpdatedBy = c.var.user?.id ?? null;
          }

          await db.transaction(async (tx) => {
            if (jobDescriptionChanged || resumeEvidenceChanged) {
              const archive = buildPreQualitativeEvaluationArchive({
                organizationId: activeOrg.id,
                record: existing,
                resumeRecordId: id,
              });
              if (archive) {
                await tx.insert(resumeEvaluationVersion).values(archive).onConflictDoNothing();
              }
            }
            await tx
              .update(studioInterview)
              .set(update)
              .where(
                and(eq(studioInterview.id, id), eq(studioInterview.organizationId, activeOrg.id)),
              );
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
            (jobDescriptionChanged || resumeEvidenceChanged) &&
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
          // SAFETY: toBadRequest only returns the literal status values 400 or 500, both valid Hono status codes.
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
            .select({
              id: studioInterview.id,
              resumeParseStatus: studioInterview.resumeParseStatus,
            })
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
      )
  );
}

export const resumeLibraryRouter = createResumeLibraryRouter();
