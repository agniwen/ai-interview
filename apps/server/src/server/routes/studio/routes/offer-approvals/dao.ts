/* oxlint-disable anti-slop/no-unknown-parameters, curly, sort-keys, typescript/consistent-type-definitions, typescript/parameter-properties -- This DAO uses transaction-shaped records and canonical request hashes at its persistence boundary. */
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  candidate,
  globalConfig,
  organization,
  member,
  user,
  account,
  recruitingRecord,
  recruitingNodeState,
  recruitingOffer,
  recruitingOfferApproval,
  recruitingOfferApprovalStep,
  recruitingOfferApprovalReceipt,
} from "@app/db-schema/schema";
import { offerApprovalSnapshotSchema } from "@app/db-schema/offer-approval";
import { lockRecruitingRecord } from "@app/database/recruiting-records";
import type {
  RecruitingTransaction as Tx,
  RecruitingExecutor,
} from "@app/database/recruiting-records";
import { isOfferExpired, offerExpiryEndOfDay } from "@app/shared/offer-expiry";
import { hasPermissionInStatements } from "@app/shared/permission-statements";
import { computeWorkspacePermissionSnapshot } from "../../../../access/workspace-permission-snapshot";
import { resolveRecruitingVisibilityScope } from "../../../../access/recruiting-visibility";
import { db } from "../../../../../lib/server/db";
import {
  FEISHU_PROVIDER_IDS,
  selectPreferredFeishuProviderId,
} from "../../../../integrations/feishu/provider";

