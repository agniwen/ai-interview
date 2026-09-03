import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../../../../../lib/server/db/index";
import { studioInterview } from "@app/db-schema/schema";
import { offerDraftInputSchema, offerResponseInputSchema } from "@app/db-schema/studio-interviews";
import { factory, jsonValidatorError } from "../../../../../../factory";
import { requirePermission } from "../../../../../../middlewares/permission";
import {
  getHumanInterviewOfferReadinessError,
  loadHumanInterviewRoundReadiness,
} from "../../dao/human-interview-rounds";
import {
  cancelOfferDraft,
  createOfferDraft,
  editOfferDraft,
  listOfferDrafts,
  maybeAdvanceToOffer,
  OfferDraftError,
  respondOfferDraft,
  sendOfferDraft,
} from "../../dao/offer-drafts";
import { recordCandidateActivity } from "../../utils/candidate-activity";
import { invalidateStudioInterviewCaches } from "../../../../../../cache-tags";

async function loadOfferCandidate(
  recordId: string,
  organizationId: string,
): Promise<Pick<typeof studioInterview.$inferSelect, "id" | "pipelineStage"> | null> {
  const [candidate] = await db
    .select({ id: studioInterview.id, pipelineStage: studioInterview.pipelineStage })
    .from(studioInterview)
    .where(
      and(eq(studioInterview.id, recordId), eq(studioInterview.organizationId, organizationId)),
    )
    .limit(1);
  return candidate ?? null;
}

type OfferPermissionAction = "create" | "delete" | "read" | "update";

export interface OfferDraftsRouteDependencies {
  cancelOfferDraft: typeof cancelOfferDraft;
  createOfferDraft: typeof createOfferDraft;
  editOfferDraft: typeof editOfferDraft;
  getHumanInterviewOfferReadinessError: typeof getHumanInterviewOfferReadinessError;
  invalidateStudioInterviewCaches: typeof invalidateStudioInterviewCaches;
  listOfferDrafts: typeof listOfferDrafts;
  loadHumanInterviewRoundReadiness: typeof loadHumanInterviewRoundReadiness;
  loadOfferCandidate: typeof loadOfferCandidate;
  maybeAdvanceToOffer: typeof maybeAdvanceToOffer;
  recordCandidateActivity: typeof recordCandidateActivity;
  requireOfferPermission: (
    action: OfferPermissionAction,
  ) => ReturnType<typeof requirePermission<"offer">>;
  respondOfferDraft: typeof respondOfferDraft;
  sendOfferDraft: typeof sendOfferDraft;
}

const defaultDependencies: OfferDraftsRouteDependencies = {
  cancelOfferDraft,
  createOfferDraft,
  editOfferDraft,
  getHumanInterviewOfferReadinessError,
  invalidateStudioInterviewCaches,
  listOfferDrafts,
  loadHumanInterviewRoundReadiness,
  loadOfferCandidate,
  maybeAdvanceToOffer,
  recordCandidateActivity,
  requireOfferPermission: (action) => requirePermission("offer", action),
  respondOfferDraft,
  sendOfferDraft,
};

