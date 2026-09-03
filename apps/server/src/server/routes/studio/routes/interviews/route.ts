import { listTextFiltersSchema } from "@app/shared/list-text-filters";
import { zValidator } from "@hono/zod-validator";
import { studioInterviewCollectionRouter } from "./collection-route";
import { studioInterviewDetailRouter } from "./detail-route";
import { studioInterviewHumanRouter } from "./human-route";
import { and, eq, inArray, notExists } from "drizzle-orm";
import { uniq } from "lodash-es";
import { z } from "zod";
import type { ResumeProfile } from "@app/db-schema/interview/types";
import { createRequestWorkspaceAuthorizer } from "../../../../access/workspace-access-policy";
import { db } from "../../../../../lib/server/db/index";
import { interviewAuditLog, studioInterview, studioInterviewSchedule } from "@app/db-schema/schema";
import { resolveRecruitingVisibilityScope } from "../../../../access/recruiting-visibility";
import type { RecruitingVisibilityScope } from "../../../../access/recruiting-visibility";
import { parseCsvParam } from "@app/shared/csv";
import {
  candidateExpectationsMetaSchema,
  candidateOutcomeSchema,
  closedMetaSchema,
  pipelineStageSchema,
  studioInterviewQuestionClientSchema,
} from "@app/db-schema/studio-interviews";
import { factory, jsonValidatorError } from "../../../../factory";
import { refreshInterviewContextSnapshot } from "./dao/context-snapshots";
import { findSemanticResumeDuplicates } from "../../../../../lib/server/resume-semantic/dedup-service";
import {
  loadInterviewRoundDetail,
  queryPaginatedInterviewRounds,
  summarizeInterviewRoundCounts,
} from "./dao/interview-rounds";
import { roundEmailsRouter } from "./routes/round-emails/route";
import { notificationRecipientsRouter } from "./routes/notification-recipients/route";
import { requirePermission } from "../../../../middlewares/permission";
import { cacheTags, invalidateStudioInterviewCaches, safeUpdateTag } from "../../../../cache-tags";
import { transitionCandidateStage } from "./utils/candidate-stage-transition";
import { buildResetAiInterviewInvitation } from "./dao/ai-interview-invitation-access";

const dedupCheckInputSchema = z.object({
  email: z.string().trim().max(200).nullable().optional(),
  name: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  resumeProfile: z.custom<ResumeProfile>().nullable().optional(),
});

// 候选人阶段流转输入。强制 outcome 与 pipelineStage 的不变量：
//   pipelineStage='closed' ⇔ outcome ∈ {hired,rejected,withdrawn,archived}
// 其余阶段下 outcome 必须省略或为 in_pipeline；closedReason 仅 closed 阶段允许。
//
// Candidate stage transition input. Encodes the (pipelineStage, outcome)
// invariant: closed ⇔ a terminal outcome; everything else stays in_pipeline.
const transitionInputSchema = z
  .object({
    // 结束元数据；只在 pipelineStage='closed' 时使用，partial 写入（merge 进现有）。
    // previousStage 不接受用户输入——服务端自动写当前 stage。
    closedMeta: closedMetaSchema.omit({ previousStage: true }).partial().optional(),
    // @deprecated 旧字段，HR 端逐步迁移到 closedMeta.internalNotes；保留以兼容。
    closedReason: z.string().trim().max(500, "结束原因不能超过 500 字").optional().nullable(),
    interviewQuestions: z.array(studioInterviewQuestionClientSchema).max(50).optional(),
    outcome: candidateOutcomeSchema.optional(),
    pipelineStage: pipelineStageSchema,
    reactivationReason: z.string().trim().max(500, "重新激活原因不能超过 500 字").optional(),
  })
  .refine(
    (v) => {
      if (v.pipelineStage === "closed") {
        return v.outcome !== undefined && v.outcome !== "in_pipeline";
      }
      return v.outcome === undefined || v.outcome === "in_pipeline";
    },
    {
      message:
        "结束阶段必须指定一个终态 outcome（hired/rejected/withdrawn/archived）；非结束阶段 outcome 必须为 in_pipeline。",
      path: ["outcome"],
    },
  )
  .refine((v) => v.pipelineStage === "closed" || !v.closedReason, {
    message: "closedReason 仅在结束时允许。",
    path: ["closedReason"],
  })
  .refine((v) => v.pipelineStage === "closed" || !v.closedMeta, {
    message: "closedMeta 仅在结束时允许。",
    path: ["closedMeta"],
  })
  .refine((v) => v.pipelineStage !== "closed" || !v.reactivationReason, {
    message: "reactivationReason 仅在重新激活时允许。",
    path: ["reactivationReason"],
  })
  .refine((v) => v.pipelineStage === "human_interview" || !v.interviewQuestions, {
    message: "interviewQuestions 仅在安排真人面试时允许。",
    path: ["interviewQuestions"],
  });

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

