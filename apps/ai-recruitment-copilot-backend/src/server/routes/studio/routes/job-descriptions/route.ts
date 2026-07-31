/* oxlint-disable max-lines -- collection, item, blueprint lifecycle, and operational endpoints remain one route-owned module. */
import { zValidator } from "@hono/zod-validator";
import { and, count, eq, inArray, ne } from "drizzle-orm";
import { uniq } from "lodash-es";
import { z } from "zod";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  department,
  interviewer,
  jobDescription,
  jobDescriptionInterviewer,
  studioInterview,
} from "@arc/db-schema/schema";
import {
  legacyJobDescriptionUpdateSchema,
  publishedJobOperationalUpdateSchema,
  structuredJobDescriptionCreateSchema,
  structuredJobDescriptionDraftUpdateSchema,
  structuredJobDescriptionPublishSchema,
} from "@arc/shared/job-descriptions";
import { computeResumeScreeningPolicyHash } from "@arc/shared/resume-screening";
import type { ReferralLinkCreateResult } from "@arc/shared/referrals";
import { validateJobDescriptionInterviewerDepartments } from "@arc/shared/job-description-interviewers";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { createInternalErrorResponse } from "@arc/ai-recruitment-copilot-backend/server/error-handler";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import {
  listAllJobDescriptions,
  listRecruitingJobDescriptions,
  loadJobDescriptionById,
  loadRecruitingJobDescriptionById,
  queryPaginatedJobDescriptions,
  serializeJobDescription,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { cacheTags, safeUpdateTag } from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import {
  deleteJobDescriptionSemanticIndexBestEffort,
  enqueueJobDescriptionIndexJobBestEffort,
} from "@arc/ai-recruitment-copilot-backend/lib/server/jd-semantic/enqueue";
import { generateJobDescriptionFromPrompt } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/utils/ai-job-description-generate";
import { generateResumeScreeningPolicyFromJobDescription } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/utils/resume-screening-policy-generate";
import {
  buildJobDescriptionCodeCandidates,
  pickAvailableJobDescriptionCode,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/utils/job-description-code";
import { recommendCandidatesForJobDescription } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/utils/recommendations";
import { getGlobalConfig } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/global-config/dao";
import { createJobDescriptionReferralLink } from "./dao/referral-links";
import {
  generateStructuredJobBlueprintPreview,
  JobEvaluationLifecycleError,
  publishStructuredJob,
} from "./application/job-evaluation-lifecycle";
import { BlueprintCompilationError } from "./utils/evaluation-blueprint-compiler";
import { computeJobEvaluationDraftInputHash } from "@arc/ai-recruitment-copilot-backend/lib/server/job-evaluation-hash";

const generateJobDescriptionBodySchema = z.object({
  departmentName: z.string().trim().max(120).optional(),
  jobName: z.string().trim().max(120).optional(),
  prompt: z.string().trim().min(1, "请填写 AI 填写指令").max(10_000),
});

const generateResumeScreeningPolicyBodySchema = z.object({
  description: z.string().trim().max(500).optional(),
  name: z.string().trim().max(120).optional(),
  prompt: z.string().trim().min(1, "请先填写岗位 Prompt").max(10_000),
});

async function validateReferences(
  organizationId: string,
  departmentId: string,
  interviewerIds: string[],
  allowCrossDepartmentInterviewers: boolean,
) {
  const [[departmentRow], interviewerRows] = await Promise.all([
    db
      .select({ id: department.id })
      .from(department)
      .where(and(eq(department.id, departmentId), eq(department.organizationId, organizationId)))
      .limit(1),
    interviewerIds.length > 0
      ? db
          .select({
            departmentId: interviewer.departmentId,
            departmentName: department.name,
            id: interviewer.id,
            name: interviewer.name,
          })
          .from(interviewer)
          .leftJoin(department, eq(interviewer.departmentId, department.id))
          .where(
            and(
              inArray(interviewer.id, interviewerIds),
              eq(interviewer.organizationId, organizationId),
            ),
          )
      : Promise.resolve(
          [] as {
            departmentId: string;
            departmentName: string | null;
            id: string;
            name: string;
          }[],
        ),
  ]);

  if (!departmentRow) {
    return { error: "所选部门不存在。" as const };
  }
  if (interviewerRows.length !== interviewerIds.length) {
    return { error: "存在无效的面试官，请刷新后重试。" as const };
  }
  return {
    error: validateJobDescriptionInterviewerDepartments({
      allowCrossDepartmentInterviewers,
      departmentId,
      interviewers: interviewerRows,
    }),
  };
}

function dedupeInterviewerIds(ids: string[]): string[] {
  return uniq(ids.map((id) => id.trim()).filter(Boolean));
}

function isJobCodeConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as { cause?: unknown; code?: unknown; constraint?: unknown };
  return (
    candidate.code === "23505" ||
    candidate.constraint === "job_description_org_code_uq" ||
    isJobCodeConflict(candidate.cause)
  );
}

const jobDescriptionListQuerySchema = z.object({
  departmentId: z.string().optional(),
  interviewerId: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
});

const recommendationBodySchema = z.object({
  excludeAlreadyLinked: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

const jobDescriptionPatchBodySchema = z.union([
  legacyJobDescriptionUpdateSchema,
  structuredJobDescriptionDraftUpdateSchema,
  publishedJobOperationalUpdateSchema,
]);

function jobLifecycleErrorPayload(error: JobEvaluationLifecycleError) {
  const messages: Record<string, string> = {
    JOB_ALREADY_PUBLISHED: "岗位已经发布。",
    JOB_BLUEPRINT_GENERATION_FAILED: "AI 评估蓝图生成暂时不可用，请稍后重试。",
    JOB_BLUEPRINT_PREVIEW_STALE: "评估蓝图已失效，请重新生成并确认。",
    JOB_EVALUATION_MODE_IMMUTABLE: "旧岗位不能切换到新版评估流程。",
    JOB_NOT_FOUND: "岗位不存在。",
  };
  return {
    code: error.code,
    error: messages[error.code] ?? "岗位状态冲突，请刷新后重试。",
  };
}

function buildReferralUrl(requestUrl: string, token: string): string {
  const { origin } = new URL(requestUrl);
  return `${origin}/referrals/${encodeURIComponent(token)}`;
}

export const jobDescriptionsRouter = factory
  .createApp()
  .post(
    "/ai-generate",
    requirePermission("jd", "update"),
    zValidator("json", generateJobDescriptionBodySchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }

      const body = c.req.valid("json");
      try {
        const result = await generateJobDescriptionFromPrompt({
          departmentName: body.departmentName ?? null,
          hrPrompt: body.prompt,
          jobName: body.jobName ?? null,
        });
        return c.json(result, 200);
      } catch (error) {
        return c.json(
          createInternalErrorResponse({
            context: { organizationId: activeOrg.id },
            error,
            operation: "job-description-ai-generate",
            publicMessage: "AI 生成失败。",
          }),
          500,
        );
      }
    },
  )
  .get(
    "/",
    requirePermission("jd", "read"),
    zValidator("query", jobDescriptionListQuerySchema, jsonValidatorError("查询参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const q = c.req.valid("query");
      const result = await queryPaginatedJobDescriptions(
        activeOrg.id,
        {
          departmentId: q.departmentId,
          interviewerId: q.interviewerId,
          search: q.search,
        },
        {
          page: q.page,
          pageSize: q.pageSize,
          sortBy: q.sortBy,
          sortOrder: q.sortOrder,
        },
      );
      return c.json(result, 200);
    },
  )
  .get("/all", requirePermission("jd", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const records = await listAllJobDescriptions(activeOrg.id);
    return c.json({ records }, 200);
  })
  .get("/recruiting", requirePermission("jd", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const records = await listRecruitingJobDescriptions(activeOrg.id);
    return c.json({ records }, 200);
  })
  .post("/generate-code", requirePermission("jd", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const now = new Date();
    const globalConfig = await getGlobalConfig(activeOrg.id);
    const candidates = buildJobDescriptionCodeCandidates({
      createdAt: now,
      prefix: globalConfig.jobCodePrefix,
    });
    const usedRows = await db
      .select({ code: jobDescription.code })
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.organizationId, activeOrg.id),
          inArray(jobDescription.code, candidates),
        ),
      );
    const code = pickAvailableJobDescriptionCode(
      candidates,
      usedRows.map((row) => row.code),
    );
    if (!code) {
      return c.json({ error: "岗位编码候选已用尽，请重试。" }, 409);
    }
    return c.json({ code }, 200);
  })
  .post(
    "/generate-screening-policy",
    requirePermission("jd", "update"),
    zValidator(
      "json",
      generateResumeScreeningPolicyBodySchema,
      jsonValidatorError("请求参数无效。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const input = c.req.valid("json");
      try {
        const policy = await generateResumeScreeningPolicyFromJobDescription({
          description: input.description ?? null,
          name: input.name ?? null,
          prompt: input.prompt,
        });
        return c.json({ policy }, 200);
      } catch (error) {
        return c.json(
          createInternalErrorResponse({
            context: { organizationId: activeOrg.id },
            error,
            operation: "job-description-screening-policy-generate",
            publicMessage: "筛选规则生成失败。",
          }),
          500,
        );
      }
    },
  )
  .post(
    "/",
    requirePermission("jd", "create"),
    zValidator("json", structuredJobDescriptionCreateSchema, jsonValidatorError("表单校验失败。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const input = c.req.valid("json");
      const interviewerIds = dedupeInterviewerIds(input.interviewerIds);
      if (interviewerIds.length === 0) {
        return c.json({ error: "请至少选择一位面试官。" }, 400);
      }

      const { error: referenceError } = await validateReferences(
        activeOrg.id,
        input.departmentId,
        interviewerIds,
        input.allowCrossDepartmentInterviewers,
      );
      if (referenceError) {
        return c.json({ error: referenceError }, 400);
      }

      const now = new Date();
      const globalConfig = await getGlobalConfig(activeOrg.id);
      const codeCandidates = buildJobDescriptionCodeCandidates({
        createdAt: now,
        prefix: globalConfig.jobCodePrefix,
      });
      const preferredCodeCandidates = input.code
        ? [input.code, ...codeCandidates.filter((code) => code !== input.code)]
        : codeCandidates;

      for (const code of preferredCodeCandidates) {
        const record = {
          allowCrossDepartmentInterviewers: input.allowCrossDepartmentInterviewers,
          code,
          createdAt: now,
          createdBy: c.var.user?.id ?? null,
          deductionRuleSetVersion: null,
          departmentId: input.departmentId,
          description: input.description?.trim() || null,
          evaluationBlueprint: null,
          evaluationBlueprintHash: null,
          evaluationBlueprintPreview: null,
          evaluationBlueprintPreviewGeneratedAt: null,
          evaluationBlueprintPreviewHash: null,
          evaluationBlueprintPreviewInputHash: null,
          evaluationBlueprintSchemaVersion: null,
          evaluationMode: "structured",
          feishuChatBoundAt: null,
          feishuChatBoundBy: null,
          feishuChatId: null,
          id: crypto.randomUUID(),
          lifecycleStatus: "draft",
          name: input.name.trim(),
          organizationId: activeOrg.id,
          // presetQuestions is deprecated — column kept with default [] for legacy
          // data; new rows always store an empty array.
          presetQuestions: [],
          prompt: input.prompt.trim(),
          publishedAt: null,
          resumeScreeningPolicy: null,
          resumeScreeningPolicyHash: null,
          resumeScreeningPolicyVersion: 1,
          structuredConfig: input.structuredConfig,
          updatedAt: now,
        } satisfies typeof jobDescription.$inferSelect;

        try {
          await db.transaction(async (tx) => {
            await tx.insert(jobDescription).values(record);
            await tx.insert(jobDescriptionInterviewer).values(
              interviewerIds.map((id) => ({
                createdAt: now,
                interviewerId: id,
                jobDescriptionId: record.id,
              })),
            );
          });

          safeUpdateTag(`job-descriptions:${activeOrg.id}`);
          safeUpdateTag(`interviewers:${activeOrg.id}`);

          return c.json(serializeJobDescription(record, interviewerIds), 201);
        } catch (insertError) {
          if (!isJobCodeConflict(insertError)) {
            throw insertError;
          }
        }
      }

      return c.json({ error: "岗位编码候选已用尽，请重试。" }, 409);
    },
  )
  .post("/:id/evaluation-blueprint-preview", requirePermission("jd", "update"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    try {
      const preview = await generateStructuredJobBlueprintPreview({
        actorId: user.id,
        jobDescriptionId: c.req.param("id"),
        organizationId: activeOrg.id,
      });
      safeUpdateTag(`job-descriptions:${activeOrg.id}`);
      return c.json(preview, 200);
    } catch (error) {
      if (error instanceof BlueprintCompilationError) {
        return c.json({ code: error.code, error: error.message }, 422);
      }
      if (error instanceof JobEvaluationLifecycleError) {
        let status: 404 | 409 | 503 = 409;
        if (error.code === "JOB_NOT_FOUND") {
          status = 404;
        } else if (error.code === "JOB_BLUEPRINT_GENERATION_FAILED") {
          status = 503;
        }
        return c.json(jobLifecycleErrorPayload(error), status);
      }
      throw error;
    }
  })
  .post(
    "/:id/publish",
    requirePermission("jd", "update"),
    zValidator("json", structuredJobDescriptionPublishSchema, jsonValidatorError("发布参数无效。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const id = c.req.param("id");
      try {
        await publishStructuredJob({
          actorId: user.id,
          confirmedBlueprintHash: c.req.valid("json").confirmedBlueprintHash,
          jobDescriptionId: id,
          organizationId: activeOrg.id,
        });
        await enqueueJobDescriptionIndexJobBestEffort({
          jobDescriptionId: id,
          organizationId: activeOrg.id,
        });
        safeUpdateTag(`job-descriptions:${activeOrg.id}`);
        const record = await loadJobDescriptionById(activeOrg.id, id);
        return c.json(record, 200);
      } catch (error) {
        if (error instanceof JobEvaluationLifecycleError) {
          const status = error.code === "JOB_NOT_FOUND" ? 404 : 409;
          return c.json(jobLifecycleErrorPayload(error), status);
        }
        throw error;
      }
    },
  )
  .patch(
    "/:id/operational",
    requirePermission("jd", "update"),
    zValidator("json", publishedJobOperationalUpdateSchema, jsonValidatorError("表单校验失败。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const id = c.req.param("id");
      const existing = await loadJobDescriptionById(activeOrg.id, id);
      if (!existing) {
        return c.json({ error: "在招岗位不存在。" }, 404);
      }
      const input = c.req.valid("json");
      const interviewerIds = dedupeInterviewerIds(input.interviewerIds);
      const { error } = await validateReferences(
        activeOrg.id,
        input.departmentId,
        interviewerIds,
        input.allowCrossDepartmentInterviewers,
      );
      if (error) {
        return c.json({ error }, 400);
      }
      const now = new Date();
      await db.transaction(async (tx) => {
        await tx
          .update(jobDescription)
          .set({
            allowCrossDepartmentInterviewers: input.allowCrossDepartmentInterviewers,
            departmentId: input.departmentId,
            updatedAt: now,
          })
          .where(and(eq(jobDescription.id, id), eq(jobDescription.organizationId, activeOrg.id)));
        await tx
          .delete(jobDescriptionInterviewer)
          .where(eq(jobDescriptionInterviewer.jobDescriptionId, id));
        await tx.insert(jobDescriptionInterviewer).values(
          interviewerIds.map((interviewerId) => ({
            createdAt: now,
            interviewerId,
            jobDescriptionId: id,
          })),
        );
      });
      safeUpdateTag(`job-descriptions:${activeOrg.id}`);
      safeUpdateTag(`interviewers:${activeOrg.id}`);
      return c.json(await loadJobDescriptionById(activeOrg.id, id), 200);
    },
  )
  .post("/:id/referral-link", requirePermission("jd", "read"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const record = await loadRecruitingJobDescriptionById(activeOrg.id, id);
    if (!record) {
      return c.json({ error: "在招岗位不存在。" }, 404);
    }
    const { token } = await createJobDescriptionReferralLink({
      createdBy: user.id,
      jobDescriptionId: id,
      organizationId: activeOrg.id,
    });
    return c.json(
      { url: buildReferralUrl(c.req.url, token) } satisfies ReferralLinkCreateResult,
      201,
    );
  })
  .get("/:id", requirePermission("jd", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const record = await loadJobDescriptionById(activeOrg.id, id);
    if (!record) {
      return c.json({ error: "在招岗位不存在。" }, 404);
    }
    return c.json(record, 200);
  })
  .post(
    "/:id/recommendations",
    requirePermission("jd", "read"),
    requirePermission("resumeLibrary", "read"),
    zValidator("json", recommendationBodySchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const id = c.req.param("id");
      const record = await loadRecruitingJobDescriptionById(activeOrg.id, id);
      if (!record) {
        return c.json({ error: "在招岗位不存在。" }, 404);
      }
      const body = c.req.valid("json");
      try {
        const result = await recommendCandidatesForJobDescription({
          excludeAlreadyLinked: body.excludeAlreadyLinked,
          jobDescription: {
            departmentName: null,
            description: record.description,
            id: record.id,
            name: record.name,
            prompt: record.prompt,
          },
          limit: body.limit,
          organizationId: activeOrg.id,
        });
        return c.json(result, 200);
      } catch (error) {
        console.warn("[job-description-recommendations] failed", {
          error,
          id,
          organizationId: activeOrg.id,
        });
        return c.json({ error: "人才推荐失败，请稍后重试。" }, 500);
      }
    },
  )
  .patch(
    "/:id",
    requirePermission("jd", "update"),
    zValidator("json", jobDescriptionPatchBodySchema, jsonValidatorError("表单校验失败。")),
    // oxlint-disable-next-line complexity -- mode-specific update contracts converge at one legacy URL.
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const id = c.req.param("id");
      const existing = await loadJobDescriptionById(activeOrg.id, id);
      if (!existing) {
        return c.json({ error: "在招岗位不存在。" }, 404);
      }

      const rawInput = c.req.valid("json");
      let input = publishedJobOperationalUpdateSchema.safeParse(rawInput);
      if (existing.evaluationMode === "legacy") {
        input = legacyJobDescriptionUpdateSchema.safeParse(rawInput);
      } else if (existing.lifecycleStatus === "draft") {
        input = structuredJobDescriptionDraftUpdateSchema.safeParse(rawInput);
      }
      if (!input.success) {
        if (existing.evaluationMode === "structured" && existing.lifecycleStatus === "published") {
          return c.json(
            {
              code: "JOB_EVALUATION_FROZEN",
              error: "岗位已发布，评估相关设置不能修改。",
            },
            409,
          );
        }
        return c.json({ error: "表单校验失败。" }, 400);
      }
      const interviewerIds = dedupeInterviewerIds(input.data.interviewerIds);
      if (interviewerIds.length === 0) {
        return c.json({ error: "请至少选择一位面试官。" }, 400);
      }

      const { error } = await validateReferences(
        activeOrg.id,
        input.data.departmentId,
        interviewerIds,
        input.data.allowCrossDepartmentInterviewers,
      );
      if (error) {
        return c.json({ error }, 400);
      }

      const now = new Date();
      const operationalValues = {
        allowCrossDepartmentInterviewers: input.data.allowCrossDepartmentInterviewers,
        departmentId: input.data.departmentId,
        updatedAt: now,
      };
      let updateValues: Partial<typeof jobDescription.$inferInsert> = operationalValues;
      if (existing.evaluationMode === "legacy") {
        const legacyInput = legacyJobDescriptionUpdateSchema.parse(input.data);
        const nextPolicyHash = computeResumeScreeningPolicyHash(legacyInput.resumeScreeningPolicy);
        const existingPolicyHash =
          existing.resumeScreeningPolicyHash ??
          computeResumeScreeningPolicyHash(existing.resumeScreeningPolicy);
        const policyChanged = nextPolicyHash !== existingPolicyHash;
        const nextPolicyVersion = policyChanged
          ? existing.resumeScreeningPolicyVersion + 1
          : existing.resumeScreeningPolicyVersion;
        updateValues = {
          ...operationalValues,
          description: legacyInput.description?.trim() || null,
          ...(!existing.code && legacyInput.code ? { code: legacyInput.code } : {}),
          name: legacyInput.name.trim(),
          prompt: legacyInput.prompt.trim(),
          resumeScreeningPolicy: {
            ...legacyInput.resumeScreeningPolicy,
            version: nextPolicyVersion,
          },
          resumeScreeningPolicyHash: nextPolicyHash,
          resumeScreeningPolicyVersion: nextPolicyVersion,
          structuredConfig: legacyInput.structuredConfig,
        };
      } else if (existing.lifecycleStatus === "draft") {
        const draftInput = structuredJobDescriptionDraftUpdateSchema.parse(input.data);
        const oldInputHash = computeJobEvaluationDraftInputHash({
          description: existing.description,
          prompt: existing.prompt,
          structuredConfig: existing.structuredConfig,
        });
        const newInputHash = computeJobEvaluationDraftInputHash({
          description: draftInput.description?.trim() || null,
          prompt: draftInput.prompt,
          structuredConfig: draftInput.structuredConfig,
        });
        updateValues = {
          ...operationalValues,
          description: draftInput.description?.trim() || null,
          ...(!existing.code && draftInput.code ? { code: draftInput.code } : {}),
          name: draftInput.name.trim(),
          prompt: draftInput.prompt.trim(),
          structuredConfig: draftInput.structuredConfig,
          ...(oldInputHash === newInputHash
            ? {}
            : {
                evaluationBlueprintPreview: null,
                evaluationBlueprintPreviewGeneratedAt: null,
                evaluationBlueprintPreviewHash: null,
                evaluationBlueprintPreviewInputHash: null,
              }),
        };
      }
      try {
        const updatedCurrentLifecycle = await db.transaction(async (tx) => {
          const updated = await tx
            .update(jobDescription)
            .set(updateValues)
            .where(
              and(
                eq(jobDescription.id, id),
                eq(jobDescription.organizationId, activeOrg.id),
                eq(jobDescription.evaluationMode, existing.evaluationMode),
                eq(jobDescription.lifecycleStatus, existing.lifecycleStatus),
              ),
            )
            .returning({ id: jobDescription.id });
          if (updated.length === 0) {
            return false;
          }

          // Replace junction links atomically.
          await tx
            .delete(jobDescriptionInterviewer)
            .where(eq(jobDescriptionInterviewer.jobDescriptionId, id));
          await tx.insert(jobDescriptionInterviewer).values(
            interviewerIds.map((interviewerId) => ({
              createdAt: now,
              interviewerId,
              jobDescriptionId: id,
            })),
          );
          return true;
        });
        if (!updatedCurrentLifecycle) {
          return c.json({ code: "JOB_EVALUATION_FROZEN", error: "岗位状态已变化。" }, 409);
        }
      } catch (updateError) {
        if (isJobCodeConflict(updateError)) {
          return c.json({ error: "岗位编码已被占用，请重新生成。" }, 409);
        }
        throw updateError;
      }

      safeUpdateTag(`job-descriptions:${activeOrg.id}`);
      safeUpdateTag(`interviewers:${activeOrg.id}`);

      if (existing.evaluationMode === "legacy") {
        await enqueueJobDescriptionIndexJobBestEffort({
          jobDescriptionId: id,
          organizationId: activeOrg.id,
        });
      }

      const updated = await loadJobDescriptionById(activeOrg.id, id);
      return c.json(updated, 200);
    },
  )
  .delete("/:id", requirePermission("jd", "delete"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const existing = await loadJobDescriptionById(activeOrg.id, id);
    if (!existing) {
      return c.json({ error: "在招岗位不存在。" }, 404);
    }

    // 有非归档候选人关联到该岗位时禁止删除：候选人是业务实体，外键的 SET NULL
    // 行为会让简历挂在"未知岗位"上，难以追溯，因此前置拦截。
    // Block delete when non-archived candidates still reference this JD —
    // SET NULL would orphan candidates onto an empty job-description column
    // and make follow-up triage hard. Force the user to deal with them first.
    const [resumeRow] = await db
      .select({ count: count() })
      .from(studioInterview)
      .where(
        and(eq(studioInterview.jobDescriptionId, id), ne(studioInterview.pipelineStage, "closed")),
      );
    const resumeCount = resumeRow?.count ?? 0;
    if (resumeCount > 0) {
      return c.json(
        {
          error: `当前有 ${resumeCount} 条简历关联到该在招岗位，无法删除；请先在招聘台中调整或删除这些候选人。`,
        },
        409,
      );
    }

    // jobDescriptionInterviewer cascades on JD delete; studio_interview.job_description_id → SET NULL.
    await db
      .delete(jobDescription)
      .where(and(eq(jobDescription.id, id), eq(jobDescription.organizationId, activeOrg.id)));
    safeUpdateTag(`job-descriptions:${activeOrg.id}`);
    safeUpdateTag(cacheTags.studioInterviews(activeOrg.id));
    safeUpdateTag(`interviewers:${activeOrg.id}`);

    await deleteJobDescriptionSemanticIndexBestEffort({
      jobDescriptionId: id,
      organizationId: activeOrg.id,
    });

    return c.json({ success: true }, 200);
  });
