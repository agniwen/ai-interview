import {
  reopenRecruitingRecordTx,
  updateRecruitingNodeTx,
} from "@app/database/recruiting-pipeline";
import { deleteAiRounds, lockAiRound } from "./dao/ai-round-lifecycle";
import { lockRecruitingRecord, updateRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { listTextFiltersSchema } from "@app/shared/list-text-filters";
import { zValidator } from "@hono/zod-validator";
import { studioInterviewCollectionRouter } from "./collection-route";
import { studioInterviewDetailRouter } from "./detail-route";
import { studioInterviewHumanRouter } from "./human-route";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ResumeProfile } from "@app/db-schema/interview/types";
import { createRequestWorkspaceAuthorizer } from "../../../../access/workspace-access-policy";
import { db } from "../../../../../lib/server/db/index";
import { recruitingEvent, aiInterviewRound } from "@app/db-schema/schema";
import { resolveRecruitingVisibilityScope } from "../../../../access/recruiting-visibility";
import type { RecruitingVisibilityScope } from "../../../../access/recruiting-visibility";
import { parseCsvParam } from "@app/shared/csv";
import { candidateExpectationsMetaSchema } from "@app/db-schema/studio-interviews";
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
import { candidateTransitionInputSchema } from "./utils/candidate-transition";
import { buildResetAiInterviewInvitation } from "./dao/ai-interview-invitation-access";

const dedupCheckInputSchema = z.object({
  email: z.string().trim().max(200).nullable().optional(),
  name: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  resumeProfile: z.custom<ResumeProfile>().nullable().optional(),
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
      .from(aiInterviewRound)
      .where(
        and(eq(aiInterviewRound.id, roundId), eq(aiInterviewRound.organizationId, activeOrg.id)),
      )
      .limit(1);

    if (!scheduleRow) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const candidateId = scheduleRow.recruitingRecordId;
    const [candidateRow] = await db
      .select({
        jobDescriptionId: recruitingRecordReadModel.jobDescriptionId,
        pipelineStage: recruitingRecordReadModel.pipelineStage,
      })
      .from(recruitingRecordReadModel)
      .where(eq(recruitingRecordReadModel.id, candidateId))
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

    await db.transaction(async (tx) => {
      const locked = await lockAiRound(tx, roundId, activeOrg.id);
      if (!locked || locked.record.currentStage !== "ai_interview") {
        throw new Error("候选人已不在 AI 面试阶段，无法重置面试轮次。");
      }
      const resetInvitation = buildResetAiInterviewInvitation({
        currentTokenHash: locked.round.candidateInviteTokenHash,
        invitationVersion: locked.round.invitationVersion,
        now,
      });
      await reopenRecruitingRecordTx(tx, {
        now,
        operatorId,
        organizationId: activeOrg.id,
        reason: "重置 AI 面试轮次",
        recordId: candidateId,
        targetNode: "ai_interview",
      });
      await tx
        .update(aiInterviewRound)
        .set({
          ...resetInvitation,
          conversationId: null,
          // 重置时一并清空热重连锚点，避免下一轮复用旧房间名/identity。
          // Clear hot-reconnect anchors so the next attempt mints a fresh room.
          disconnectedAt: null,
          liveKitParticipantIdentity: null,
          liveKitRoomName: null,
          reviewNotes: null,
          reviewOutcome: null,
          reviewedAt: null,
          reviewedBy: null,
          sessionStartedAt: null,
          status: "pending",
          updatedAt: now,
        })
        .where(eq(aiInterviewRound.id, roundId));

      await updateRecruitingNodeTx(tx, {
        effectiveAiRoundId: roundId,
        node: "ai_interview",
        now,
        operatorId,
        organizationId: activeOrg.id,
        recordId: candidateId,
        status: "scheduled",
      });

      // 重置即「以当下为准」：刷新题库模板绑定并创建新版 runtime context snapshot。
      // Reset = "snapshot to now": refresh bindings and freeze a new runtime context.
      const refreshedSnapshot = await refreshInterviewContextSnapshot(tx, {
        createdAt: now,
        createdBy: operatorId,
        interviewRecordId: candidateId,
        reason: "reset",
        scheduleEntryId: roundId,
      });

      await tx.insert(recruitingEvent).values({
        action: "round_reset",
        aiRoundId: roundId,
        createdAt: now,
        detail: {
          previousConversationId,
          previousStatus,
          roundLabel: scheduleRow.roundLabel,
          snapshotId: refreshedSnapshot.id,
          snapshotVersion: refreshedSnapshot.version,
        },
        id: crypto.randomUUID(),
        operatorId,
        organizationId: activeOrg.id,
        recruitingRecordId: candidateId,
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
    zValidator("json", candidateTransitionInputSchema, jsonValidatorError("阶段流转参数无效。")),
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
      if (result.kind === "conflict") {
        return c.json({ error: result.message }, 409);
      }
      if (result.kind === "invalid") {
        return c.json({ error: result.message }, 400);
      }
      return c.json(
        {
          currentStage: result.currentStage,
          ok: true,
          outcome: result.outcome,
          version: result.version,
        },
        200,
      );
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
        if (!(await lockRecruitingRecord(tx, recordId, activeOrg.id))) {
          return null;
        }
        const [existing] = await tx
          .select({
            candidateExpectationsMeta: recruitingRecordReadModel.candidateExpectationsMeta,
          })
          .from(recruitingRecordReadModel)
          .where(
            and(
              eq(recruitingRecordReadModel.id, recordId),
              eq(recruitingRecordReadModel.organizationId, activeOrg.id),
            ),
          )
          .limit(1);
        if (!existing) {
          return null;
        }
        const next = { ...existing.candidateExpectationsMeta, ...input };
        await updateRecruitingRecords(tx, eq(recruitingRecordReadModel.id, recordId), {
          candidateExpectationsMeta: next,
          updatedAt: now,
        });
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
    const result = await db.transaction((tx) =>
      deleteAiRounds(tx, [roundId], orgId, c.var.user?.id ?? null),
    );
    if (result.kind === "ok" && !result.removed.length) {
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
      const result = await db.transaction((tx) =>
        deleteAiRounds(tx, ids, orgId, c.var.user?.id ?? null),
      );
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
