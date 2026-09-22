import { OfferApprovalError } from "../../../offer-approvals/dao";
import { getOfferApprovalPolicy } from "../../../offer-approvals/application/templates";
import type { RecruitingRecordRead } from "@app/database/recruiting-read-model";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { db } from "../../../../../../../lib/server/db/index";
import { EMAIL_ATTACHMENT_MAX_TOTAL_BYTES } from "@app/shared/email-attachments";

import {
  offerDraftInputSchema,
  offerEmailInputSchema,
  offerResponseInputSchema,
} from "@app/db-schema/studio-interviews";
import { factory, jsonValidatorError } from "../../../../../../factory";
import { requirePermission } from "../../../../../../middlewares/permission";
import {
  getHumanInterviewOfferReadinessError,
  loadHumanInterviewRoundReadiness,
} from "../../dao/human-interview-rounds";
import {
  deleteOfferDraft,
  createOfferDraft,
  editOfferDraft,
  listOfferDrafts,
  maybeAdvanceToOffer,
  OfferDraftError,
  respondOfferDraft,
  sendOfferDraft,
} from "../../dao/offer-drafts";
import {
  getOfferEmailPreview,
  resolveOfferPublicUrl,
  sendOfferEmail,
} from "../../dao/offer-delivery";
import { recordCandidateActivity } from "../../utils/candidate-activity";
import { invalidateStudioInterviewCaches } from "../../../../../../cache-tags";

async function loadOfferCandidate(
  recordId: string,
  organizationId: string,
): Promise<Pick<RecruitingRecordRead, "id" | "pipelineStage"> | null> {
  const [candidate] = await db
    .select({
      id: recruitingRecordReadModel.id,
      pipelineStage: recruitingRecordReadModel.pipelineStage,
    })
    .from(recruitingRecordReadModel)
    .where(
      and(
        eq(recruitingRecordReadModel.id, recordId),
        eq(recruitingRecordReadModel.organizationId, organizationId),
      ),
    )
    .limit(1);
  return candidate ?? null;
}

type OfferPermissionAction = "create" | "delete" | "read" | "update";

const OFFER_EMAIL_REQUEST_MAX_BYTES = EMAIL_ATTACHMENT_MAX_TOTAL_BYTES + 256 * 1024;

export async function parseOfferEmailRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let attachments: File[] = [];
  let parsed: ReturnType<typeof offerEmailInputSchema.safeParse>;

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const rawAttachments = formData.getAll("attachments");
    if (rawAttachments.some((attachment) => !(attachment instanceof File))) {
      throw new OfferDraftError("邮件附件无效。", 400);
    }
    attachments = rawAttachments.filter(
      (attachment): attachment is File => attachment instanceof File,
    );
    parsed = offerEmailInputSchema.safeParse({
      content: formData.get("content"),
      subject: formData.get("subject"),
      to: formData.get("to"),
    });
  } else if (contentType.includes("application/json")) {
    parsed = offerEmailInputSchema.safeParse(await request.json());
  } else {
    throw new OfferDraftError("邮件参数无效。", 400);
  }

  if (!parsed.success) {
    throw new OfferDraftError("邮件参数无效。", 400);
  }
  return { attachments, input: parsed.data };
}

export interface OfferDraftsRouteDependencies {
  deleteOfferDraft: typeof deleteOfferDraft;
  createOfferDraft: typeof createOfferDraft;
  editOfferDraft: typeof editOfferDraft;
  getHumanInterviewOfferReadinessError: typeof getHumanInterviewOfferReadinessError;
  getOfferEmailPreview: typeof getOfferEmailPreview;
  getOfferApprovalPolicy: typeof getOfferApprovalPolicy;
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
  sendOfferEmail: typeof sendOfferEmail;
}

const defaultDependencies: OfferDraftsRouteDependencies = {
  createOfferDraft,
  deleteOfferDraft,
  editOfferDraft,
  getHumanInterviewOfferReadinessError,
  getOfferApprovalPolicy,
  getOfferEmailPreview,
  invalidateStudioInterviewCaches,
  listOfferDrafts,
  loadHumanInterviewRoundReadiness,
  loadOfferCandidate,
  maybeAdvanceToOffer,
  recordCandidateActivity,
  requireOfferPermission: (action) => requirePermission("offer", action),
  respondOfferDraft,
  sendOfferDraft,
  sendOfferEmail,
};

