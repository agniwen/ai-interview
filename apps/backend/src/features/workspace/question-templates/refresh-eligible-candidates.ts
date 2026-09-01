import { createHash } from "node:crypto";
import { buildTemplateSnapshot } from "@arc/db-schema/interview-question-templates";
import {
  interviewAuditLog,
  interviewContextSnapshot,
  interviewQuestionTemplate,
  interviewQuestionTemplateBinding,
  interviewQuestionTemplateJobDescription,
  interviewQuestionTemplateQuestion,
  interviewQuestionTemplateVersion,
  studioInterview,
  studioInterviewSchedule,
} from "@arc/db-schema/schema";
import { and, asc, desc, eq, exists, isNull, max, notExists, sql } from "drizzle-orm";
import { z } from "zod";
import type { WorkspaceDatabasePort } from "../workspace.ports.js";

type Transaction = Parameters<Parameters<WorkspaceDatabasePort["transaction"]>[0]>[0];
const jsonValueSchema = z.json();
const jsonObjectSchema = z.record(z.string(), jsonValueSchema);
type JsonValue = z.infer<typeof jsonValueSchema>;
type HashInput =
  | ReturnType<typeof buildTemplateSnapshot>
  | typeof interviewContextSnapshot.$inferSelect.payload;

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const objectResult = jsonObjectSchema.safeParse(value);
  if (objectResult.success) {
    return `{${Object.entries(objectResult.data)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
const hash = (value: HashInput) =>
  createHash("sha256")
    .update(canonicalJson(jsonValueSchema.parse(value)))
    .digest("hex");

async function resolveVersion(transaction: Transaction, templateId: string) {
  const [template] = await transaction
    .select()
    .from(interviewQuestionTemplate)
    .where(eq(interviewQuestionTemplate.id, templateId))
    .limit(1);
  if (!template) {
    throw new Error("TEMPLATE_NOT_FOUND");
  }
  const [questions, links] = await Promise.all([
    transaction
      .select()
      .from(interviewQuestionTemplateQuestion)
      .where(eq(interviewQuestionTemplateQuestion.templateId, templateId))
      .orderBy(asc(interviewQuestionTemplateQuestion.sortOrder)),
    transaction
      .select({ jobDescriptionId: interviewQuestionTemplateJobDescription.jobDescriptionId })
      .from(interviewQuestionTemplateJobDescription)
      .where(eq(interviewQuestionTemplateJobDescription.templateId, templateId)),
  ]);
  const snapshot = buildTemplateSnapshot({
    description: template.description,
    jobDescriptionIds: links.map((link) => link.jobDescriptionId),
    questions,
    scope: template.scope,
    templateId,
    title: template.title,
  });
  const contentHash = hash(snapshot);
  const [existing] = await transaction
    .select()
    .from(interviewQuestionTemplateVersion)
    .where(
      and(
        eq(interviewQuestionTemplateVersion.templateId, templateId),
        eq(interviewQuestionTemplateVersion.contentHash, contentHash),
      ),
    )
    .limit(1);
  if (existing) {
    return existing;
  }
  const [latest] = await transaction
    .select({ version: max(interviewQuestionTemplateVersion.version) })
    .from(interviewQuestionTemplateVersion)
    .where(eq(interviewQuestionTemplateVersion.templateId, templateId));
  try {
    const [created] = await transaction
      .insert(interviewQuestionTemplateVersion)
      .values({
        contentHash,
        createdAt: new Date(),
        id: crypto.randomUUID(),
        snapshot,
        templateId,
        version: (latest?.version ?? 0) + 1,
      })
      .returning();
    if (!created) {
      throw new Error("QUESTION_VERSION_INSERT_FAILED");
    }
    return created;
  } catch (error) {
    const [winner] = await transaction
      .select()
      .from(interviewQuestionTemplateVersion)
      .where(
        and(
          eq(interviewQuestionTemplateVersion.templateId, templateId),
          eq(interviewQuestionTemplateVersion.contentHash, contentHash),
        ),
      )
      .limit(1);
    if (!winner) {
      throw error;
    }
    return winner;
  }
}

export async function refreshEligibleCommunicationQuestions(
  database: WorkspaceDatabasePort,
  options: { operatorId: string | null; organizationId: string; templateId: string },
) {
  const [template] = await database
    .select({ scope: interviewQuestionTemplate.scope })
    .from(interviewQuestionTemplate)
    .where(
      and(
        eq(interviewQuestionTemplate.id, options.templateId),
        eq(interviewQuestionTemplate.organizationId, options.organizationId),
        isNull(interviewQuestionTemplate.archivedAt),
      ),
    )
    .limit(1);
  if (!template) {
    throw new Error("TEMPLATE_NOT_FOUND");
  }
  const neverStarted = notExists(
    database
      .select({ one: sql`1` })
      .from(studioInterviewSchedule)
      .where(
        and(
          eq(studioInterviewSchedule.interviewRecordId, studioInterview.id),
          sql`${studioInterviewSchedule.status} <> 'pending'`,
        ),
      ),
  );
  const bound = await database
    .selectDistinct({ id: studioInterview.id })
    .from(interviewQuestionTemplateBinding)
    .innerJoin(
      studioInterview,
      eq(interviewQuestionTemplateBinding.interviewRecordId, studioInterview.id),
    )
    .where(
      and(
        eq(interviewQuestionTemplateBinding.templateId, options.templateId),
        eq(studioInterview.organizationId, options.organizationId),
        sql`${studioInterview.pipelineStage} <> 'closed'`,
        neverStarted,
      ),
    );
  const filters = [
    eq(studioInterview.organizationId, options.organizationId),
    sql`${studioInterview.pipelineStage} <> 'closed'`,
    neverStarted,
  ];
  if (template.scope === "job_description") {
    filters.push(
      exists(
        database
          .select({ one: sql`1` })
          .from(interviewQuestionTemplateJobDescription)
          .where(
            and(
              eq(interviewQuestionTemplateJobDescription.templateId, options.templateId),
              eq(
                interviewQuestionTemplateJobDescription.jobDescriptionId,
                studioInterview.jobDescriptionId,
              ),
            ),
          ),
      ),
    );
  }
  const applicable = await database
    .select({ id: studioInterview.id })
    .from(studioInterview)
    .where(and(...filters));
  const ids = [...new Set([...bound, ...applicable].map((row) => row.id))];
  let refreshedCount = 0;
  for (const interviewRecordId of ids) {
    const refreshed = await database.transaction(async (transaction) => {
      const version = await resolveVersion(transaction, options.templateId);
      const [binding] = await transaction
        .select()
        .from(interviewQuestionTemplateBinding)
        .where(
          and(
            eq(interviewQuestionTemplateBinding.interviewRecordId, interviewRecordId),
            eq(interviewQuestionTemplateBinding.templateId, options.templateId),
          ),
        )
        .limit(1)
        .for("update");
      let bindingId = binding?.id;
      let sortOrder = binding?.sortOrder;
      let bindingChanged = false;
      if (binding) {
        if (binding.versionId !== version.id) {
          await transaction
            .update(interviewQuestionTemplateBinding)
            .set({ versionId: version.id })
            .where(eq(interviewQuestionTemplateBinding.id, binding.id));
          bindingChanged = true;
        }
      } else {
        const [last] = await transaction
          .select({ sortOrder: max(interviewQuestionTemplateBinding.sortOrder) })
          .from(interviewQuestionTemplateBinding)
          .where(eq(interviewQuestionTemplateBinding.interviewRecordId, interviewRecordId));
        bindingId = crypto.randomUUID();
        sortOrder = (last?.sortOrder ?? -1) + 1;
        await transaction.insert(interviewQuestionTemplateBinding).values({
          createdAt: new Date(),
          disabledByUser: false,
          id: bindingId,
          interviewRecordId,
          organizationId: options.organizationId,
          sortOrder,
          templateId: options.templateId,
          versionId: version.id,
        });
        bindingChanged = true;
      }
      const [active] = await transaction
        .select()
        .from(interviewContextSnapshot)
        .where(
          and(
            eq(interviewContextSnapshot.interviewRecordId, interviewRecordId),
            eq(interviewContextSnapshot.status, "active"),
          ),
        )
        .orderBy(desc(interviewContextSnapshot.version))
        .limit(1)
        .for("update");
      if (!active) {
        return bindingChanged;
      }
      const questionTemplates = active.payload.questionTemplates.filter(
        (item) => item.templateId !== options.templateId,
      );
      questionTemplates.push({
        bindingId,
        disabledByUser: binding?.disabledByUser ?? false,
        scope: template.scope,
        snapshot: version.snapshot,
        sortOrder,
        templateId: options.templateId,
        version: version.version,
        versionId: version.id,
      });
      questionTemplates.sort((left, right) => left.sortOrder - right.sortOrder);
      const now = new Date();
      const payload = { ...active.payload, createdAt: now.toISOString(), questionTemplates };
      await transaction
        .update(interviewContextSnapshot)
        .set({ status: "superseded", supersededAt: now })
        .where(eq(interviewContextSnapshot.id, active.id));
      const [latest] = await transaction
        .select({ version: max(interviewContextSnapshot.version) })
        .from(interviewContextSnapshot)
        .where(eq(interviewContextSnapshot.interviewRecordId, interviewRecordId));
      const snapshotId = crypto.randomUUID();
      const snapshotVersion = (latest?.version ?? active.version) + 1;
      await transaction.insert(interviewContextSnapshot).values({
        contentHash: hash(payload),
        createdAt: now,
        createdBy: options.operatorId,
        id: snapshotId,
        interviewRecordId,
        organizationId: options.organizationId,
        payload,
        reason: "manual_refresh",
        scheduleEntryId: active.scheduleEntryId,
        status: "active",
        version: snapshotVersion,
      });
      await transaction.insert(interviewAuditLog).values({
        action: "context_snapshot_refresh",
        createdAt: now,
        detail: {
          reason: "interview_question_template_bulk_refresh",
          snapshotId,
          snapshotVersion,
          templateId: options.templateId,
        },
        id: crypto.randomUUID(),
        interviewRecordId,
        operatorId: options.operatorId,
        organizationId: options.organizationId,
        scheduleEntryId: active.scheduleEntryId,
      });
      return true;
    });
    if (refreshed) {
      refreshedCount += 1;
    }
  }
  return { refreshedCount, scannedCount: ids.length };
}
