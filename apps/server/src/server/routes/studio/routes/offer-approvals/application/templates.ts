/* oxlint-disable complexity, curly, sort-keys -- Template resolution keeps ordered-node validation in one application boundary. */
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { jobDescription, member, offerApprovalTemplate, user } from "@app/db-schema/schema";
import { offerApprovalTemplateNodeSchema } from "@app/db-schema/offer-approval";
import { offerApprovalTemplateInputSchema } from "@app/shared/offer-approval";
import type { RecruitingExecutor } from "@app/database/recruiting-records";
import type { z } from "zod";
import { db } from "../../../../../../lib/server/db";
import { assertApprovalPermission, OfferApprovalError } from "../dao";
import type { Actor } from "../dao";

export const approvalResolverLabels = {
  fixed_member: "固定审批人",
  job_reporting_manager: "岗位汇报上级",
  recruiting_owner: "招聘负责人",
} as const;

type ApprovalTemplate = typeof offerApprovalTemplate.$inferSelect;
type TemplateInput = z.input<typeof offerApprovalTemplateInputSchema>;
interface ApprovalRecordContext {
  jobDescriptionId: string | null;
  ownerId: string | null;
}

export function assertTemplateApproverSelection(input: {
  resolvedApproverIds: string[];
  submittedApproverIds: string[];
}) {
  const matches =
    input.resolvedApproverIds.length === input.submittedApproverIds.length &&
    input.resolvedApproverIds.every(
      (userId, index) => userId === input.submittedApproverIds[index],
    );
  if (!matches) {
    throw new OfferApprovalError("模板解析出的审批人已变化，请刷新并重新确认", 409);
  }
}