export class OfferApprovalError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 409,
  ) {
    super(message);
    this.name = "OfferApprovalError";
  }
}
export type Actor = { organizationId: string; userId: string };
export type Approval = typeof recruitingOfferApproval.$inferSelect;
export function hashRequest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export async function approvalMember(executor: RecruitingExecutor, actor: Actor) {
  const [person] = await executor
    .select({ role: member.role, name: user.name })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, actor.organizationId), eq(member.userId, actor.userId)));
  if (!person || person.role === "noAccess")
    throw new OfferApprovalError("当前成员没有审批访问权限", 403);
  const { statements } = await computeWorkspacePermissionSnapshot({
    organizationId: actor.organizationId,
    userId: actor.userId,
    memberRole: person.role,
  });
  return { ...person, statements };
}
export async function assertApprovalPermission(
  executor: RecruitingExecutor,
  actor: Actor,
  action: "read" | "create" | "decide" | "manage",
) {
  const person = await approvalMember(executor, actor);
  if (
    !hasPermissionInStatements(person.statements, "page", "offerApprovals") ||
    !hasPermissionInStatements(person.statements, "offerApproval", action)
  )
    throw new OfferApprovalError("没有此审批操作权限", 403);
  return person;
}
export async function recordIsVisible(
  actor: Actor,
  record: { createdBy: string | null },
  role: string,
) {
  const scope = await resolveRecruitingVisibilityScope({
    organizationId: actor.organizationId,
    userId: actor.userId,
    currentRole: role,
  });
  return (
    scope.kind === "all" ||
    (scope.kind === "restricted" && !!record.createdBy && scope.userIds.includes(record.createdBy))
  );
}
export async function assertRecordManager(
  executor: RecruitingExecutor,
  actor: Actor,
  record: { createdBy: string | null },
  action: "create" | "manage",
  offerAction: "create" | "update" = "update",
) {
  const person = await assertApprovalPermission(executor, actor, action);
  if (
    !hasPermissionInStatements(person.statements, "offer", offerAction) ||
    !(await recordIsVisible(actor, record, person.role))
  )
    throw new OfferApprovalError("没有该招聘记录的管理权限", 403);
  return person;
}
export async function loadOfferSnapshot(
  executor: RecruitingExecutor,
  offer: typeof recruitingOffer.$inferSelect,
) {
  const [identity] = await executor
    .select({
      candidateId: candidate.id,
      candidateName: candidate.name,
      jobDescriptionId: recruitingRecord.jobDescriptionId,
      companyName: globalConfig.companyName,
      organizationName: organization.name,
    })
    .from(recruitingRecord)
    .innerJoin(
      candidate,
      and(
        eq(candidate.id, recruitingRecord.candidateId),
        eq(candidate.organizationId, recruitingRecord.organizationId),
      ),
    )
    .innerJoin(organization, eq(organization.id, recruitingRecord.organizationId))
    .leftJoin(globalConfig, eq(globalConfig.organizationId, recruitingRecord.organizationId))
    .where(
      and(
        eq(recruitingRecord.id, offer.recruitingRecordId),
        eq(recruitingRecord.organizationId, offer.organizationId),
      ),
    );
  if (!identity) throw new OfferApprovalError("招聘记录不存在", 404);
  return offerApprovalSnapshotSchema.parse({
    schemaVersion: 1,
    organizationId: offer.organizationId,
    recruitingRecordId: offer.recruitingRecordId,
    candidateId: identity.candidateId,
    jobDescriptionId: identity.jobDescriptionId,
    candidateName: identity.candidateName,
    companyName: identity.companyName?.trim() || identity.organizationName,
    position: offer.position,
    currency: offer.currency,
    baseSalary: offer.baseSalary,
    bonus: offer.bonus,
    equity: offer.equity,
    joiningDate: offer.joiningDate?.toISOString() ?? null,
    expiresAt: offer.expiresAt ? offerExpiryEndOfDay(offer.expiresAt).toISOString() : null,
    notes: offer.notes,
  });
}
export function assertOfferDates(
  snapshot: { expiresAt: string | null; joiningDate: string | null },
  now: Date,
  requireExpiry: boolean,
) {
  if (
    (requireExpiry && !snapshot.expiresAt) ||
    isOfferExpired(snapshot.expiresAt ? new Date(snapshot.expiresAt) : null, now)
  )
    throw new OfferApprovalError("请设置尚未过期的 Offer 截止日并重新审批");
  if (snapshot.joiningDate && offerExpiryEndOfDay(snapshot.joiningDate).getTime() < now.getTime())
    throw new OfferApprovalError("预计入职日已过，请修改后重新审批");
}
export async function lockOffer(tx: Tx, actor: Actor, offerId: string) {
  const [identity] = await tx
    .select({ recordId: recruitingOffer.recruitingRecordId })
    .from(recruitingOffer)
    .where(
      and(
        eq(recruitingOffer.id, offerId),
        eq(recruitingOffer.organizationId, actor.organizationId),
      ),
    );
  if (!identity) throw new OfferApprovalError("Offer 不存在", 404);
  const record = await lockRecruitingRecord(tx, identity.recordId, actor.organizationId);
  const [offer] = await tx
    .select()
    .from(recruitingOffer)
    .where(eq(recruitingOffer.id, offerId))
    .for("update");
  if (!record || !offer) throw new OfferApprovalError("Offer 不存在", 404);
  return { record, offer };
}
export async function assertCurrentDraft(
  tx: Tx,
  record: typeof recruitingRecord.$inferSelect,
  offer: typeof recruitingOffer.$inferSelect,
) {
  const [node] = await tx
    .select()
    .from(recruitingNodeState)
    .where(
      and(
        eq(recruitingNodeState.recruitingRecordId, record.id),
        eq(recruitingNodeState.node, "offer"),
      ),
    );
  if (
    record.currentStage !== "offer" ||
    record.outcome !== "in_pipeline" ||
    offer.status !== "draft" ||
    node?.effectiveOfferId !== offer.id
  )
    throw new OfferApprovalError("该 Offer 已不是当前有效草稿");
}
export async function lockApproval(tx: Tx, actor: Actor, approvalId: string) {
  const [identity] = await tx
    .select()
    .from(recruitingOfferApproval)
    .where(
      and(
        eq(recruitingOfferApproval.id, approvalId),
        eq(recruitingOfferApproval.organizationId, actor.organizationId),
      ),
    );
  if (!identity) throw new OfferApprovalError("审批单不存在", 404);
  const context = await lockOffer(tx, actor, identity.offerId);
  const [approval] = await tx
    .select()
    .from(recruitingOfferApproval)
    .where(eq(recruitingOfferApproval.id, approvalId))
    .for("update");
  const steps = await tx
    .select()
    .from(recruitingOfferApprovalStep)
    .where(eq(recruitingOfferApprovalStep.approvalId, approvalId))
    .orderBy(recruitingOfferApprovalStep.position)
    .for("update");
  return { ...context, approval, steps };
}
export async function readReceipt(tx: Tx, actor: Actor, requestId: string, requestHash: string) {
  // Serialize the same actor/request across different recruiting records as well.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${actor.organizationId}:${actor.userId}:${requestId}`}, 0))`,
  );
  const [receipt] = await tx
    .select()
    .from(recruitingOfferApprovalReceipt)
    .where(
      and(
        eq(recruitingOfferApprovalReceipt.organizationId, actor.organizationId),
        eq(recruitingOfferApprovalReceipt.actorId, actor.userId),
        eq(recruitingOfferApprovalReceipt.requestId, requestId),
      ),
    );
  if (receipt && receipt.requestHash !== requestHash)
    throw new OfferApprovalError("同一请求标识不能用于不同操作或内容");
  return receipt;
}
export async function saveReceipt(
  tx: Tx,
  actor: Actor,
  requestId: string,
  requestHash: string,
  approvalId: string,
) {
  await tx.insert(recruitingOfferApprovalReceipt).values({
    actorId: actor.userId,
    approvalId,
    id: crypto.randomUUID(),
    organizationId: actor.organizationId,
    requestHash,
    requestId,
  });
}
export async function listApprovers(actor: Actor) {
  await assertApprovalPermission(db, actor, "create");
  const members = await db
    .select({ name: user.name, userId: member.userId })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, actor.organizationId));
  const result = [];
  for (const person of members) {
    if (person.userId === actor.userId) {
      continue;
    }
    try {
      await assertApprovalPermission(db, { ...actor, userId: person.userId }, "read");
      await assertApprovalPermission(db, { ...actor, userId: person.userId }, "decide");
    } catch (error) {
      if (error instanceof OfferApprovalError) {
        continue;
      }
      throw error;
    }
    const accounts = await db
      .select({ providerId: account.providerId })
      .from(account)
      .where(
        and(
          eq(account.userId, person.userId),
          inArray(account.providerId, [...FEISHU_PROVIDER_IDS]),
        ),
      )
      .orderBy(desc(account.updatedAt));
    result.push({
      ...person,
      feishuBound: !!selectPreferredFeishuProviderId(accounts.map((item) => item.providerId)),
    });
  }
  return result;
}