export function createOfferDraftsRouter(
  dependencies: OfferDraftsRouteDependencies = defaultDependencies,
) {
  return factory
    .createApp()
    .get("/", dependencies.requireOfferPermission("read"), async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const recordId = c.req.param("id");
      if (!recordId) {
        return c.json({ error: "候选人记录不存在。" }, 404);
      }
      const drafts = await dependencies.listOfferDrafts(recordId, activeOrg.id);
      return c.json(drafts, 200);
    })
    .post(
      "/",
      dependencies.requireOfferPermission("create"),
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

        const candidate = await dependencies.loadOfferCandidate(recordId, activeOrg.id);
        if (!candidate) {
          return c.json({ error: "候选人记录不存在。" }, 404);
        }
        if (candidate.pipelineStage === "closed") {
          return c.json({ error: "已结束的候选人请先重新激活。" }, 400);
        }
        if (candidate.pipelineStage !== "human_interview" && candidate.pipelineStage !== "offer") {
          return c.json({ error: "候选人需先进入真人复面阶段，才能创建 Offer。" }, 400);
        }
        if (candidate.pipelineStage === "human_interview") {
          const readiness = await dependencies.loadHumanInterviewRoundReadiness(
            recordId,
            activeOrg.id,
          );
          const readinessError = dependencies.getHumanInterviewOfferReadinessError(readiness);
          if (readinessError) {
            return c.json({ error: readinessError }, 400);
          }
        }

        const { sendImmediately, ...input } = c.req.valid("json");
        const created = await dependencies.createOfferDraft({
          input,
          interviewRecordId: recordId,
          organizationId: activeOrg.id,
          sendImmediately,
        });
        await dependencies.maybeAdvanceToOffer(recordId, activeOrg.id);
        await dependencies.recordCandidateActivity({
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
        dependencies.invalidateStudioInterviewCaches(activeOrg.id);
        return c.json(created, 200);
      },
    )
    .patch(
      "/:draftId",
      dependencies.requireOfferPermission("update"),
      zValidator("json", offerDraftInputSchema.partial(), jsonValidatorError("Offer 参数无效。")),
      async (c) => {
        const { activeOrg } = c.var;
        if (!activeOrg) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const draftId = c.req.param("draftId");
        const input = c.req.valid("json");
        try {
          const updated = await dependencies.editOfferDraft({
            draftId,
            input,
            organizationId: activeOrg.id,
          });
          await dependencies.recordCandidateActivity({
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
          dependencies.invalidateStudioInterviewCaches(activeOrg.id);
          return c.json(updated, 200);
        } catch (error) {
          if (error instanceof OfferDraftError) {
            return c.json({ error: error.message }, error.status);
          }
          throw error;
        }
      },
    )
    .post("/:draftId/send", dependencies.requireOfferPermission("update"), async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const draftId = c.req.param("draftId");
      try {
        const updated = await dependencies.sendOfferDraft(draftId, activeOrg.id);
        await dependencies.recordCandidateActivity({
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
        dependencies.invalidateStudioInterviewCaches(activeOrg.id);
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
      dependencies.requireOfferPermission("update"),
      zValidator("json", offerResponseInputSchema, jsonValidatorError("响应参数无效。")),
      async (c) => {
        const { activeOrg } = c.var;
        if (!activeOrg) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const draftId = c.req.param("draftId");
        const { response, candidateCounter } = c.req.valid("json");
        try {
          const updated = await dependencies.respondOfferDraft({
            candidateCounter,
            draftId,
            organizationId: activeOrg.id,
            response,
          });
          await dependencies.recordCandidateActivity({
            action: "offer_draft_responded",
            detail: { draftId: updated.id, response, version: updated.version },
            interviewRecordId: updated.interviewRecordId,
            operatorId: c.var.user?.id ?? null,
            organizationId: activeOrg.id,
          });
          dependencies.invalidateStudioInterviewCaches(activeOrg.id);
          return c.json(updated, 200);
        } catch (error) {
          if (error instanceof OfferDraftError) {
            return c.json({ error: error.message }, error.status);
          }
          throw error;
        }
      },
    )
    .post("/:draftId/cancel", dependencies.requireOfferPermission("delete"), async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const draftId = c.req.param("draftId");
      try {
        const updated = await dependencies.cancelOfferDraft(draftId, activeOrg.id);
        await dependencies.recordCandidateActivity({
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
        dependencies.invalidateStudioInterviewCaches(activeOrg.id);
        return c.json(updated, 200);
      } catch (error) {
        if (error instanceof OfferDraftError) {
          return c.json({ error: error.message }, error.status);
        }
        throw error;
      }
    });
}

export const offerDraftsRouter = createOfferDraftsRouter();