function serializeTemplate(template: ApprovalTemplate) {
  return {
    ...template,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

async function assertUniqueTemplateName(
  executor: RecruitingExecutor,
  actor: Actor,
  name: string,
  excludedId?: string,
) {
  const [existing] = await executor
    .select({ id: offerApprovalTemplate.id })
    .from(offerApprovalTemplate)
    .where(
      and(
        eq(offerApprovalTemplate.organizationId, actor.organizationId),
        eq(offerApprovalTemplate.name, name),
        excludedId ? ne(offerApprovalTemplate.id, excludedId) : undefined,
      ),
    );
  if (existing) throw new OfferApprovalError("模板名称已存在", 409);
}

async function clearOtherDefaultTemplates(
  executor: RecruitingExecutor,
  actor: Actor,
  excludedId?: string,
) {
  await executor
    .update(offerApprovalTemplate)
    .set({ isDefault: false, updatedAt: new Date(), updatedBy: actor.userId })
    .where(
      and(
        eq(offerApprovalTemplate.organizationId, actor.organizationId),
        eq(offerApprovalTemplate.isDefault, true),
        excludedId ? ne(offerApprovalTemplate.id, excludedId) : undefined,
      ),
    );
}

export function chooseDefaultTemplateId(
  templates: { enabled: boolean; id: string; isDefault: boolean }[],
  preferredId?: string,
) {
  const current = templates.find((template) => template.enabled && template.isDefault);
  if (current) return current.id;
  const preferred = templates.find((template) => template.enabled && template.id === preferredId);
  return preferred?.id ?? templates.find((template) => template.enabled)?.id ?? null;
}

async function ensureDefaultEnabledTemplate(
  executor: RecruitingExecutor,
  actor: Actor,
  preferredId?: string,
) {
  await executor
    .update(offerApprovalTemplate)
    .set({ isDefault: false, updatedAt: new Date(), updatedBy: actor.userId })
    .where(
      and(
        eq(offerApprovalTemplate.organizationId, actor.organizationId),
        eq(offerApprovalTemplate.enabled, false),
        eq(offerApprovalTemplate.isDefault, true),
      ),
    );

  const templates = await executor
    .select({
      enabled: offerApprovalTemplate.enabled,
      id: offerApprovalTemplate.id,
      isDefault: offerApprovalTemplate.isDefault,
    })
    .from(offerApprovalTemplate)
    .where(eq(offerApprovalTemplate.organizationId, actor.organizationId))
    .orderBy(desc(offerApprovalTemplate.updatedAt));
  const defaultId = chooseDefaultTemplateId(templates, preferredId);
  if (!defaultId || templates.some((template) => template.id === defaultId && template.isDefault)) {
    return defaultId;
  }

  await executor
    .update(offerApprovalTemplate)
    .set({ isDefault: true, updatedAt: new Date(), updatedBy: actor.userId })
    .where(eq(offerApprovalTemplate.id, defaultId));
  return defaultId;
}

async function findApprovalTemplate(
  executor: RecruitingExecutor,
  actor: Actor,
  templateId: string,
) {
  const [template] = await executor
    .select()
    .from(offerApprovalTemplate)
    .where(
      and(
        eq(offerApprovalTemplate.id, templateId),
        eq(offerApprovalTemplate.organizationId, actor.organizationId),
      ),
    )
    .limit(1);
  return template;
}

async function validateTemplateFixedMembers(
  executor: RecruitingExecutor,
  actor: Actor,
  nodes: z.output<typeof offerApprovalTemplateNodeSchema>[],
) {
  for (const [index, node] of nodes.entries()) {
    if (node.resolverType !== "fixed_member" || !node.fixedUserId) continue;
    try {
      await assertApprovalPermission(executor, { ...actor, userId: node.fixedUserId }, "read");
      await assertApprovalPermission(executor, { ...actor, userId: node.fixedUserId }, "decide");
    } catch (error) {
      if (!(error instanceof OfferApprovalError)) throw error;
      throw new OfferApprovalError(`第 ${index + 1} 个固定审批人不可用或没有审批权限`, 400);
    }
  }
}

async function lockTemplateConfiguration(executor: RecruitingExecutor, actor: Actor) {
  await executor.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`offer-approval-template:${actor.organizationId}`}, 0))`,
  );
}

export async function listApprovalTemplates(actor: Actor) {
  await assertApprovalPermission(db, actor, "manage");
  const templates = await db
    .select()
    .from(offerApprovalTemplate)
    .where(eq(offerApprovalTemplate.organizationId, actor.organizationId))
    .orderBy(desc(offerApprovalTemplate.isDefault), desc(offerApprovalTemplate.updatedAt));
  return templates.map(serializeTemplate);
}

export async function listTemplateApprovers(actor: Actor) {
  await assertApprovalPermission(db, actor, "manage");
  const members = await db
    .select({ avatarUrl: user.image, name: user.name, userId: member.userId })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, actor.organizationId));
  const eligible = [];
  for (const person of members) {
    try {
      await assertApprovalPermission(db, { ...actor, userId: person.userId }, "read");
      await assertApprovalPermission(db, { ...actor, userId: person.userId }, "decide");
      eligible.push(person);
    } catch (error) {
      if (!(error instanceof OfferApprovalError)) throw error;
    }
  }
  return eligible.toSorted((left, right) => left.name.localeCompare(right.name, "zh-CN"));
}

export async function createApprovalTemplate(actor: Actor, raw: TemplateInput) {
  const input = offerApprovalTemplateInputSchema.parse(raw);
  await assertApprovalPermission(db, actor, "manage");
  return db.transaction(async (tx) => {
    await lockTemplateConfiguration(tx, actor);
    await assertUniqueTemplateName(tx, actor, input.name);
    await validateTemplateFixedMembers(tx, actor, input.nodes);
    const id = crypto.randomUUID();
    await tx
      .insert(offerApprovalTemplate)
      .values({
        createdBy: actor.userId,
        enabled: input.enabled,
        id,
        isDefault: false,
        name: input.name,
        nodes: input.nodes,
        organizationId: actor.organizationId,
        updatedBy: actor.userId,
      })
      .returning();
    await ensureDefaultEnabledTemplate(tx, actor, input.enabled ? id : undefined);
    const created = await findApprovalTemplate(tx, actor, id);
    if (!created) throw new Error("审批模板创建后无法读取");
    return serializeTemplate(created);
  });
}

export async function updateApprovalTemplate(actor: Actor, templateId: string, raw: TemplateInput) {
  const input = offerApprovalTemplateInputSchema.parse(raw);
  await assertApprovalPermission(db, actor, "manage");
  return db.transaction(async (tx) => {
    await lockTemplateConfiguration(tx, actor);
    const [template] = await tx
      .select()
      .from(offerApprovalTemplate)
      .where(
        and(
          eq(offerApprovalTemplate.id, templateId),
          eq(offerApprovalTemplate.organizationId, actor.organizationId),
        ),
      )
      .for("update");
    if (!template) throw new OfferApprovalError("审批模板不存在", 404);
    await assertUniqueTemplateName(tx, actor, input.name, templateId);
    await validateTemplateFixedMembers(tx, actor, input.nodes);
    await tx
      .update(offerApprovalTemplate)
      .set({
        enabled: input.enabled,
        isDefault: input.enabled && template.isDefault,
        name: input.name,
        nodes: input.nodes,
        updatedAt: new Date(),
        updatedBy: actor.userId,
      })
      .where(eq(offerApprovalTemplate.id, templateId))
      .returning();
    await ensureDefaultEnabledTemplate(tx, actor, input.enabled ? templateId : undefined);
    const updated = await findApprovalTemplate(tx, actor, templateId);
    if (!updated) throw new Error("审批模板保存后无法读取");
    return serializeTemplate(updated);
  });
}

export async function deleteApprovalTemplate(actor: Actor, templateId: string) {
  await assertApprovalPermission(db, actor, "manage");
  return db.transaction(async (tx) => {
    await lockTemplateConfiguration(tx, actor);
    const [deleted] = await tx
      .delete(offerApprovalTemplate)
      .where(
        and(
          eq(offerApprovalTemplate.id, templateId),
          eq(offerApprovalTemplate.organizationId, actor.organizationId),
        ),
      )
      .returning({ id: offerApprovalTemplate.id });
    if (!deleted) throw new OfferApprovalError("审批模板不存在", 404);
    await ensureDefaultEnabledTemplate(tx, actor);
    return { id: deleted.id };
  });
}

export async function setDefaultApprovalTemplate(actor: Actor, templateId: string) {
  await assertApprovalPermission(db, actor, "manage");
  return db.transaction(async (tx) => {
    await lockTemplateConfiguration(tx, actor);
    const [template] = await tx
      .select()
      .from(offerApprovalTemplate)
      .where(
        and(
          eq(offerApprovalTemplate.id, templateId),
          eq(offerApprovalTemplate.organizationId, actor.organizationId),
        ),
      )
      .for("update");
    if (!template) throw new OfferApprovalError("审批模板不存在", 404);
    if (!template.enabled) throw new OfferApprovalError("请先启用模板，再设为默认模板", 409);
    if (template.isDefault) return serializeTemplate(template);

    await clearOtherDefaultTemplates(tx, actor, templateId);
    const [updated] = await tx
      .update(offerApprovalTemplate)
      .set({ isDefault: true, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(offerApprovalTemplate.id, templateId))
      .returning();
    return serializeTemplate(updated);
  });
}

export function getEnabledApprovalTemplates(executor: RecruitingExecutor, actor: Actor) {
  return executor
    .select()
    .from(offerApprovalTemplate)
    .where(
      and(
        eq(offerApprovalTemplate.organizationId, actor.organizationId),
        eq(offerApprovalTemplate.enabled, true),
      ),
    )
    .orderBy(desc(offerApprovalTemplate.isDefault), desc(offerApprovalTemplate.updatedAt));
}

export async function getOfferApprovalPolicy(executor: RecruitingExecutor, organizationId: string) {
  const [enabledTemplate] = await executor
    .select({ id: offerApprovalTemplate.id })
    .from(offerApprovalTemplate)
    .where(
      and(
        eq(offerApprovalTemplate.organizationId, organizationId),
        eq(offerApprovalTemplate.enabled, true),
      ),
    )
    .limit(1);
  return { approvalRequired: Boolean(enabledTemplate) };
}

async function resolveNodeUserId(
  executor: RecruitingExecutor,
  actor: Actor,
  record: ApprovalRecordContext,
  node: z.output<typeof offerApprovalTemplateNodeSchema>,
) {
  if (node.resolverType === "fixed_member") return node.fixedUserId;
  if (node.resolverType === "recruiting_owner") {
    if (!record.ownerId) throw new OfferApprovalError("招聘记录尚未设置招聘负责人", 400);
    return record.ownerId;
  }
  if (!record.jobDescriptionId) {
    throw new OfferApprovalError("招聘记录尚未关联岗位，无法解析岗位汇报上级", 400);
  }
  const [job] = await executor
    .select({ reportingManagerUserId: jobDescription.reportingManagerUserId })
    .from(jobDescription)
    .where(
      and(
        eq(jobDescription.id, record.jobDescriptionId),
        eq(jobDescription.organizationId, actor.organizationId),
      ),
    );
  if (!job?.reportingManagerUserId) {
    throw new OfferApprovalError("关联岗位尚未设置汇报上级", 400);
  }
  return job.reportingManagerUserId;
}

export async function resolveApprovalTemplate(
  executor: RecruitingExecutor,
  actor: Actor,
  record: ApprovalRecordContext,
  template: ApprovalTemplate,
) {
  const nodes = template.nodes.map((node) => offerApprovalTemplateNodeSchema.parse(node));
  const resolved = [];
  for (const [position, node] of nodes.entries()) {
    const userId = await resolveNodeUserId(executor, actor, record, node);
    if (!userId) throw new OfferApprovalError(`第 ${position + 1} 个审批节点无法解析`, 400);
    const person = await assertApprovalPermission(executor, { ...actor, userId }, "decide");
    await assertApprovalPermission(executor, { ...actor, userId }, "read");
    resolved.push({
      approverId: userId,
      approverName: person.name,
      nodeId: node.id,
      position,
      sourceLabel: approvalResolverLabels[node.resolverType],
      sourceType: node.resolverType,
    });
  }
  return resolved;
}

export async function resolveEnabledTemplatesForPreview(
  executor: RecruitingExecutor,
  actor: Actor,
  record: ApprovalRecordContext,
) {
  const templates = await getEnabledApprovalTemplates(executor, actor);
  return Promise.all(
    templates.map(async (template) => {
      try {
        return {
          error: null,
          id: template.id,
          isDefault: template.isDefault,
          name: template.name,
          nodes: await resolveApprovalTemplate(executor, actor, record, template),
        };
      } catch (error) {
        if (!(error instanceof OfferApprovalError)) throw error;
        return {
          error: error.message,
          id: template.id,
          isDefault: template.isDefault,
          name: template.name,
          nodes: [],
        };
      }
    }),
  );
}