export function createOfferDraftsRouter(
  dependencies: OfferDraftsRouteDependencies = defaultDependencies,
) {
  return (
    factory
      .createApp()
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Map business conflicts for every Offer mutation.
      .onError((error, c) => {
        if (error instanceof OfferDraftError || error instanceof OfferApprovalError) {
          return c.json({ error: error.message }, error.status);
        }
        throw error;
      })
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
      .get("/approval-policy", dependencies.requireOfferPermission("read"), async (c) => {
        const { activeOrg } = c.var;
        if (!activeOrg) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        return c.json(await dependencies.getOfferApprovalPolicy(db, activeOrg.id), 200);
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
          if (candidate.pipelineStage !== "offer") {
            return c.json({ error: "请先完成谈薪并进入发 Offer 节点。" }, 400);
          }

          const { sendImmediately, ...input } = c.req.valid("json");
          const created = await dependencies.createOfferDraft({
            input,
            interviewRecordId: recordId,
            operatorId: c.var.user?.id ?? null,
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
          if (sendImmediately) {
            await dependencies.recordCandidateActivity({
              action: "offer_published",
              detail: { draftId: created.id, position: created.position, version: created.version },
              interviewRecordId: recordId,
              operatorId: c.var.user?.id ?? null,
              organizationId: activeOrg.id,
            });
          }
          dependencies.invalidateStudioInterviewCaches(activeOrg.id);
          return c.json(created, 200);
        },
      )
      .patch(
        "/:draftId",
        dependencies.requireOfferPermission("update"),
        zValidator(
          "json",
          offerDraftInputSchema.partial().extend({
            expectedContentRevision: z.number().int().positive(),
            invalidateApproval: z.boolean().optional(),
          }),
          jsonValidatorError("Offer 参数无效。"),
        ),
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
              operatorId: c.var.user?.id ?? null,
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
            if (error instanceof OfferDraftError || error instanceof OfferApprovalError) {
              return c.json({ error: error.message }, error.status);
            }
            throw error;
          }
        },
      )
      .post("/:draftId/void", dependencies.requireOfferPermission("delete"), async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ error: "Unauthorized" }, 401);
        }
        const result = await dependencies.deleteOfferDraft(c.req.param("draftId"), activeOrg.id, {
          operatorId: user.id,
          voidWithHistory: true,
        });
        dependencies.invalidateStudioInterviewCaches(activeOrg.id);
        return c.json(result, 200);
      })
      .post("/:draftId/publish", dependencies.requireOfferPermission("update"), async (c) => {
        const { activeOrg } = c.var;
        if (!activeOrg) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const draftId = c.req.param("draftId");
        try {
          const updated = await dependencies.sendOfferDraft(
            draftId,
            activeOrg.id,
            c.var.user?.id ?? null,
          );
          await dependencies.recordCandidateActivity({
            action: "offer_published",
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
          if (error instanceof OfferDraftError || error instanceof OfferApprovalError) {
            return c.json({ error: error.message }, error.status);
          }
          throw error;
        }
      })
      .post("/:draftId/link", dependencies.requireOfferPermission("read"), async (c) => {
        const { activeOrg } = c.var;
        if (!activeOrg) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const result = await resolveOfferPublicUrl(c.req.param("draftId"), activeOrg.id);
        await dependencies.recordCandidateActivity({
          action: "offer_link_copied",
          detail: { draftId: c.req.param("draftId") },
          interviewRecordId: result.interviewRecordId,
          operatorId: c.var.user?.id ?? null,
          organizationId: activeOrg.id,
        });
        return c.json({ url: result.url }, 200);
      })
      .get("/:draftId/email-preview", dependencies.requireOfferPermission("read"), async (c) => {
        const { activeOrg } = c.var;
        if (!activeOrg) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const preview = await dependencies.getOfferEmailPreview(
          c.req.param("draftId"),
          activeOrg.id,
        );
        return c.json(preview, 200);
      })
      .post(
        "/:draftId/email",
        dependencies.requireOfferPermission("update"),
        bodyLimit({
          maxSize: OFFER_EMAIL_REQUEST_MAX_BYTES,
          onError: (c) => c.json({ error: "附件总大小不能超过 20 MB" }, 413),
        }),
        async (c) => {
          const { activeOrg } = c.var;
          if (!activeOrg) {
            return c.json({ message: "Unauthorized" }, 401);
          }
          const draftId = c.req.param("draftId");
          const { attachments, input } = await parseOfferEmailRequest(c.req.raw);
          const link = await resolveOfferPublicUrl(draftId, activeOrg.id);
          await dependencies.recordCandidateActivity({
            action: "offer_email_send_requested",
            detail: { attachmentCount: attachments.length, draftId, to: input.to },
            interviewRecordId: link.interviewRecordId,
            operatorId: c.var.user?.id ?? null,
            organizationId: activeOrg.id,
          });
          try {
            const result = await dependencies.sendOfferEmail(
              draftId,
              activeOrg.id,
              input,
              attachments,
            );
            await dependencies.recordCandidateActivity({
              action: "offer_email_sent",
              detail: {
                attachmentCount: attachments.length,
                draftId,
                providerMessageId: result.providerMessageId,
                to: input.to,
              },
              interviewRecordId: result.interviewRecordId,
              operatorId: c.var.user?.id ?? null,
              organizationId: activeOrg.id,
            });
            dependencies.invalidateStudioInterviewCaches(activeOrg.id);
            return c.json(result, 200);
          } catch (error) {
            await dependencies.recordCandidateActivity({
              action: "offer_email_send_failed",
              detail: {
                attachmentCount: attachments.length,
                draftId,
                error: error instanceof Error ? error.message : "邮件发送失败",
                to: input.to,
              },
              interviewRecordId: link.interviewRecordId,
              operatorId: c.var.user?.id ?? null,
              organizationId: activeOrg.id,
            });
            throw error;
          }
        },
      )
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
          const { response, candidateCounter, declineReason } = c.req.valid("json");
          try {
            const updated = await dependencies.respondOfferDraft({
              candidateCounter,
              declineReason,
              draftId,
              organizationId: activeOrg.id,
              response,
              responseBy: c.var.user?.id ?? null,
              responseSource: "hr",
            });
            await dependencies.recordCandidateActivity({
              action: "offer_response_recorded_by_hr",
              detail: { declineReason, draftId: updated.id, response, version: updated.version },
              interviewRecordId: updated.interviewRecordId,
              operatorId: c.var.user?.id ?? null,
              organizationId: activeOrg.id,
            });
            dependencies.invalidateStudioInterviewCaches(activeOrg.id);
            return c.json(updated, 200);
          } catch (error) {
            if (error instanceof OfferDraftError || error instanceof OfferApprovalError) {
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
          const updated = await dependencies.deleteOfferDraft(draftId, activeOrg.id);
          await dependencies.recordCandidateActivity({
            action: "offer_draft_deleted",
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
          if (error instanceof OfferDraftError || error instanceof OfferApprovalError) {
            return c.json({ error: error.message }, error.status);
          }
          throw error;
        }
      })
  );
}

export const offerDraftsRouter = createOfferDraftsRouter();