// 删除 AI 轮次后回退 parent：若候选人已无任何 schedule entry 且仍处于
// pipeline_stage='ai_interview' / outcome='in_pipeline'，回退到 'screening'。
// 已经被推进到 human_interview/offer/closed 的候选人保持原状（HR 已显式推进）。
// After deleting rounds, roll parent back to 'screening' when no schedules remain
// and the candidate is still active in AI stage. Stages past ai_interview stay put
// because HR has already manually advanced them.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function resetOrphanedAiInterviewParents(
  tx: Tx,
  organizationId: string,
  candidateIds: readonly string[],
): Promise<void> {
  const unique = uniq(candidateIds.filter(Boolean));
  if (unique.length === 0) {
    return;
  }
  // 唯一一个 SQL，安全且无 N+1：用 NOT EXISTS 子查询过滤掉还有 schedule 的候选人。
  // Single SQL guarded by NOT EXISTS — no N+1 and won't touch candidates with surviving rounds.
  await tx
    .update(studioInterview)
    .set({ pipelineStage: "screening", updatedAt: new Date() })
    .where(
      and(
        inArray(studioInterview.id, unique),
        eq(studioInterview.organizationId, organizationId),
        eq(studioInterview.pipelineStage, "ai_interview"),
        eq(studioInterview.outcome, "in_pipeline"),
        notExists(
          tx
            .select({ one: studioInterviewSchedule.id })
            .from(studioInterviewSchedule)
            .where(eq(studioInterviewSchedule.interviewRecordId, studioInterview.id)),
        ),
      ),
    );
}

