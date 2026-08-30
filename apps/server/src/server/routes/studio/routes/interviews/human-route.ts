import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@app/server/lib/server/db";
import { studioInterview } from "@arc/db-schema/schema";
import {
  humanInterviewRoundInputSchema,
  nullableInstantDateTimeInputSchema,
  humanInterviewRoundOutcomeSchema,
} from "@arc/db-schema/studio-interviews";
import { factory, jsonValidatorError } from "@app/server/server/factory";
import {
  cancelHumanInterviewRoundWithMeetings,
  completeHumanInterviewRound,
  createHumanInterviewRound,
  editHumanInterviewRound,
  EditRoundError,
  listHumanInterviewRounds,
  maybeAdvanceToHumanInterview,
} from "@app/server/server/routes/studio/routes/interviews/dao/human-interview-rounds";
import { endHumanInterviewMeetingsByRound } from "@app/server/server/routes/studio/routes/interviews/dao/human-interview-meetings";
import {
  deleteHumanInterviewLiveKitRoom,
  HumanInterviewLiveKitConfigError,
} from "@app/server/server/routes/studio/routes/interviews/utils/human-interview-livekit";
import { offerDraftsRouter } from "@app/server/server/routes/studio/routes/interviews/routes/offer-drafts/route";
import { recordCandidateActivity } from "@app/server/server/routes/studio/routes/interviews/utils/candidate-activity";
import { requirePermission } from "@app/server/server/middlewares/permission";
import { invalidateStudioInterviewCaches } from "@app/server/server/cache-tags";
import { humanInterviewFeedbackSchema } from "./utils/human-interview-readiness";

// 候选人阶段流转输入。强制 outcome 与 pipelineStage 的不变量：
//   pipelineStage='closed' ⇔ outcome ∈ {hired,rejected,withdrawn,archived}
// 其余阶段下 outcome 必须省略或为 in_pipeline；closedReason 仅 closed 阶段允许。
//
// Candidate stage transition input. Encodes the (pipelineStage, outcome)
// invariant: closed ⇔ a terminal outcome; everything else stays in_pipeline.

// 真人复面：「标记完成」的 input。outcome / feedback 必填，score 可选。
// Human interview "mark complete" input. Outcome required.
const completeHumanRoundSchema = z.object({
  feedback: humanInterviewFeedbackSchema,
  outcome: humanInterviewRoundOutcomeSchema,
  score: z.number().int().min(0).max(100).nullable().optional(),
});

// 真人复面：「取消」的 input。reason 可选，便于后续审计 / 通知候选人。
// Human interview "cancel" input; reason optional.
const cancelHumanRoundSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional(),
});

