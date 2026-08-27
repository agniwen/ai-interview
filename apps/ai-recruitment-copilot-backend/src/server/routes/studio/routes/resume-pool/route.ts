import type { ContentfulStatusCode } from "hono/utils/http-status";
import { zValidator } from "@hono/zod-validator";
import { db as defaultDb } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  getObjectBytes as defaultGetObjectBytes,
  getObjectStream as defaultGetObjectStream,
} from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { jobDescription } from "@arc/db-schema/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  parseResumeFastToProfile as defaultParseResumeFastToProfile,
  validateResumeFile as defaultValidateResumeFile,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission as defaultRequirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import {
  intersectRequestedCreatorIds as defaultIntersectRequestedCreatorIds,
  resolveRecruitingVisibilityScope as defaultResolveRecruitingVisibilityScope,
} from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import {
  normalizeResumeFile as defaultNormalizeResumeFile,
  storeInterviewResume as defaultStoreInterviewResume,
  toBadRequest as defaultToBadRequest,
} from "@arc/ai-recruitment-copilot-backend/server/routes/interview/utils";
import {
  loadRecruitingJobDescriptionById as defaultLoadRecruitingJobDescriptionById,
  recruitingJobDescriptionIdsExist as defaultRecruitingJobDescriptionIdsExist,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { createPptxPreviewPdfResponse as defaultCreatePptxPreviewPdfResponse } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/utils/pptx-preview";
import { enqueueResumeReviewGenerationForRecordBestEffort as defaultEnqueueResumeReviewGenerationForRecordBestEffort } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/review-queue";
import { enqueueCandidateQuestionGenerationForRecordBestEffort as defaultEnqueueCandidateQuestionGenerationForRecordBestEffort } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/candidate-question-generation";
import { reassessResumeRecord as defaultReassessResumeRecord } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/review-worker";
import { findSemanticResumeDuplicates as defaultFindSemanticResumeDuplicates } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/dedup-service";
import { listDuplicateMatchesForSource as defaultListDuplicateMatchesForSource } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/duplicate-matches";
import { completeResumePoolReadinessWithDefaultAdapters as defaultCompleteResumePoolReadinessWithDefaultAdapters } from "./utils/readiness";
import {
  bindResumePoolItemJobDescription as defaultBindResumePoolItemJobDescription,
  createResumePoolItem as defaultCreateResumePoolItem,
  deleteOwnPoolItem as defaultDeleteOwnPoolItem,
  importPoolItemToResumeLibrary as defaultImportPoolItemToResumeLibrary,
  loadResumePoolJobMatchResult as defaultLoadResumePoolJobMatchResult,
  listResumePoolUploaders as defaultListResumePoolUploaders,
  loadResumePoolItem as defaultLoadResumePoolItem,
  publishPrivatePoolItem as defaultPublishPrivatePoolItem,
  queryResumePoolItems as defaultQueryResumePoolItems,
} from "./dao";
import { resumePoolRecommendationsRouter as defaultResumePoolRecommendationsRouter } from "./routes/recommendations/route";
import { retryFailedResumeParse as defaultRetryFailedResumeParse } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/utils/retry";
import { launchAiInterviewRound as defaultLaunchAiInterviewRound } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/application/default-launch-ai-interview-round";
import {
  resumePoolBindSchema,
  resumePoolCreateInputSchema,
  resumePoolImportInputSchema,
  resumePoolListQuerySchema,
  nextShanghaiCalendarDayStart,
  shanghaiCalendarDayStart,
} from "./schema";

const formDataTextSchema = z.string();

export interface ResumePoolRouterDependencies {
  bindResumePoolItemJobDescription: typeof defaultBindResumePoolItemJobDescription;
  completeResumePoolReadinessWithDefaultAdapters: typeof defaultCompleteResumePoolReadinessWithDefaultAdapters;
  createPptxPreviewPdfResponse: typeof defaultCreatePptxPreviewPdfResponse;
  createResumePoolItem: typeof defaultCreateResumePoolItem;
  db: typeof defaultDb;
  deleteOwnPoolItem: typeof defaultDeleteOwnPoolItem;
  enqueueCandidateQuestionGenerationForRecordBestEffort: typeof defaultEnqueueCandidateQuestionGenerationForRecordBestEffort;
  enqueueResumeReviewGenerationForRecordBestEffort: typeof defaultEnqueueResumeReviewGenerationForRecordBestEffort;
  findSemanticResumeDuplicates: typeof defaultFindSemanticResumeDuplicates;
  getObjectBytes: typeof defaultGetObjectBytes;
  getObjectStream: typeof defaultGetObjectStream;
  importPoolItemToResumeLibrary: typeof defaultImportPoolItemToResumeLibrary;
  intersectRequestedCreatorIds: typeof defaultIntersectRequestedCreatorIds;
  listDuplicateMatchesForSource: typeof defaultListDuplicateMatchesForSource;
  listResumePoolUploaders: typeof defaultListResumePoolUploaders;
  launchAiInterviewRound: typeof defaultLaunchAiInterviewRound;
  loadRecruitingJobDescriptionById: typeof defaultLoadRecruitingJobDescriptionById;
  loadResumePoolItem: typeof defaultLoadResumePoolItem;
  loadResumePoolJobMatchResult: typeof defaultLoadResumePoolJobMatchResult;
  normalizeResumeFile: typeof defaultNormalizeResumeFile;
  parseResumeFastToProfile: typeof defaultParseResumeFastToProfile;
  publishPrivatePoolItem: typeof defaultPublishPrivatePoolItem;
  queryResumePoolItems: typeof defaultQueryResumePoolItems;
  reassessResumeRecord: typeof defaultReassessResumeRecord;
  recruitingJobDescriptionIdsExist: typeof defaultRecruitingJobDescriptionIdsExist;
  requirePermission: typeof defaultRequirePermission;
  resolveRecruitingVisibilityScope: typeof defaultResolveRecruitingVisibilityScope;
  resumePoolRecommendationsRouter: typeof defaultResumePoolRecommendationsRouter;
  retryFailedResumeParse: typeof defaultRetryFailedResumeParse;
  storeInterviewResume: typeof defaultStoreInterviewResume;
  toBadRequest: typeof defaultToBadRequest;
  validateResumeFile: typeof defaultValidateResumeFile;
}

function toNullableString(value: FormDataEntryValue | null): string | null {
  const parsed = formDataTextSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const trimmed = parsed.data.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseCreateFormData(formData: FormData) {
  return resumePoolCreateInputSchema.safeParse({
    candidateEmail: toNullableString(formData.get("candidateEmail")),
    candidateName: toNullableString(formData.get("candidateName")),
    candidatePhone: toNullableString(formData.get("candidatePhone")),
    jobDescriptionId: toNullableString(formData.get("jobDescriptionId")),
    notes: toNullableString(formData.get("notes")),
    scope: toNullableString(formData.get("scope")) ?? "private",
    targetRole: toNullableString(formData.get("targetRole")),
  });
}

async function resolveResumePoolParsedResume(
  resume: File,
  uploadResult: { cachedResumeProfile: ResumeProfile | null; resumeText: string | null },
  parseResumeFastToProfile: typeof defaultParseResumeFastToProfile,
): Promise<{ resumeProfile: ResumeProfile; resumeText: string | null }> {
  let resumeProfile = uploadResult.cachedResumeProfile ?? null;
  let resumeText = uploadResult.resumeText ?? null;
  if (!resumeProfile) {
    const parsed = await parseResumeFastToProfile(resume);
    ({ resumeProfile } = parsed);
    resumeText = parsed.parsedText;
  }
  return { resumeProfile, resumeText };
}

const defaultResumePoolRouterDependencies: ResumePoolRouterDependencies = {
  bindResumePoolItemJobDescription: defaultBindResumePoolItemJobDescription,
  completeResumePoolReadinessWithDefaultAdapters:
    defaultCompleteResumePoolReadinessWithDefaultAdapters,
  createPptxPreviewPdfResponse: defaultCreatePptxPreviewPdfResponse,
  createResumePoolItem: defaultCreateResumePoolItem,
  db: defaultDb,
  deleteOwnPoolItem: defaultDeleteOwnPoolItem,
  enqueueCandidateQuestionGenerationForRecordBestEffort:
    defaultEnqueueCandidateQuestionGenerationForRecordBestEffort,
  enqueueResumeReviewGenerationForRecordBestEffort:
    defaultEnqueueResumeReviewGenerationForRecordBestEffort,
  findSemanticResumeDuplicates: defaultFindSemanticResumeDuplicates,
  getObjectBytes: defaultGetObjectBytes,
  getObjectStream: defaultGetObjectStream,
  importPoolItemToResumeLibrary: defaultImportPoolItemToResumeLibrary,
  intersectRequestedCreatorIds: defaultIntersectRequestedCreatorIds,
  launchAiInterviewRound: defaultLaunchAiInterviewRound,
  listDuplicateMatchesForSource: defaultListDuplicateMatchesForSource,
  listResumePoolUploaders: defaultListResumePoolUploaders,
  loadRecruitingJobDescriptionById: defaultLoadRecruitingJobDescriptionById,
  loadResumePoolItem: defaultLoadResumePoolItem,
  loadResumePoolJobMatchResult: defaultLoadResumePoolJobMatchResult,
  normalizeResumeFile: defaultNormalizeResumeFile,
  parseResumeFastToProfile: defaultParseResumeFastToProfile,
  publishPrivatePoolItem: defaultPublishPrivatePoolItem,
  queryResumePoolItems: defaultQueryResumePoolItems,
  reassessResumeRecord: defaultReassessResumeRecord,
  recruitingJobDescriptionIdsExist: defaultRecruitingJobDescriptionIdsExist,
  requirePermission: defaultRequirePermission,
  resolveRecruitingVisibilityScope: defaultResolveRecruitingVisibilityScope,
  resumePoolRecommendationsRouter: defaultResumePoolRecommendationsRouter,
  retryFailedResumeParse: defaultRetryFailedResumeParse,
  storeInterviewResume: defaultStoreInterviewResume,
  toBadRequest: defaultToBadRequest,
  validateResumeFile: defaultValidateResumeFile,
};

export function createResumePoolRouter(overrides: Partial<ResumePoolRouterDependencies> = {}) {
  const {
    bindResumePoolItemJobDescription,
    completeResumePoolReadinessWithDefaultAdapters,
    createPptxPreviewPdfResponse,
    createResumePoolItem,
    db,
    deleteOwnPoolItem,
    enqueueCandidateQuestionGenerationForRecordBestEffort,
    enqueueResumeReviewGenerationForRecordBestEffort,
    findSemanticResumeDuplicates,
    getObjectBytes,
    getObjectStream,
    importPoolItemToResumeLibrary,
    intersectRequestedCreatorIds,
    listDuplicateMatchesForSource,
    listResumePoolUploaders,
    launchAiInterviewRound,
    loadRecruitingJobDescriptionById,
    loadResumePoolItem,
    loadResumePoolJobMatchResult,
    normalizeResumeFile,
    parseResumeFastToProfile,
    publishPrivatePoolItem,
    queryResumePoolItems,
    reassessResumeRecord,
    recruitingJobDescriptionIdsExist,
    requirePermission,
    resolveRecruitingVisibilityScope,
    resumePoolRecommendationsRouter,
    retryFailedResumeParse,
    storeInterviewResume,
    toBadRequest,
    validateResumeFile,
  } = { ...defaultResumePoolRouterDependencies, ...overrides };

  return (
    factory
      .createApp()
      .get(
        "/",
        requirePermission("resumePool", "read"),
        zValidator("query", resumePoolListQuerySchema, jsonValidatorError("查询参数无效。")),
        async (c) => {
          const { activeOrg, user } = c.var;
          if (!activeOrg || !user) {
            return c.json({ message: "Unauthorized" }, 401);
          }
          const q = c.req.valid("query");
          const uploaderIds = q.uploaderIds
            ? q.uploaderIds
                .split(",")
                .map((id) => id.trim())
                .filter(Boolean)
            : undefined;
          const visibilityScope = await resolveRecruitingVisibilityScope({
            currentRole: c.var.member?.role,
            organizationId: activeOrg.id,
            userId: user.id,
          });
          const creatorIds =
            q.scope === "private"
              ? intersectRequestedCreatorIds(
                  q.uploaderId === "all" ? null : [q.uploaderId ?? user.id],
                  visibilityScope,
                )
              : undefined;
          const result = await queryResumePoolItems({
            createdAtBefore: q.createdTo ? nextShanghaiCalendarDayStart(q.createdTo) : undefined,
            createdAtFrom: q.createdFrom ? shanghaiCalendarDayStart(q.createdFrom) : undefined,
            creatorIds: q.scope === "private" ? creatorIds : uploaderIds,
            importStatus: q.importStatus,
            limit: q.limit,
            offset: q.offset,
            organizationId: activeOrg.id,
            scope: q.scope,
            search: q.search,
            sortBy: q.sortBy,
            sortOrder: q.sortOrder,
            sourceType: q.sourceType,
            textFilters: q.textFilters,
          });
          return c.json(result, 200);
        },
      )
      .get("/uploaders", requirePermission("resumePool", "read"), async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const visibilityScope = await resolveRecruitingVisibilityScope({
          currentRole: c.var.member?.role,
          organizationId: activeOrg.id,
          userId: user.id,
        });
        const records = await listResumePoolUploaders({
          organizationId: activeOrg.id,
          visibilityScope,
        });
        return c.json({ records }, 200);
      })
      .get("/:id", requirePermission("resumePool", "read"), async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const visibilityScope = await resolveRecruitingVisibilityScope({
          currentRole: c.var.member?.role,
          organizationId: activeOrg.id,
          userId: user.id,
        });
        const item = await loadResumePoolItem({
          organizationId: activeOrg.id,
          poolItemId: c.req.param("id"),
          visibilityScope,
        });
        if (!item) {
          return c.json({ error: "记录不存在。" }, 404);
        }
        return c.json(item, 200);
      })
      .get("/:id/duplicate-matches", requirePermission("resumePool", "read"), async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const poolItemId = c.req.param("id");
        const visibilityScope = await resolveRecruitingVisibilityScope({
          currentRole: c.var.member?.role,
          organizationId: activeOrg.id,
          userId: user.id,
        });
        const item = await loadResumePoolItem({
          organizationId: activeOrg.id,
          poolItemId,
          visibilityScope,
        });
        if (!item) {
          return c.json({ error: "记录不存在。" }, 404);
        }
        const matches = await listDuplicateMatchesForSource({
          organizationId: activeOrg.id,
          sourceId: poolItemId,
          sourceType: "resume_pool_item",
        });
        return c.json({ matches }, 200);
      })
      // 疑似重复简历对照等场景使用「同工作区成员即可读」的详情/简历接口：
      // 与招聘台 /:id/review 采用同一权限策略 —— 仅校验登录 + 工作区成员身份，
      // 不做 resumePool read 动作权限与可见范围过滤（产品决策：查重查看忽略权限配置）。
      // Permission-free read surface for the duplicate-resume comparison dialog —
      // same policy as studio resumes /:id/review: workspace membership only,
      // no resumePool read action permission, no visibility-scope filtering.
      .get("/:id/review", async (c) => {
        const { activeOrg } = c.var;
        if (!activeOrg) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const item = await loadResumePoolItem({
          organizationId: activeOrg.id,
          poolItemId: c.req.param("id"),
          visibilityScope: { kind: "all" },
        });
        if (!item) {
          return c.json({ error: "记录不存在。" }, 404);
        }
        return c.json(item, 200);
      })
      .get("/:id/review/resume", async (c) => {
        const { activeOrg } = c.var;
        if (!activeOrg) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const item = await loadResumePoolItem({
          organizationId: activeOrg.id,
          poolItemId: c.req.param("id"),
          visibilityScope: { kind: "all" },
        });
        if (!item?.resumeStorageKey) {
          return c.json({ error: "简历文件已不可用。" }, 404);
        }
        const object = await getObjectStream(item.resumeStorageKey);
        if (!object) {
          return c.json({ error: "简历文件已不可用。" }, 404);
        }
        const filename = item.resumeFileName || "resume.pdf";
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
      .get("/:id/review/resume-preview.pdf", async (c) => {
        const { activeOrg } = c.var;
        if (!activeOrg) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const item = await loadResumePoolItem({
          organizationId: activeOrg.id,
          poolItemId: c.req.param("id"),
          visibilityScope: { kind: "all" },
        });
        if (!item?.resumeStorageKey) {
          return c.json({ error: "简历文件已不可用。" }, 404);
        }
        const object = await getObjectBytes(item.resumeStorageKey);
        if (!object) {
          return c.json({ error: "简历文件已不可用。" }, 404);
        }
        return createPptxPreviewPdfResponse({
          bytes: object.bytes,
          cacheKey: item.resumeStorageKey,
          fileName: item.resumeFileName,
          mediaType: object.contentType,
        });
      })
      .post(
        "/:id/retry-parse",
        requirePermission("resumePool", "read"),
        requirePermission("resumeUploadBatch", "process"),
        async (c) => {
          const { activeOrg, user } = c.var;
          if (!activeOrg || !user) {
            return c.json({ message: "Unauthorized" }, 401);
          }
          const visibilityScope = await resolveRecruitingVisibilityScope({
            currentRole: c.var.member?.role,
            organizationId: activeOrg.id,
            userId: user.id,
          });
          const poolItemId = c.req.param("id");
          const item = await loadResumePoolItem({
            organizationId: activeOrg.id,
            poolItemId,
            visibilityScope,
          });
          if (!item) {
            return c.json({ error: "记录不存在。" }, 404);
          }
          if (item.resumeParseStatus !== "failed") {
            return c.json({ error: "只有解析失败的简历可以重新解析。" }, 409);
          }
          try {
            const result = await retryFailedResumeParse({
              organizationId: activeOrg.id,
              poolItemId,
              requestedBy: user.id,
            });
            if (result.status === "queued") {
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
      .get("/:id/resume", requirePermission("resumePool", "read"), async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const visibilityScope = await resolveRecruitingVisibilityScope({
          currentRole: c.var.member?.role,
          organizationId: activeOrg.id,
          userId: user.id,
        });
        const item = await loadResumePoolItem({
          organizationId: activeOrg.id,
          poolItemId: c.req.param("id"),
          visibilityScope,
        });
        if (!item?.resumeStorageKey) {
          return c.json({ error: "简历文件已不可用。" }, 404);
        }
        const object = await getObjectStream(item.resumeStorageKey);
        if (!object) {
          return c.json({ error: "简历文件已不可用。" }, 404);
        }
        const filename = item.resumeFileName || "resume.pdf";
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
      .get("/:id/resume-preview.pdf", requirePermission("resumePool", "read"), async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const visibilityScope = await resolveRecruitingVisibilityScope({
          currentRole: c.var.member?.role,
          organizationId: activeOrg.id,
          userId: user.id,
        });
        const item = await loadResumePoolItem({
          organizationId: activeOrg.id,
          poolItemId: c.req.param("id"),
          visibilityScope,
        });
        if (!item?.resumeStorageKey) {
          return c.json({ error: "简历文件已不可用。" }, 404);
        }
        const object = await getObjectBytes(item.resumeStorageKey);
        if (!object) {
          return c.json({ error: "简历文件已不可用。" }, 404);
        }
        return createPptxPreviewPdfResponse({
          bytes: object.bytes,
          cacheKey: item.resumeStorageKey,
          fileName: item.resumeFileName,
          mediaType: object.contentType,
        });
      })
      .delete("/:id", requirePermission("resumePool", "delete"), async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        try {
          await deleteOwnPoolItem({
            organizationId: activeOrg.id,
            poolItemId: c.req.param("id"),
            userId: user.id,
          });
          return c.json({ success: true }, 200);
        } catch (error) {
          return c.json({ error: error instanceof Error ? error.message : "删除失败。" }, 404);
        }
      })
      // oxlint-disable-next-line eslint/complexity -- upload route orchestrates validation, parsing, dedup indexing, and persistence.
      .post("/", requirePermission("resumePool", "create"), async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        try {
          const formData = await c.req.formData();
          const resume = normalizeResumeFile(formData.get("resume"));
          if (!resume) {
            return c.json({ error: "请上传简历文件。" }, 400);
          }
          validateResumeFile(resume);

          const input = parseCreateFormData(formData);
          if (!input.success) {
            return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
          }
          if (input.data.jobDescriptionId) {
            const ok = await recruitingJobDescriptionIdsExist(
              [input.data.jobDescriptionId],
              activeOrg.id,
            );
            if (!ok) {
              return c.json({ error: "所选在招岗位不存在。" }, 400);
            }
          }

          const uploadResult = await storeInterviewResume(
            crypto.randomUUID(),
            resume,
            user.id,
            activeOrg.id,
          );
          if (!uploadResult?.storageKey) {
            return c.json({ error: "文件上传失败，请重试。" }, 500);
          }
          const { resumeProfile, resumeText } = await resolveResumePoolParsedResume(
            resume,
            uploadResult,
            parseResumeFastToProfile,
          );
          const duplicateMatches = await findSemanticResumeDuplicates({
            email: input.data.candidateEmail ?? resumeProfile.email ?? null,
            name: input.data.candidateName ?? resumeProfile.name ?? null,
            organizationId: activeOrg.id,
            phone: input.data.candidatePhone ?? resumeProfile.phone ?? null,
            poolOwnerUserId: input.data.scope === "private" ? user.id : undefined,
            poolScope: input.data.scope === "private" ? "private" : undefined,
            resumeProfile,
            sourceTypes:
              input.data.scope === "private"
                ? ["studio_interview", "resume_pool_item"]
                : ["studio_interview"],
          });
          const id = await createResumePoolItem({
            candidateEmail: input.data.candidateEmail ?? null,
            candidateName: input.data.candidateName ?? null,
            candidatePhone: input.data.candidatePhone ?? null,
            contentHash: uploadResult.contentHash,
            createdBy: user.id,
            jobBindingMode: input.data.jobDescriptionId ? "manual" : null,
            jobDescriptionId: input.data.jobDescriptionId ?? null,
            notes: input.data.notes ?? null,
            organizationId: activeOrg.id,
            resumeFileName: resume.name,
            resumeParseStatus: "processing",
            resumeProfile,
            resumeText,
            scope: input.data.scope,
            storageKey: uploadResult.storageKey,
            targetRole: input.data.targetRole ?? null,
          });
          await completeResumePoolReadinessWithDefaultAdapters({
            duplicateMatches,
            organizationId: activeOrg.id,
            poolItemId: id,
          });
          const item = await loadResumePoolItem({
            organizationId: activeOrg.id,
            poolItemId: id,
            userId: user.id,
          });
          return c.json(item, 201);
        } catch (error) {
          const result = toBadRequest(error);
          // SAFETY: toBadRequest only returns the literal status values 400 or 500, both valid Hono status codes.
          return c.json({ error: result.error }, { status: result.status as ContentfulStatusCode });
        }
      })
      .post("/:id/publish", requirePermission("resumePool", "publish"), async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        try {
          const item = await publishPrivatePoolItem({
            organizationId: activeOrg.id,
            poolItemId: c.req.param("id"),
            userId: user.id,
          });
          return c.json(item, 201);
        } catch (error) {
          return c.json({ error: error instanceof Error ? error.message : "推送失败。" }, 400);
        }
      })
      .post(
        "/:id/import",
        requirePermission("resumePool", "import"),
        requirePermission("resumeLibrary", "create"),
        zValidator("json", resumePoolImportInputSchema, jsonValidatorError("请求参数无效。")),
        async (c) => {
          const { activeOrg, user } = c.var;
          if (!activeOrg || !user) {
            return c.json({ message: "Unauthorized" }, 401);
          }
          const input = c.req.valid("json");
          if (input.jobDescriptionId) {
            const jd = await loadRecruitingJobDescriptionById(activeOrg.id, input.jobDescriptionId);
            if (!jd) {
              return c.json({ error: "所选在招岗位不存在。" }, 400);
            }
          }
          try {
            const result = await importPoolItemToResumeLibrary({
              dedupPolicy: input.dedupPolicy,
              importedBy: user.id,
              initialRecruitmentStage: input.initialRecruitmentStage,
              jobDescriptionId: input.jobDescriptionId,
              organizationId: activeOrg.id,
              poolItemId: c.req.param("id"),
              reimport: input.reimport === true,
            });
            if (result.status === "imported" && input.initialRecruitmentStage === "ai_interview") {
              const visibilityScope = await resolveRecruitingVisibilityScope({
                currentRole: c.var.member?.role,
                organizationId: activeOrg.id,
                userId: user.id,
              });
              const launchResult = await launchAiInterviewRound({
                actorId: user.id,
                interviewRecordId: result.resumeRecordId,
                organizationId: activeOrg.id,
                visibilityScope,
              });
              if (!launchResult.ok) {
                throw new Error("AI 面试轮次创建失败，请进入招聘台后重试。");
              }
            }
            if (result.status === "imported") {
              await enqueueCandidateQuestionGenerationForRecordBestEffort({
                organizationId: activeOrg.id,
                resumeRecordId: result.resumeRecordId,
              });
            }
            if (result.status === "imported" && input.jobDescriptionId) {
              const scheduling = await enqueueResumeReviewGenerationForRecordBestEffort({
                jobDescriptionId: input.jobDescriptionId,
                organizationId: activeOrg.id,
                poolItemId: c.req.param("id"),
                resumeRecordId: result.resumeRecordId,
                source: "resume_pool_import",
              });
              if (scheduling.status === "fallback_sync") {
                void (async () => {
                  try {
                    await reassessResumeRecord({
                      organizationId: activeOrg.id,
                      resumeRecordId: result.resumeRecordId,
                    });
                  } catch (error) {
                    console.error("[resume-pool] fallback assessment failed", {
                      error,
                      resumeRecordId: result.resumeRecordId,
                    });
                  }
                })();
              }
            }
            return c.json(result, result.status === "imported" ? 201 : 409);
          } catch (error) {
            return c.json({ error: error instanceof Error ? error.message : "入库失败。" }, 400);
          }
        },
      )
      .post(
        "/:id/bind",
        requirePermission("resumePool", "import"),
        requirePermission("jd", "read"),
        zValidator("json", resumePoolBindSchema, jsonValidatorError("请求参数无效。")),
        async (c) => {
          const { activeOrg, user } = c.var;
          if (!activeOrg || !user) {
            return c.json({ message: "Unauthorized" }, 401);
          }
          const { jobDescriptionId } = c.req.valid("json");
          const item = await loadResumePoolItem({
            organizationId: activeOrg.id,
            poolItemId: c.req.param("id"),
            userId: user.id,
          });
          if (!item) {
            return c.json({ error: "记录不存在。" }, 404);
          }
          const [jd] = await db
            .select({ id: jobDescription.id })
            .from(jobDescription)
            .where(
              and(
                eq(jobDescription.id, jobDescriptionId),
                eq(jobDescription.organizationId, activeOrg.id),
                eq(jobDescription.lifecycleStatus, "published"),
              ),
            )
            .limit(1);
          if (!jd) {
            return c.json({ error: "所选在招岗位不存在。" }, 400);
          }
          const bound = await bindResumePoolItemJobDescription({
            actorId: user.id,
            jobDescriptionId,
            organizationId: activeOrg.id,
            poolItemId: item.id,
          });
          if (!bound) {
            return c.json({ error: "记录不存在。" }, 404);
          }
          const updated = await loadResumePoolItem({
            organizationId: activeOrg.id,
            poolItemId: item.id,
            userId: user.id,
          });
          if (!updated) {
            return c.json({ error: "绑定后的入池记录读取失败。" }, 500);
          }
          return c.json(updated, 200);
        },
      )
      .get("/:id/job-match", requirePermission("resumePool", "read"), async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const item = await loadResumePoolItem({
          organizationId: activeOrg.id,
          poolItemId: c.req.param("id"),
          userId: user.id,
        });
        if (!item) {
          return c.json({ error: "记录不存在。" }, 404);
        }
        const result = await loadResumePoolJobMatchResult({
          organizationId: activeOrg.id,
          poolItemId: item.id,
        });
        return c.json(result, 200);
      })
      .route("/:id/recommendations", resumePoolRecommendationsRouter)
  );
}

export const resumePoolRouter = createResumePoolRouter();
