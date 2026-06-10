import type { ContentfulStatusCode } from "hono/utils/http-status";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { getObjectStream } from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import { studioInterview, studioInterviewSchedule } from "@arc/db-schema/schema";
import { parseCsvParam } from "@arc/shared/csv";
import {
  canDeleteResumeRecord,
  canEditResumeRecord,
  canLaunchInterviewFromResume,
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
import {
  loadResumeDetail,
  queryPaginatedResumeRecords,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resumes";
import { loadCandidateTimeline } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/timeline";
import {
  listOrgSkillSuggestions,
  syncResumeSkills,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/skills";
import {
  createDefaultScheduleEntry,
  parseResumePayloadInput,
} from "@arc/db-schema/studio-interviews";
import {
  buildScheduleRows,
  normalizeResumeFile,
  storeInterviewResume,
  toBadRequest,
} from "@arc/ai-recruitment-copilot-backend/server/routes/interview/utils";
import {
  listInterviewRoundsForCandidate,
  loadInterviewRoundDetail,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/interview-rounds";
import { queryInterviewDedup } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/studio-interviews";
import { autoBindApplicableTemplates } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-questions/dao/bindings";
import { jobDescriptionIdsExist } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { createResumeRecordFromStorage } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/create-from-storage";
import { syncResumeProfileIdentity } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/profile-sync";

const dedupCheckInputSchema = z.object({
  email: z.string().trim().max(200).nullable().optional(),
  name: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});

// 「发起 AI 面试」请求体：候选人侧已存在简历库行，只把（可能被用户编辑过的）
// 面试题落库，并新建一条默认排期。零长度数组允许，方便日后扩展。
// "Launch interview" payload — the candidate row already exists, so we just
// persist the (possibly edited) questions and add a default schedule entry.
// Zero-length is allowed.
const launchInterviewSchema = z.object({
  interviewQuestions: z
    .array(
      z.object({
        difficulty: z.enum(["easy", "medium", "hard"]),
        order: z.number().int().nonnegative(),
        question: z.string().trim().min(1).max(500),
      }),
    )
    .max(50),
});

function toNullableString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
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
    jobDescriptionId: toNullableString(formData.get("jobDescriptionId")) ?? "",
    notes: toNullableString(formData.get("notes")) ?? "",
    targetRole: toNullableString(formData.get("targetRole")) ?? "",
  });
}

export function parseResumeLibraryCreateFormInput(formData: FormData) {
  return parseResumeLibraryFormData(formData, resumeLibraryFormSchema);
}

export function parseResumeLibraryEditFormInput(formData: FormData) {
  return parseResumeLibraryFormData(formData, resumeLibraryEditFormSchema);
}

export const resumeLibraryRouter = factory
  .createApp()
  .get(
    "/",
    requirePermission("resume", "read"),
    zValidator(
      "query",
      z.object({
        creatorIds: z.string().optional(),
        jdIds: z.string().optional(),
        outcomes: z.string().optional(),
        page: z.string().optional(),
        pageSize: z.string().optional(),
        pipelineStages: z.string().optional(),
        search: z.string().optional(),
        skills: z.string().optional(),
        sortBy: z.string().optional(),
        sortOrder: z.string().optional(),
        statuses: z.string().optional(),
      }),
      jsonValidatorError("查询参数无效。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const q = c.req.valid("query");
      const result = await queryPaginatedResumeRecords(
        activeOrg.id,
        {
          creatorIds: parseCsvParam(q.creatorIds),
          jobDescriptionIds: parseCsvParam(q.jdIds),
          outcomes: parseCsvParam(q.outcomes),
          pipelineStages: parseCsvParam(q.pipelineStages),
          search: q.search,
          skills: parseCsvParam(q.skills),
          statuses: parseCsvParam(q.statuses),
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
  .get(
    "/skill-suggestions",
    requirePermission("resume", "read"),
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
    requirePermission("resume", "read"),
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
  .get("/:id", requirePermission("resume", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const record = await loadResumeDetail(id, activeOrg.id);
    if (!record) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    return c.json(record, 200);
  })
  .get("/:id/timeline", requirePermission("resume", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const timeline = await loadCandidateTimeline(id, activeOrg.id);
    if (!timeline) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    return c.json(timeline, 200);
  })
  .get("/:id/rounds", requirePermission("resume", "read"), async (c) => {
    // 拉取该候选人的所有面试轮次（按 sortOrder 升序），用于简历库详情弹窗的「AI 面试」tab。
    // List all rounds for this candidate, sorted by sortOrder asc — used by
    // the resume library detail dialog's "AI 面试" tab.
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const candidateId = c.req.param("id");
    const existing = await loadResumeDetail(candidateId, activeOrg.id);
    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const rounds = await listInterviewRoundsForCandidate(candidateId, activeOrg.id);
    return c.json(rounds, 200);
  })
  .post(
    "/:id/launch-interview",
    requirePermission("resume", "update"),
    zValidator("json", launchInterviewSchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      // 从简历库「发起 AI 面试」：把（可能被用户编辑过的）面试题写回现有
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
      const existing = await loadResumeDetail(id, activeOrg.id);
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
              // 新模型：从 screening 推进到 ai_interview；保留 status 以兼容旧消费方。
              // New model: advance from screening to ai_interview; keep legacy status for old readers.
              pipelineStage: "ai_interview",
              status: "ready",
              updatedAt: now,
            })
            .where(
              and(eq(studioInterview.id, id), eq(studioInterview.organizationId, activeOrg.id)),
            );
          await tx.insert(studioInterviewSchedule).values(scheduleRow);
          await autoBindApplicableTemplates(tx, id, existing.jobDescriptionId);
        });
      } catch (error) {
        const result = toBadRequest(error);
        return c.json({ error: result.error }, { status: result.status as ContentfulStatusCode });
      }

      invalidateStudioInterviewCaches(activeOrg.id);
      const detail = await loadInterviewRoundDetail(scheduleRow.id, activeOrg.id);
      return c.json(detail, 201);
    },
  )
  .get("/:id/resume", requirePermission("resume", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const existing = await loadResumeDetail(id, activeOrg.id);
    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    if (!existing.hasResumeFile) {
      return c.json({ error: "该候选人没有可预览的简历 PDF。" }, 404);
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
        "Content-Type": object.contentType ?? "application/pdf",
        ...(object.contentLength !== undefined && {
          "Content-Length": String(object.contentLength),
        }),
      },
    });
  })
  // oxlint-disable-next-line complexity -- single create handler orchestrates upload + parse + insert.
  .post("/", requirePermission("resume", "create"), async (c) => {
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

      if (resume && !c.var.user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      if (input.data.jobDescriptionId) {
        const ok = await jobDescriptionIdsExist([input.data.jobDescriptionId], activeOrg.id);
        if (!ok) {
          return c.json({ error: "所选在招岗位不存在。" }, 400);
        }
      }

      const uploadResult =
        resume && c.var.user
          ? await storeInterviewResume(crypto.randomUUID(), resume, c.var.user.id, activeOrg.id)
          : null;
      const resumeStorageKey = uploadResult?.storageKey ?? null;
      const resumeContentHash = uploadResult?.contentHash ?? null;

      // 解析复用顺序：客户端预制 payload > 注册表缓存 > 现场兜底解析。
      // 服务端从不补跑题目生成——客户端没传 questions 就落库空数组。
      // Reuse order: client-prebaked payload → registry cache → server fallback.
      // Questions are NEVER generated server-side; if the client did not ship a
      // resumePayload, the row stores an empty interviewQuestions array.
      let resumeProfile =
        parsedResumePayload?.resumeProfile ?? uploadResult?.cachedResumeProfile ?? null;
      let parsedFileName: string | null = parsedResumePayload?.fileName ?? resume?.name ?? null;
      if (resume && !resumeProfile) {
        const parsed = await parseResumeFastToProfile(resume);
        ({ resumeProfile } = parsed);
        parsedFileName = resume.name;
      }

      const recordId = await createResumeRecordFromStorage({
        candidateEmail: input.data.candidateEmail || null,
        candidateName: input.data.candidateName || null,
        candidatePhone: input.data.candidatePhone || null,
        contentHash: resumeContentHash,
        interviewQuestions: parsedResumePayload?.interviewQuestions ?? [],
        jobDescriptionId: input.data.jobDescriptionId || null,
        notes: input.data.notes || null,
        organizationId: activeOrg.id,
        resumeFileName: parsedFileName,
        resumeProfile,
        storageKey: resumeStorageKey,
        targetRole: input.data.targetRole || null,
        userId: c.var.user?.id ?? null,
      });

      invalidateStudioInterviewCaches(activeOrg.id);
      const detail = await loadResumeDetail(recordId, activeOrg.id);
      return c.json(detail, 201);
    } catch (error) {
      const result = toBadRequest(error);
      return c.json({ error: result.error }, { status: result.status as ContentfulStatusCode });
    }
  })
  // oxlint-disable-next-line complexity -- single update handler orchestrates upload + parse + whitelist write.
  .patch("/:id", requirePermission("resume", "update"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    try {
      const existing = await loadResumeDetail(id, activeOrg.id);
      if (!existing) {
        return c.json({ error: "记录不存在。" }, 404);
      }
      if (!canEditResumeRecord(existing.resumeParseStatus)) {
        return c.json({ error: "简历解析完成后才能编辑。" }, 409);
      }

      const formData = await c.req.formData();
      const resume = normalizeResumeFile(formData.get("resume"));
      // 与 POST 对齐：在任何短路路径（缓存命中）之前先把 PDF / 20MB 校验显式跑掉。
      // Mirror POST — run the PDF / size gate before any short-circuit path
      // (e.g. registry cache hit) skips the parser.
      if (resume) {
        validateResumeFile(resume);
      }
      const input = parseResumeLibraryEditFormInput(formData);
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

      const uploadResult =
        resume && c.var.user
          ? await storeInterviewResume(id, resume, c.var.user.id, activeOrg.id)
          : null;

      let { resumeProfile } = existing;
      let { resumeFileName } = existing;
      const resumeStorageKey = uploadResult?.storageKey ?? null;
      const resumeContentHash = uploadResult?.contentHash ?? null;

      if (resume) {
        // 命中注册表时 storeInterviewResume 已经返回 cachedResumeProfile，不再
        // 无条件再跑一次 parseResumeFastToProfile —— 行为对齐 POST。
        // When the registry hits, storeInterviewResume already returned a
        // cached profile; skip the redundant parse to match POST semantics.
        let nextResumeProfile = uploadResult?.cachedResumeProfile ?? null;
        if (!nextResumeProfile) {
          const parsed = await parseResumeFastToProfile(resume);
          nextResumeProfile = parsed.resumeProfile;
        }
        resumeProfile = nextResumeProfile;
        resumeFileName = resume.name;
      }
      resumeProfile = syncResumeProfileIdentity(resumeProfile, input.data);
      let resumeProfileUpdate: Partial<typeof studioInterview.$inferInsert> = {};
      if (resume) {
        resumeProfileUpdate = {
          resumeContentHash: resumeContentHash ?? existing.resumeContentHash,
          resumeFileName,
          resumeParseError: null,
          resumeParseStatus: resumeProfile ? "ready" : "unparsed",
          resumeParsedAt: resumeProfile ? new Date() : null,
          resumeProfile,
          resumeStorageKey: resumeStorageKey ?? null,
        };
      } else if (resumeProfile) {
        resumeProfileUpdate = { resumeProfile };
      }

      // 显式白名单写入 —— 绝不触碰 interviewQuestions / status / schedule。
      // Explicit whitelist write — never touches interviewQuestions / status / schedule.
      const update = {
        candidateEmail: input.data.candidateEmail || null,
        candidateName: input.data.candidateName || resumeProfile?.name || existing.candidateName,
        candidatePhone: input.data.candidatePhone || resumeProfile?.phone || null,
        jobDescriptionId: input.data.jobDescriptionId || null,
        notes: input.data.notes || null,
        targetRole: input.data.targetRole || resumeProfile?.targetRoles[0] || null,
        updatedAt: new Date(),
        ...resumeProfileUpdate,
      } satisfies Partial<typeof studioInterview.$inferInsert>;

      await db.transaction(async (tx) => {
        await tx
          .update(studioInterview)
          .set(update)
          .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, activeOrg.id)));
        // 仅当上传新简历时才重刷技能索引；基础信息同步不会改变技能。
        // Only refresh the skill index for a new resume upload; identity-field
        // sync does not change skills.
        if (resume) {
          await syncResumeSkills(tx, {
            interviewId: id,
            organizationId: activeOrg.id,
            skills: resumeProfile?.skills,
          });
        }
      });

      invalidateStudioInterviewCaches(activeOrg.id);
      const detail = await loadResumeDetail(id, activeOrg.id);
      return c.json(detail, 200);
    } catch (error) {
      const result = toBadRequest(error);
      return c.json({ error: result.error }, { status: result.status as ContentfulStatusCode });
    }
  })
  .delete("/:id", requirePermission("resume", "delete"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const [record] = await db
      .select({ id: studioInterview.id, resumeParseStatus: studioInterview.resumeParseStatus })
      .from(studioInterview)
      .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, activeOrg.id)))
      .limit(1);
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
    requirePermission("resume", "delete"),
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
      const rows = await db
        .select({ id: studioInterview.id, resumeParseStatus: studioInterview.resumeParseStatus })
        .from(studioInterview)
        .where(
          and(inArray(studioInterview.id, ids), eq(studioInterview.organizationId, activeOrg.id)),
        );
      if (rows.some((row) => !canDeleteResumeRecord(row.resumeParseStatus))) {
        return c.json({ error: "所选记录包含解析排队或处理中的简历，暂不能删除。" }, 409);
      }

      const result = await db
        .delete(studioInterview)
        .where(
          and(inArray(studioInterview.id, ids), eq(studioInterview.organizationId, activeOrg.id)),
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
        await removeImportedInterviewFromConversations(activeOrg.id, deletedId.id);
      }
      return c.json({ deletedCount: result.length, success: true }, 200);
    },
  );
