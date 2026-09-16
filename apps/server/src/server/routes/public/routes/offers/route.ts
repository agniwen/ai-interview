import { isOfferExpired, offerExpiryEndOfDay } from "@app/shared/offer-expiry";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import {
  globalConfig,
  organization,
  recruitingEvent,
  recruitingOffer,
} from "@app/db-schema/schema";
import type { PublicOfferRecord } from "@app/shared/studio-pipeline-stages";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../../../lib/server/db/index";
import { enqueueOfferResponseEvent } from "../../../../interview-notifications/utils/events";
import { factory, jsonValidatorError } from "../../../../factory";
import {
  OfferDraftError,
  respondOfferDraft,
} from "../../../studio/routes/interviews/dao/offer-drafts";

const responseSchema = z.object({
  declineReason: z.string().trim().max(1000).nullable().optional(),
  response: z.enum(["accepted", "declined"]),
});

async function loadPublicOffer(token: string) {
  const [row] = await db
    .select({
      baseSalary: recruitingOffer.baseSalary,
      bonus: recruitingOffer.bonus,
      candidateName: recruitingRecordReadModel.candidateName,
      companyName: globalConfig.companyName,
      currency: recruitingOffer.currency,
      declineReason: recruitingOffer.declineReason,
      equity: recruitingOffer.equity,
      expiresAt: recruitingOffer.expiresAt,
      id: recruitingOffer.id,
      joiningDate: recruitingOffer.joiningDate,
      organizationId: recruitingOffer.organizationId,
      organizationName: organization.name,
      position: recruitingOffer.position,
      publishedAt: recruitingOffer.publishedAt,
      recruitingRecordId: recruitingOffer.recruitingRecordId,
      responseAt: recruitingOffer.responseAt,
      status: recruitingOffer.status,
    })
    .from(recruitingOffer)
    .innerJoin(
      recruitingRecordReadModel,
      and(
        eq(recruitingRecordReadModel.id, recruitingOffer.recruitingRecordId),
        eq(recruitingRecordReadModel.organizationId, recruitingOffer.organizationId),
      ),
    )
    .innerJoin(organization, eq(organization.id, recruitingOffer.organizationId))
    .leftJoin(globalConfig, eq(globalConfig.organizationId, recruitingOffer.organizationId))
    .where(eq(recruitingOffer.publicToken, token))
    .limit(1);
  return row ?? null;
}

function toPublicRecord(
  row: NonNullable<Awaited<ReturnType<typeof loadPublicOffer>>>,
): PublicOfferRecord {
  const expired = isOfferExpired(row.expiresAt);
  return {
    baseSalary: row.baseSalary,
    bonus: row.bonus,
    candidateName: row.candidateName,
    companyName: row.companyName?.trim() || row.organizationName,
    currency: row.currency,
    declineReason: row.declineReason,
    equity: row.equity,
    expiresAt: row.expiresAt ? offerExpiryEndOfDay(row.expiresAt).toISOString() : null,
    joiningDate: row.joiningDate?.toISOString() ?? null,
    position: row.position,
    publishedAt: row.publishedAt?.toISOString() ?? new Date(0).toISOString(),
    responseAt: row.responseAt?.toISOString() ?? null,
    status: expired && row.status === "sent" ? "expired" : row.status,
  };
}

async function recordAccess(row: NonNullable<Awaited<ReturnType<typeof loadPublicOffer>>>) {
  await db.insert(recruitingEvent).values({
    action: "offer_link_accessed",
    createdAt: new Date(),
    detail: { draftId: row.id },
    id: crypto.randomUUID(),
    operatorId: null,
    organizationId: row.organizationId,
    recruitingRecordId: row.recruitingRecordId,
  });
}
const publicOfferDependencies = {
  loadOffer: loadPublicOffer,
  recordAccess,
  respond: respondOfferDraft,
};
export type PublicOfferDependencies = typeof publicOfferDependencies;
export function createPublicOffersRouter(
  dependencies: PublicOfferDependencies = publicOfferDependencies,
) {
  return (
    factory
      .createApp()
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Central Hono error mapping keeps public responses consistent.
      .onError((error, c) => {
        if (error instanceof OfferDraftError) {
          return c.json({ error: error.message }, error.status);
        }
        throw error;
      })
      .get("/:token", async (c) => {
        const row = await dependencies.loadOffer(c.req.param("token"));
        if (!row?.publishedAt) {
          return c.json({ error: "当前 Offer 链接不可用。" }, 404);
        }
        await dependencies.recordAccess(row);
        return c.json(toPublicRecord(row), 200);
      })
      .post(
        "/:token/respond",
        zValidator("json", responseSchema, jsonValidatorError("Offer 响应参数无效。")),
        async (c) => {
          const row = await dependencies.loadOffer(c.req.param("token"));
          if (!row?.publishedAt) {
            return c.json({ error: "当前 Offer 链接不可用。" }, 404);
          }
          if (row.status === "superseded") {
            return c.json({ error: "当前 Offer 已失效，请联系招聘负责人获取新的 Offer。" }, 410);
          }
          if (isOfferExpired(row.expiresAt)) {
            return c.json({ error: "当前 Offer 已过期，请联系招聘负责人。" }, 410);
          }
          const input = c.req.valid("json");
          const updated = await dependencies.respond({
            declineReason: input.declineReason,
            draftId: row.id,
            onResponded: async (tx, context) => {
              await tx.insert(recruitingEvent).values({
                action:
                  input.response === "accepted"
                    ? "offer_accepted_by_candidate"
                    : "offer_declined_by_candidate",
                createdAt: context.respondedAt,
                detail: { declineReason: input.declineReason ?? null, draftId: row.id },
                id: crypto.randomUUID(),
                operatorId: null,
                organizationId: row.organizationId,
                recruitingRecordId: row.recruitingRecordId,
              });
              await enqueueOfferResponseEvent(tx, {
                declineReason: input.declineReason,
                offerId: context.offerId,
                respondedAt: context.respondedAt,
                response: input.response,
              });
            },
            organizationId: row.organizationId,
            response: input.response,
            responseSource: "candidate",
          });
          return c.json({ status: updated.status }, 200);
        },
      )
  );
}
export const publicOffersRouter = createPublicOffersRouter();
