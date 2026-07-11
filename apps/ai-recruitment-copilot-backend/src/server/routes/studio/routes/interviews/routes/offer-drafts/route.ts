import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { studioInterview } from "@arc/db-schema/schema";
import { offerDraftInputSchema, offerResponseInputSchema } from "@arc/db-schema/studio-interviews";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import {
  getHumanInterviewOfferReadinessError,
  loadHumanInterviewRoundReadiness,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/human-interview-rounds";
import {
  cancelOfferDraft,
  createOfferDraft,
  editOfferDraft,
  listOfferDrafts,
  maybeAdvanceToOffer,
  OfferDraftError,
  respondOfferDraft,
  sendOfferDraft,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/offer-drafts";
import { recordCandidateActivity } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/utils/candidate-activity";
import { invalidateStudioInterviewCaches } from "@arc/ai-recruitment-copilot-backend/server/cache-tags";

export const offerDraftsRouter = factory
  .createApp()
  .get("/", requirePermission("offer", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const recordId = c.req.param("id");
    if (!recordId) {
      return c.json({ error: "候选人记录不存在。" }, 404);
    }
    const drafts = await listOfferDrafts(recordId, activeOrg.id);
    return c.json(drafts, 200);
  })
  .post(
    "/",
    requirePermission("offer", "create"),
    zValidator(
      "json",
      offerDraftInputSchema.extend({
        sendImmediately: z.boolean().optional(),
      }),
      jsonValidatorError("Offer 参数无效。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const recordId = c.req.param("id");
      if (!recordId) {
        return c.json({ error: "候选人记录不存在。" }, 404);
      }

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
        return c.json({ error: "已结案的候选人请先重新激活。" }, 400);
      }
      if (candidate.pipelineStage !== "human_interview" && candidate.pipelineStage !== "offer") {
        return c.json({ error: "候选人需先进入真人复面阶段，才能创建 Offer。" }, 400);
      }
      if (candidate.pipelineStage === "human_interview") {
        const readiness = await loadHumanInterviewRoundReadiness(recordId, activeOrg.id);
        const readinessError = getHumanInterviewOfferReadinessError(readiness);
        if (readinessError) {
          return c.json({ error: readinessError }, 400);
        }
      }

      const { sendImmediately, ...input } = c.req.valid("json");
      const created = await createOfferDraft({
        input,
        interviewRecordId: recordId,
        organizationId: activeOrg.id,
        sendImmediately,
      });
      await maybeAdvanceToOffer(recordId, activeOrg.id);
      await recordCandidateActivity({
        action: "offer_draft_created",
        detail: {
          draftId: created.id,
          position: created.position,
          sentImmediately: Boolean(sendImmediately),
          version: created.version,
        },
        interviewRecordId: recordId,
        operatorId: c.var.user?.id ?? null,
        organizationId: activeOrg.id,
      });
      invalidateStudioInterviewCaches(activeOrg.id);
      return c.json(created, 200);
    },
  )
  .patch(
    "/:draftId",
    requirePermission("offer", "update"),
    zValidator("json", offerDraftInputSchema.partial(), jsonValidatorError("Offer 参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const draftId = c.req.param("draftId");
      const input = c.req.valid("json");
      try {
        const updated = await editOfferDraft({ draftId, input, organizationId: activeOrg.id });
        await recordCandidateActivity({
          action: "offer_draft_updated",
          detail: {
            draftId: updated.id,
            position: updated.position,
            version: updated.version,
          },
          interviewRecordId: updated.interviewRecordId,
          operatorId: c.var.user?.id ?? null,
          organizationId: activeOrg.id,
        });
        invalidateStudioInterviewCaches(activeOrg.id);
        return c.json(updated, 200);
      } catch (error) {
        if (error instanceof OfferDraftError) {
          return c.json({ error: error.message }, error.status);
        }
        throw error;
      }
    },
  )
  .post("/:draftId/send", requirePermission("offer", "update"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const draftId = c.req.param("draftId");
    try {
      const updated = await sendOfferDraft(draftId, activeOrg.id);
      await recordCandidateActivity({
        action: "offer_draft_sent",
        detail: {
          draftId: updated.id,
          position: updated.position,
          version: updated.version,
        },
        interviewRecordId: updated.interviewRecordId,
        operatorId: c.var.user?.id ?? null,
        organizationId: activeOrg.id,
      });
      invalidateStudioInterviewCaches(activeOrg.id);
      return c.json(updated, 200);
    } catch (error) {
      if (error instanceof OfferDraftError) {
        return c.json({ error: error.message }, error.status);
      }
      throw error;
    }
  })
  .post(
    "/:draftId/respond",
    requirePermission("offer", "update"),
    zValidator("json", offerResponseInputSchema, jsonValidatorError("响应参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const draftId = c.req.param("draftId");
      const { response, candidateCounter } = c.req.valid("json");
      try {
        const updated = await respondOfferDraft({
          candidateCounter,
          draftId,
          organizationId: activeOrg.id,
          response,
        });
        await recordCandidateActivity({
          action: "offer_draft_responded",
          detail: { draftId: updated.id, response, version: updated.version },
          interviewRecordId: updated.interviewRecordId,
          operatorId: c.var.user?.id ?? null,
          organizationId: activeOrg.id,
        });
        invalidateStudioInterviewCaches(activeOrg.id);
        return c.json(updated, 200);
      } catch (error) {
        if (error instanceof OfferDraftError) {
          return c.json({ error: error.message }, error.status);
        }
        throw error;
      }
    },
  )
  .post("/:draftId/cancel", requirePermission("offer", "delete"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const draftId = c.req.param("draftId");
    try {
      const updated = await cancelOfferDraft(draftId, activeOrg.id);
      await recordCandidateActivity({
        action: "offer_draft_cancelled",
        detail: {
          draftId: updated.id,
          position: updated.position,
          version: updated.version,
        },
        interviewRecordId: updated.interviewRecordId,
        operatorId: c.var.user?.id ?? null,
        organizationId: activeOrg.id,
      });
      invalidateStudioInterviewCaches(activeOrg.id);
      return c.json(updated, 200);
    } catch (error) {
      if (error instanceof OfferDraftError) {
        return c.json({ error: error.message }, error.status);
      }
      throw error;
    }
  });