export const studioInterviewHumanRouter = factory
  .createApp()
  .get("/:id/human-interview-rounds", requirePermission("humanInterview", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const recordId = c.req.param("id");
    const rounds = await listHumanInterviewRounds(recordId, activeOrg.id);
    return c.json(rounds, 200);
  })
  .post(
    "/:id/human-interview-rounds",
    requirePermission("humanInterview", "create"),
    zValidator(
      "json",
      humanInterviewRoundInputSchema,
      jsonValidatorError("真人复面轮次参数无效。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const recordId = c.req.param("id");

      // 候选人必须存在、归属当前组织、且未结束（已结束需先重新激活）。
      // Candidate must exist, belong to active org, and not be closed.
      const [candidate] = await db
        .select({ id: studioInterview.id, pipelineStage: studioInterview.pipelineStage })
        .from(studioInterview)
        .where(
          and(eq(studioInterview.id, recordId), eq(studioInterview.organizationId, activeOrg.id)),
        )
        .limit(1);
      if (!candidate) {
        return c.json({ error: "候选人记录不存在。" }, 404);
      }
      if (candidate.pipelineStage === "closed") {
        return c.json({ error: "已结束的候选人请先重新激活。" }, 400);
      }
      if (candidate.pipelineStage === "offer") {
        return c.json({ error: "候选人已进入 Offer 阶段，不能再创建真人面试轮次。" }, 400);
      }

      try {
        const input = c.req.valid("json");
        const created = await createHumanInterviewRound({
          input: {
            ...input,
            format: "online",
            location: null,
            meetingUrl: null,
          },
          interviewRecordId: recordId,
          organizationId: activeOrg.id,
        });
        // 创建第一轮时自动把 pipelineStage 推进到 human_interview（screening/ai_interview 等才推）。
        // Auto-advance pipelineStage when the first round goes in.
        await maybeAdvanceToHumanInterview(recordId, activeOrg.id);
        await recordCandidateActivity({
          action: "human_interview_round_created",
          detail: {
            roundId: created.id,
            roundLabel: created.label,
            scheduledAt: created.scheduledAt,
          },
          interviewRecordId: recordId,
          operatorId: c.var.user?.id ?? null,
          organizationId: activeOrg.id,
        });
        invalidateStudioInterviewCaches(activeOrg.id);
        return c.json(created, 200);
      } catch (error) {
        if (error instanceof EditRoundError) {
          return c.json({ error: error.message }, error.status);
        }
        throw error;
      }
    },
  )
  .patch(
    "/:id/human-interview-rounds/:roundId",
    requirePermission("humanInterview", "update"),
    zValidator(
      "json",
      humanInterviewRoundInputSchema
        .partial()
        .extend({ validUntil: nullableInstantDateTimeInputSchema }),
      jsonValidatorError("真人复面轮次参数无效。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const roundId = c.req.param("roundId");
      const input = c.req.valid("json");
      try {
        const updated = await editHumanInterviewRound({
          input,
          organizationId: activeOrg.id,
          roundId,
        });
        await recordCandidateActivity({
          action: "human_interview_round_updated",
          detail: {
            roundId: updated.id,
            roundLabel: updated.label,
            scheduledAt: updated.scheduledAt,
          },
          interviewRecordId: updated.interviewRecordId,
          operatorId: c.var.user?.id ?? null,
          organizationId: activeOrg.id,
        });
        invalidateStudioInterviewCaches(activeOrg.id);
        return c.json(updated, 200);
      } catch (error) {
        if (error instanceof EditRoundError) {
          return c.json({ error: error.message }, error.status);
        }
        throw error;
      }
    },
  )
  .post(
    "/:id/human-interview-rounds/:roundId/complete",
    requirePermission("humanInterview", "update"),
    zValidator("json", completeHumanRoundSchema, jsonValidatorError("标记完成参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const roundId = c.req.param("roundId");
      const { outcome, score, feedback } = c.req.valid("json");
      try {
        const updated = await completeHumanInterviewRound({
          actorUserId: c.var.user?.id ?? null,
          feedback,
          organizationId: activeOrg.id,
          outcome,
          roundId,
          score,
        });
        await recordCandidateActivity({
          action: "human_interview_round_completed",
          detail: {
            outcome: updated.outcome,
            roundId: updated.id,
            roundLabel: updated.label,
            score: updated.score,
          },
          interviewRecordId: updated.interviewRecordId,
          operatorId: c.var.user?.id ?? null,
          organizationId: activeOrg.id,
        });
        const roomNames = await endHumanInterviewMeetingsByRound({
          organizationId: activeOrg.id,
          roundId,
        });
        await Promise.all(
          roomNames.map(async (roomName) => {
            try {
              await deleteHumanInterviewLiveKitRoom(roomName);
            } catch (error) {
              if (!(error instanceof HumanInterviewLiveKitConfigError)) {
                console.warn("failed to delete livekit human interview room", error);
              }
            }
          }),
        );
        invalidateStudioInterviewCaches(activeOrg.id);
        return c.json(updated, 200);
      } catch (error) {
        if (error instanceof EditRoundError) {
          return c.json({ error: error.message }, error.status);
        }
        throw error;
      }
    },
  )
  .post(
    "/:id/human-interview-rounds/:roundId/cancel",
    requirePermission("humanInterview", "delete"),
    zValidator("json", cancelHumanRoundSchema, jsonValidatorError("取消参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const roundId = c.req.param("roundId");
      const { reason } = c.req.valid("json");
      try {
        const { deletedLiveKitRoomNames, round: updated } =
          await cancelHumanInterviewRoundWithMeetings({
            actorUserId: c.var.user?.id ?? null,
            organizationId: activeOrg.id,
            reason,
            roundId,
          });
        await recordCandidateActivity({
          action: "human_interview_round_cancelled",
          detail: {
            reason,
            roundId: updated.id,
            roundLabel: updated.label,
          },
          interviewRecordId: updated.interviewRecordId,
          operatorId: c.var.user?.id ?? null,
          organizationId: activeOrg.id,
        });
        for (const roomName of deletedLiveKitRoomNames) {
          try {
            await deleteHumanInterviewLiveKitRoom(roomName);
          } catch (error) {
            if (!(error instanceof HumanInterviewLiveKitConfigError)) {
              console.warn("failed to delete livekit human interview room", error);
            }
          }
        }
        invalidateStudioInterviewCaches(activeOrg.id);
        return c.json(updated, 200);
      } catch (error) {
        if (error instanceof EditRoundError) {
          return c.json({ error: error.message }, error.status);
        }
        throw error;
      }
    },
  )
  .route("/:id/offer-drafts", offerDraftsRouter);
