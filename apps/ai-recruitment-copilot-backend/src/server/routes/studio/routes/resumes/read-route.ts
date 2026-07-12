import type { ContentfulStatusCode } from "hono/utils/http-status";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { getObjectBytes, getObjectStream } from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import { interviewAuditLog, studioInterview, studioInterviewSchedule } from "@arc/db-schema/schema";
import { parseCsvParam } from "@arc/shared/csv";
import { canApplyCandidatePipelineEvent } from "@arc/shared/candidate-pipeline-machine";
import { resolveRecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import {
  canLaunchInterviewFromResume,
  resumeEvaluationStatusSubmitSchema,
} from "@arc/shared/studio-resumes";
import { invalidateStudioInterviewCaches } from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import {
  loadResumeDetailForWorkspaceMember,
  loadResumeDetail,
  queryPaginatedResumeRecords,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resumes";
import { submitResumeEvaluationOnce } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/evaluation";
import { loadCandidateTimeline } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/timeline";
import { listOrgSkillSuggestions } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/skills";
import {
  createDefaultScheduleEntry,
  studioInterviewQuestionClientSchema,
} from "@arc/db-schema/studio-interviews";
import {
  buildScheduleRows,
  toBadRequest,
} from "@arc/ai-recruitment-copilot-backend/server/routes/interview/utils";
import {
  listInterviewRoundsForCandidate,
  loadInterviewRoundDetail,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/interview-rounds";
import { findSemanticResumeDuplicates } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/dedup-service";
import { listDuplicateMatchesForSource } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/duplicate-matches";
import { autoBindApplicableTemplates } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-questions/dao/bindings";
import { loadOrCreateActiveInterviewContextSnapshot } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/context-snapshots";
import { reassessResumeRecord } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/review-worker";
import { createPptxPreviewPdfResponse } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/utils/pptx-preview";

const dedupCheckInputSchema = z.object({
  email: z.string().trim().max(200).nullable().optional(),
  name: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  resumeProfile: z.custom<ResumeProfile>().nullable().optional(),
});

// 「发起 AI 面试」请求体：候选人侧已存在招聘台行，只把（可能被用户编辑过的）
// 面试题落库，并新建一条默认排期。零长度数组允许，方便日后扩展。
// "Launch interview" payload — the candidate row already exists, so we just
// persist the (possibly edited) questions and add a default schedule entry.
// Zero-length is allowed.
const launchInterviewSchema = z.object({
  interviewQuestions: z.array(studioInterviewQuestionClientSchema).max(50),
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

export const resumeLibraryReadRouter = factory
  .createApp()
  .get(
    "/",
    requirePermission("resumeLibrary", "read"),
    zValidator(
      "query",
      z.object({
        creatorIds: z.string().optional(),
        jdIds: z.string().optional(),
        knownTotal: z.coerce.number().int().min(0).max(10_000_000).optional(),
        outcomes: z.string().optional(),
        page: z.string().optional(),
        pageSize: z.string().optional(),
        pipelineStages: z.string().optional(),
        search: z.string().optional(),
        skills: z.string().optional(),
        sortBy: z.string().optional(),
        sortOrder: z.string().optional(),
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
      const result = await queryPaginatedResumeRecords(
        activeOrg.id,
        {
          creatorIds: parseCsvParam(q.creatorIds),
          jobDescriptionIds: parseCsvParam(q.jdIds),
          outcomes: parseCsvParam(q.outcomes),
          pipelineStages: parseCsvParam(q.pipelineStages),
          search: q.search,
          skills: parseCsvParam(q.skills),
        },
        {
          page: q.page,
          pageSize: q.pageSize,
          sortBy: q.sortBy,
          sortOrder: q.sortOrder,
        },
        visibilityScope,
        q.knownTotal,
      );
      return c.json(result, 200);
    },
  )
  .get(
    "/skill-suggestions",
    requirePermission("resumeLibrary", "read"),
    zValidator(
      "query",
      z.object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        prefix: z.string().trim().max(80).optional(),
      }),
      jsonValidatorError("查询参数无效。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const q = c.req.valid("query");
      const records = await listOrgSkillSuggestions(activeOrg.id, {
        limit: q.limit,
        prefix: q.prefix,
      });
      return c.json({ records }, 200);
    },
  )
  .post(
    "/dedup-check",
    requirePermission("resumeLibrary", "read"),
    zValidator("json", dedupCheckInputSchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const input = c.req.valid("json");
      const matches = await findSemanticResumeDuplicates({
        email: input.email ?? null,
        name: input.name ?? null,
        organizationId: activeOrg.id,
        phone: input.phone ?? null,
        resumeProfile: input.resumeProfile ?? null,
      });
      console.info("[resume-dedup-check] response", {
        matchCount: matches.length,
        matches: matches.map((match) => ({
          id: match.id,
          level: match.level,
          score: match.score,
          semanticReasons: match.semanticReasons,
          similarity: match.similarity,
        })),
        organizationId: activeOrg.id,
        route: "studio.resumes",
      });
      return c.json({ matches }, 200);
    },
  )
  .get("/:id", requirePermission("resumeLibrary", "read"), async (c) => {
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
    return c.json(record, 200);
  })
  .get("/:id/duplicate-matches", requirePermission("resumeLibrary", "read"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const visibilityScope = await loadVisibilityScope(activeOrg.id, c.var.member?.role, user.id);
    const record = await loadResumeDetail(id, activeOrg.id, visibilityScope);
    if (!record) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const matches = await listDuplicateMatchesForSource({
      organizationId: activeOrg.id,
      poolOwnerUserId: user.id,
      sourceId: id,
      sourceType: "studio_interview",
    });
    return c.json({ matches }, 200);
  })
  .get("/:id/timeline", requirePermission("resumeLibrary", "read"), async (c) => {
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
    const timeline = await loadCandidateTimeline(id, activeOrg.id, visibilityScope);
    if (!timeline) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    return c.json(timeline, 200);
  })
  .get("/:id/review", async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const record = await loadResumeDetailForWorkspaceMember(id, activeOrg.id);
    if (!record) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    return c.json(record, 200);
  })
  .post("/:id/reassess", requirePermission("resumeLibrary", "update"), async (c) => {
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
    try {
      await reassessResumeRecord({
        organizationId: activeOrg.id,
        resumeRecordId: id,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 重新评估失败，请稍后重试。";
      const isEligibilityError = [
        "已结案候选人不能重新评估。",
        "简历解析完成后才能重新评估。",
        "请先关联在招岗位后再重新评估。",
      ].includes(message);
      if (isEligibilityError) {
        return c.json({ error: message }, 409);
      }
      const detail = await loadResumeDetail(id, activeOrg.id, visibilityScope);
      return c.json(detail, 500);
    }

    invalidateStudioInterviewCaches(activeOrg.id);
    const detail = await loadResumeDetail(id, activeOrg.id, visibilityScope);
    return c.json(detail, 200);
  })
  .get("/:id/review/timeline", async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const timeline = await loadCandidateTimeline(id, activeOrg.id, { kind: "all" });
    if (!timeline) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    return c.json(timeline, 200);
  })
  .get("/:id/review/rounds", async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const existing = await loadResumeDetailForWorkspaceMember(id, activeOrg.id);
    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const rounds = await listInterviewRoundsForCandidate(id, activeOrg.id);
    return c.json(rounds, 200);
  })
  .get("/:id/review/resume", async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const existing = await loadResumeDetailForWorkspaceMember(id, activeOrg.id);
    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    if (!existing.hasResumeFile) {
      return c.json({ error: "该候选人没有可预览的简历文件。" }, 404);
    }

    const [row] = await db
      .select({
        resumeFileName: studioInterview.resumeFileName,
        resumeStorageKey: studioInterview.resumeStorageKey,
      })
      .from(studioInterview)
      .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, activeOrg.id)))
      .limit(1);

    if (!row?.resumeStorageKey) {
      return c.json({ error: "简历文件已不可用。" }, 404);
    }

    const object = await getObjectStream(row.resumeStorageKey);
    if (!object) {
      return c.json({ error: "简历文件已不可用。" }, 404);
    }

    const filename = row.resumeFileName || "resume.pdf";
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
    const id = c.req.param("id");
    const existing = await loadResumeDetailForWorkspaceMember(id, activeOrg.id);
    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    if (!existing.hasResumeFile) {
      return c.json({ error: "该候选人没有可预览的简历文件。" }, 404);
    }

    const [row] = await db
      .select({
        resumeFileName: studioInterview.resumeFileName,
        resumeStorageKey: studioInterview.resumeStorageKey,
      })
      .from(studioInterview)
      .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, activeOrg.id)))
      .limit(1);

    if (!row?.resumeStorageKey) {
      return c.json({ error: "简历文件已不可用。" }, 404);
    }

    const object = await getObjectBytes(row.resumeStorageKey);
    if (!object) {
      return c.json({ error: "简历文件已不可用。" }, 404);
    }

    return createPptxPreviewPdfResponse({
      bytes: object.bytes,
      cacheKey: row.resumeStorageKey,
      fileName: row.resumeFileName,
      mediaType: object.contentType,
    });
  })
  .post(
    "/:id/review/evaluation",
    zValidator("json", resumeEvaluationStatusSubmitSchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const id = c.req.param("id");
      const existing = await loadResumeDetailForWorkspaceMember(id, activeOrg.id);
      if (!existing) {
        return c.json({ error: "记录不存在。" }, 404);
      }
      const input = c.req.valid("json");
      const result = await submitResumeEvaluationOnce({
        id,
        operatorId: c.var.user?.id ?? null,
        organizationId: activeOrg.id,
        status: input.status,
      });
      if (result.status === "already_evaluated") {
        return c.json({ error: "该简历已评估，不能重复评估。" }, 409);
      }
      if (result.status === "not_found") {
        return c.json({ error: "记录不存在。" }, 404);
      }
      invalidateStudioInterviewCaches(activeOrg.id);
      const detail = await loadResumeDetailForWorkspaceMember(id, activeOrg.id);
      return c.json(detail, 200);
    },
  )
  .get("/:id/rounds", requirePermission("resumeLibrary", "read"), async (c) => {
    // 拉取该候选人的所有面试轮次（按 sortOrder 升序），用于招聘台详情弹窗的「AI 面试」tab。
    // List all rounds for this candidate, sorted by sortOrder asc — used by
    // the resume library detail dialog's "AI 面试" tab.
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const candidateId = c.req.param("id");
    const visibilityScope = await loadVisibilityScope(
      activeOrg.id,
      c.var.member?.role,
      c.var.user?.id,
    );
    const existing = await loadResumeDetail(candidateId, activeOrg.id, visibilityScope);
    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const rounds = await listInterviewRoundsForCandidate(candidateId, activeOrg.id);
    return c.json(rounds, 200);
  })
  .post(
    "/:id/launch-interview",
    requirePermission("resumeLibrary", "update"),
    zValidator("json", launchInterviewSchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      // 从招聘台「发起 AI 面试」：把（可能被用户编辑过的）面试题写回现有
      // studioInterview 行，并新建一条默认排期。状态推到 "ready" 让候选人侧
      // 状态与 AI 面试列表的语义一致。
      //
      // Launch AI interview from the resume library: write the (possibly
      // edited) questions back to the existing studioInterview row and create
      // a default schedule entry. Status is promoted to "ready" to align with
      // save-and-start.
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

      // 阶段守卫：已结案候选人必须先「重新激活」才能再走 AI 面试，避免：
      // 1) 强行写回 ai_interview 后旧的 closedMeta / closedAt / closedReason 没被清。
      // 2) 绕过 reactivate 既定流程造成审计断层。
      // Stage guard: closed candidates must reactivate first. Otherwise we'd:
      // 1) leak stale closedMeta/closedAt/closedReason into the active record;
      // 2) bypass the reactivate audit path.
      if (existing.pipelineStage === "closed") {
        return c.json({ error: "候选人已结案，请先「重新激活」后再发起 AI 面试。" }, 409);
      }
      if (
        !canApplyCandidatePipelineEvent(
          { humanInterviewReadyForOffer: false, stage: existing.pipelineStage },
          { type: "START_AI_INTERVIEW" },
        )
      ) {
        return c.json({ error: "候选人已进入后续招聘阶段，不能再发起 AI 面试。" }, 409);
      }
      if (!canLaunchInterviewFromResume(existing.resumeParseStatus)) {
        return c.json({ error: "简历解析完成后才能发起 AI 面试。" }, 409);
      }

      const { interviewQuestions } = c.req.valid("json");
      const now = new Date();
      const [scheduleRow] = buildScheduleRows(
        activeOrg.id,
        id,
        [createDefaultScheduleEntry()],
        now,
        undefined,
        c.var.user?.id ?? null,
      );
      if (!scheduleRow) {
        return c.json({ error: "未生成面试轮次。" }, 400);
      }

      try {
        await db.transaction(async (tx) => {
          await tx
            .update(studioInterview)
            .set({
              interviewQuestions,
              // 从 screening 推进到 ai_interview；轮次进度由 schedule.status 独立维护。
              // Advance to ai_interview; round progress remains on schedule.status.
              pipelineStage: "ai_interview",
              updatedAt: now,
            })
            .where(
              and(eq(studioInterview.id, id), eq(studioInterview.organizationId, activeOrg.id)),
            );
          await tx.insert(studioInterviewSchedule).values(scheduleRow);
          await tx.insert(interviewAuditLog).values({
            action: "ai_interview_launched",
            createdAt: now,
            detail: {
              questionCount: interviewQuestions.length,
              roundId: scheduleRow.id,
              roundLabel: scheduleRow.roundLabel,
            },
            id: crypto.randomUUID(),
            interviewRecordId: id,
            operatorId: c.var.user?.id ?? null,
            organizationId: activeOrg.id,
            scheduleEntryId: scheduleRow.id,
          });
          await autoBindApplicableTemplates(tx, id, existing.jobDescriptionId);
        });
        await loadOrCreateActiveInterviewContextSnapshot({
          createdBy: c.var.user?.id ?? null,
          interviewRecordId: id,
          reason: "create",
          scheduleEntryId: scheduleRow.id,
        });
      } catch (error) {
        const result = toBadRequest(error);
        return c.json({ error: result.error }, { status: result.status as ContentfulStatusCode });
      }

      invalidateStudioInterviewCaches(activeOrg.id);
      const detail = await loadInterviewRoundDetail(scheduleRow.id, activeOrg.id, visibilityScope);
      return c.json(detail, 201);
    },
  )
  .get("/:id/resume", requirePermission("resumeLibrary", "read"), async (c) => {
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
    if (!existing.hasResumeFile) {
      return c.json({ error: "该候选人没有可预览的简历文件。" }, 404);
    }

    const [row] = await db
      .select({
        resumeFileName: studioInterview.resumeFileName,
        resumeStorageKey: studioInterview.resumeStorageKey,
      })
      .from(studioInterview)
      .where(eq(studioInterview.id, id))
      .limit(1);

    if (!row?.resumeStorageKey) {
      return c.json({ error: "简历文件已不可用。" }, 404);
    }

    const object = await getObjectStream(row.resumeStorageKey);
    if (!object) {
      return c.json({ error: "简历文件已不可用。" }, 404);
    }

    const filename = row.resumeFileName || "resume.pdf";
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
  .get("/:id/resume-preview.pdf", requirePermission("resumeLibrary", "read"), async (c) => {
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
    if (!existing.hasResumeFile) {
      return c.json({ error: "该候选人没有可预览的简历文件。" }, 404);
    }

    const [row] = await db
      .select({
        resumeFileName: studioInterview.resumeFileName,
        resumeStorageKey: studioInterview.resumeStorageKey,
      })
      .from(studioInterview)
      .where(eq(studioInterview.id, id))
      .limit(1);

    if (!row?.resumeStorageKey) {
      return c.json({ error: "简历文件已不可用。" }, 404);
    }

    const object = await getObjectBytes(row.resumeStorageKey);
    if (!object) {
      return c.json({ error: "简历文件已不可用。" }, 404);
    }

    return createPptxPreviewPdfResponse({
      bytes: object.bytes,
      cacheKey: row.resumeStorageKey,
      fileName: row.resumeFileName,
      mediaType: object.contentType,
    });
  });
// oxlint-disable-next-line complexity -- single create handler orchestrates upload + parse + insert.