export const studioInterviewsRouter = factory
  .createApp()
  .get("/summary", requirePermission("interview", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const visibilityScope = await loadVisibilityScope(
      activeOrg.id,
      c.var.member?.role,
      c.var.user?.id,
    );
    const summary = await summarizeInterviewRoundCounts(activeOrg.id, visibilityScope);
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
        route: "studio.interviews",
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
        creatorIds: z.string().optional(),
        page: z.string().optional(),
        pageSize: z.string().optional(),
        search: z.string().optional(),
        sortBy: z.string().optional(),
        sortOrder: z.string().optional(),
        status: z.string().optional(),
        textFilters: listTextFiltersSchema("interviews"),
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
      const result = await queryPaginatedInterviewRounds(
        activeOrg.id,
        {
          creatorIds: parseCsvParam(q.creatorIds),
          search: q.search,
          status: q.status,
          textFilters: q.textFilters,
        },
        { page: q.page, pageSize: q.pageSize, sortBy: q.sortBy, sortOrder: q.sortOrder },
        visibilityScope,
      );
      return c.json(result, 200);
    },
  )
  // oxlint-disable-next-line complexity -- CRUD handler orchestrates parse → validate → persist in one flow.

  .route("/", studioInterviewCollectionRouter)
  .route("/", studioInterviewDetailRouter)
  .route("/", notificationRecipientsRouter)
  .post("/:id/reset", requirePermission("interview", "update"), async (c) => {
    // 平铺版重置：`:id` = roundId，保留绑定刷新 + 审计日志 + livekit 锚点清空。
    // Flat reset endpoint: `:id` = roundId; preserves binding refresh, audit log, and livekit anchor clearing.
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const roundId = c.req.param("id");
    const operatorId = c.var.user?.id ?? null;
    const visibilityScope = await loadVisibilityScope(
      activeOrg.id,
      c.var.member?.role,
      c.var.user?.id,
    );
    const existingRound = await loadInterviewRoundDetail(roundId, activeOrg.id, visibilityScope);
    if (!existingRound) {
      return c.json({ error: "记录不存在。" }, 404);
    }

    // 加载轮次行 + 候选人上下文。/ Load round row + candidate context.
    const [scheduleRow] = await db
      .select()
      .from(studioInterviewSchedule)
      .where(
        and(
          eq(studioInterviewSchedule.id, roundId),
          eq(studioInterviewSchedule.organizationId, activeOrg.id),
        ),
      )
      .limit(1);

    if (!scheduleRow) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const candidateId = scheduleRow.interviewRecordId;
    const [candidateRow] = await db
      .select({
        jobDescriptionId: studioInterview.jobDescriptionId,
        pipelineStage: studioInterview.pipelineStage,
      })
      .from(studioInterview)
      .where(eq(studioInterview.id, candidateId))
      .limit(1);
    if (!candidateRow) {
      return c.json({ error: "候选人记录不存在。" }, 404);
    }
    // 只要候选人仍在 AI 面试阶段，任意状态的 AI 轮次都可重置；阶段推进后禁止绕过 UI 回滚。
    // Any round status can be reset while the candidate is still in AI interview;
    // once the pipeline advances, reject bypass attempts server-side.
    if (candidateRow.pipelineStage !== "ai_interview") {
      return c.json(
        { error: "候选人已不在 AI 面试阶段，无法重置面试轮次。如需修改请先回退阶段或重新激活。" },
        409,
      );
    }

    const now = new Date();
    const previousConversationId = scheduleRow.conversationId;
    const previousStatus = scheduleRow.status;
    const resetInvitation = buildResetAiInterviewInvitation({
      currentTokenHash: scheduleRow.candidateInviteTokenHash,
      invitationVersion: scheduleRow.invitationVersion,
      now,
    });

    await db.transaction(async (tx) => {
      await tx
        .update(studioInterviewSchedule)
        .set({
          ...resetInvitation,
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

      // 重置即「以当下为准」：刷新题库模板绑定并创建新版 runtime context snapshot。
      // Reset = "snapshot to now": refresh bindings and freeze a new runtime context.
      const refreshedSnapshot = await refreshInterviewContextSnapshot(tx, {
        createdAt: now,
        createdBy: operatorId,
        interviewRecordId: candidateId,
        reason: "reset",
        scheduleEntryId: roundId,
      });

      await tx.insert(interviewAuditLog).values({
        action: "round_reset",
        createdAt: now,
        detail: {
          previousConversationId,
          previousStatus,
          roundLabel: scheduleRow.roundLabel,
          snapshotId: refreshedSnapshot.id,
          snapshotVersion: refreshedSnapshot.version,
        },
        id: crypto.randomUUID(),
        interviewRecordId: candidateId,
        operatorId,
        organizationId: activeOrg.id,
        scheduleEntryId: roundId,
      });
    });

    invalidateStudioInterviewCaches(activeOrg.id);
    safeUpdateTag(cacheTags.interviewConversations);
    const detail = await loadInterviewRoundDetail(roundId, activeOrg.id, visibilityScope);
    if (!detail) {
      return c.json({ error: "重置后的面试轮次读取失败。" }, 500);
    }
    return c.json(detail, 200);
  })
  .post(
    "/:id/transition",
    requirePermission("interview", "update"),
    zValidator("json", transitionInputSchema, jsonValidatorError("阶段流转参数无效。")),
    async (c) => {
      // 候选人阶段流转：用于「标记结束 + outcome」「重新激活」「推进到下一阶段」。
      // Candidate stage transition: covers close-with-outcome, reactivate, and stage advance.
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const candidateId = c.req.param("id");
      const operatorId = c.var.user?.id ?? null;
      const input = c.req.valid("json");
      const authorize = createRequestWorkspaceAuthorizer({
        headers: c.req.raw.headers,
        memberRole: c.var.member?.role,
        organizationId: activeOrg.id,
        userId: c.var.user?.id,
      });
      const result = await transitionCandidateStage({
        authorize,
        candidateId,
        input,
        operatorId,
        organizationId: activeOrg.id,
        provenance: { kind: "manual" },
      });

      if (result.kind === "forbidden") {
        return c.json({ message: "Forbidden" }, 403);
      }
      if (result.kind === "not_found") {
        return c.json({ error: "候选人记录不存在。" }, 404);
      }
      if (result.kind === "invalid") {
        return c.json({ error: result.message }, 400);
      }
      return c.json({ ok: true }, 200);
    },
  )
  // ── 候选人期望 PATCH ──
  // partial merge：传啥更新啥，没传的保留旧值。
  // Candidate expectations PATCH; partial merge semantics.
  .patch(
    "/:id/candidate-expectations",
    requirePermission("interview", "update"),
    zValidator(
      "json",
      candidateExpectationsMetaSchema.partial(),
      jsonValidatorError("候选人期望参数无效。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const recordId = c.req.param("id");
      const input = c.req.valid("json");
      const now = new Date();

      // 事务 + 行锁：partial merge `{...existing, ...input}` 在并发下会丢字段，
      //   两个 HR 同时改不同字段会互相覆盖。FOR UPDATE 串行化合并；事务外读会等。
      // Transaction + row lock: the partial merge would otherwise lose
      // concurrent writes (two HRs editing different fields would overwrite
      // each other). FOR UPDATE serializes merges on the same record.
      const merged = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ candidateExpectationsMeta: studioInterview.candidateExpectationsMeta })
          .from(studioInterview)
          .where(
            and(eq(studioInterview.id, recordId), eq(studioInterview.organizationId, activeOrg.id)),
          )
          .for("update")
          .limit(1);
        if (!existing) {
          return null;
        }
        const next = { ...existing.candidateExpectationsMeta, ...input };
        await tx
          .update(studioInterview)
          .set({ candidateExpectationsMeta: next, updatedAt: now })
          .where(eq(studioInterview.id, recordId));
        return next;
      });

      if (!merged) {
        return c.json({ error: "候选人记录不存在。" }, 404);
      }
      invalidateStudioInterviewCaches(activeOrg.id);
      return c.json({ candidateExpectationsMeta: merged }, 200);
    },
  )
  // ── 真人复面单轮 endpoints ──
  // 注：这里的 `:id` 是 interviewRecordId（候选人级），跟 `/:id/reset` 的 roundId 语义不同。
  // 历史遗留——下次重构时统一改成 `/:recordId/...`。
  // Note: `:id` here = interview record id (candidate-level), unlike `/:id/reset`
  // which treats `:id` as roundId. Historical mismatch; clean up next refactor.

  .route("/", studioInterviewHumanRouter)
  .delete("/:id", requirePermission("interview", "delete"), async (c) => {
    // 轮次级删除：`:id` = roundId。/ Round-level delete: `:id` = roundId.
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const roundId = c.req.param("id");
    const orgId = activeOrg.id;
    const result = await db.transaction(async (tx) => {
      // 阶段守卫：候选人已不在 AI 面试阶段时不允许删除 AI 轮次（防 UI 绕过）。
      // FOR UPDATE 串行化 parent 行，与并发 transition / launch-interview 互斥。
      // Stage guard against UI bypass; FOR UPDATE serializes against concurrent
      // transition / launch-interview on the same parent.
      const [parent] = await tx
        .select({
          pipelineStage: studioInterview.pipelineStage,
        })
        .from(studioInterviewSchedule)
        .innerJoin(
          studioInterview,
          eq(studioInterview.id, studioInterviewSchedule.interviewRecordId),
        )
        .where(
          and(
            eq(studioInterviewSchedule.id, roundId),
            eq(studioInterviewSchedule.organizationId, orgId),
          ),
        )
        .for("update", { of: studioInterview })
        .limit(1);
      if (!parent) {
        return { kind: "not_found" as const };
      }
      if (parent.pipelineStage !== "screening" && parent.pipelineStage !== "ai_interview") {
        return { kind: "locked" as const };
      }
      const removed = await tx
        .delete(studioInterviewSchedule)
        .where(
          and(
            eq(studioInterviewSchedule.id, roundId),
            eq(studioInterviewSchedule.organizationId, orgId),
          ),
        )
        .returning({
          interviewRecordId: studioInterviewSchedule.interviewRecordId,
        });
      if (removed.length === 0) {
        // 极端 race：parent 命中但 round 在 FOR UPDATE 之间被另一个事务删了。返 404。
        // Edge race: round vanished between the SELECT and DELETE; treat as not-found.
        return { kind: "not_found" as const };
      }
      await resetOrphanedAiInterviewParents(
        tx,
        orgId,
        removed.map((r) => r.interviewRecordId),
      );
      return { kind: "ok" as const };
    });
    if (result.kind === "not_found") {
      return c.json({ error: "记录不存在。" }, 404);
    }
    if (result.kind === "locked") {
      return c.json(
        {
          error: "候选人已不在 AI 面试阶段，无法删除面试轮次。如需删除请先回退阶段或重新激活。",
        },
        409,
      );
    }
    invalidateStudioInterviewCaches(orgId);
    return c.json({ success: true }, 200);
  })
  .post(
    "/bulk-delete",
    requirePermission("interview", "delete"),
    zValidator(
      "json",
      z.object({ ids: z.array(z.string()).nonempty() }),
      jsonValidatorError("缺少待删除的轮次 ID。"),
    ),
    async (c) => {
      // 批量轮次删除：ids 为 roundId 数组。/ Bulk round delete: ids are roundIds.
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { ids } = c.req.valid("json");
      const orgId = activeOrg.id;
      const result = await db.transaction(async (tx) => {
        // 联查每个 round 对应 parent 的 pipelineStage；任意一个超过 AI 阶段就拒整批，
        // 避免 partial 删除导致前端看到不一致状态。FOR UPDATE 锁 parent 行。
        // Join each round to its parent stage; reject the whole batch if any parent
        // is past AI to keep client view consistent. FOR UPDATE locks parents.
        const targets = await tx
          .select({
            pipelineStage: studioInterview.pipelineStage,
            roundId: studioInterviewSchedule.id,
          })
          .from(studioInterviewSchedule)
          .innerJoin(
            studioInterview,
            eq(studioInterview.id, studioInterviewSchedule.interviewRecordId),
          )
          .where(
            and(
              inArray(studioInterviewSchedule.id, ids),
              eq(studioInterviewSchedule.organizationId, orgId),
            ),
          )
          .for("update", { of: studioInterview });
        const locked = targets.find(
          (t) => t.pipelineStage !== "screening" && t.pipelineStage !== "ai_interview",
        );
        if (locked) {
          return { kind: "locked" as const };
        }
        const rows = await tx
          .delete(studioInterviewSchedule)
          .where(
            and(
              inArray(studioInterviewSchedule.id, ids),
              eq(studioInterviewSchedule.organizationId, orgId),
            ),
          )
          .returning({
            interviewRecordId: studioInterviewSchedule.interviewRecordId,
          });
        if (rows.length > 0) {
          await resetOrphanedAiInterviewParents(
            tx,
            orgId,
            rows.map((r) => r.interviewRecordId),
          );
        }
        return { kind: "ok" as const, removed: rows };
      });
      if (result.kind === "locked") {
        return c.json(
          {
            error: "存在已超过 AI 面试阶段的候选人，无法批量删除。请先回退阶段或拆分操作。",
          },
          409,
        );
      }
      invalidateStudioInterviewCaches(orgId);
      return c.json({ deletedCount: result.removed.length, success: true }, 200);
    },
  )
  .route("/round-emails", roundEmailsRouter);
