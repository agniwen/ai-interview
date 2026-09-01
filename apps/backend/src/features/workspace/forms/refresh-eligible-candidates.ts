import { createHash } from "node:crypto";
import { buildTemplateSnapshot } from "@arc/db-schema/candidate-forms";
import {
  candidateFormSubmission,
  candidateFormTemplate,
  candidateFormTemplateJobDescription,
  candidateFormTemplateQuestion,
  candidateFormTemplateVersion,
  interviewAuditLog,
  interviewContextSnapshot,
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

function hash(value: HashInput) {
  return createHash("sha256")
    .update(canonicalJson(jsonValueSchema.parse(value)))
    .digest("hex");
}

async function resolveVersion(transaction: Transaction, templateId: string) {
  const [template] = await transaction
    .select()
    .from(candidateFormTemplate)
    .where(eq(candidateFormTemplate.id, templateId))
    .limit(1);
  if (!template) {
    throw new Error("TEMPLATE_NOT_FOUND");
  }
  const [questions, links] = await Promise.all([
    transaction
      .select()
      .from(candidateFormTemplateQuestion)
      .where(eq(candidateFormTemplateQuestion.templateId, templateId))
      .orderBy(asc(candidateFormTemplateQuestion.sortOrder)),
    transaction
      .select({ jobDescriptionId: candidateFormTemplateJobDescription.jobDescriptionId })
      .from(candidateFormTemplateJobDescription)
      .where(eq(candidateFormTemplateJobDescription.templateId, templateId)),
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
    .from(candidateFormTemplateVersion)
    .where(
      and(
        eq(candidateFormTemplateVersion.templateId, templateId),
        eq(candidateFormTemplateVersion.contentHash, contentHash),
      ),
    )
    .limit(1);
  if (existing) {
    return existing;
  }
  const [latest] = await transaction
    .select({ version: max(candidateFormTemplateVersion.version) })
    .from(candidateFormTemplateVersion)
    .where(eq(candidateFormTemplateVersion.templateId, templateId));
  try {
    const [created] = await transaction
      .insert(candidateFormTemplateVersion)
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
      throw new Error("FORM_VERSION_INSERT_FAILED");
    }
    return created;
  } catch (error) {
    const [winner] = await transaction
      .select()
      .from(candidateFormTemplateVersion)
      .where(
        and(
          eq(candidateFormTemplateVersion.templateId, templateId),
          eq(candidateFormTemplateVersion.contentHash, contentHash),
        ),
      )
      .limit(1);
    if (!winner) {
      throw error;
    }
    return winner;
  }
}

export async function refreshEligibleCandidateForms(
  database: WorkspaceDatabasePort,
  options: { operatorId: string | null; organizationId: string; templateId: string },
) {
  const [template] = await database
    .select({ id: candidateFormTemplate.id, scope: candidateFormTemplate.scope })
    .from(candidateFormTemplate)
    .where(
      and(
        eq(candidateFormTemplate.id, options.templateId),
        eq(candidateFormTemplate.organizationId, options.organizationId),
        isNull(candidateFormTemplate.archivedAt),
      ),
    )
    .limit(1);
  if (!template) {
    throw new Error("TEMPLATE_NOT_FOUND");
  }

  const scopeFilter =
    template.scope === "global"
      ? sql`true`
      : exists(
          database
            .select({ one: sql`1` })
            .from(candidateFormTemplateJobDescription)
            .where(
              and(
                eq(candidateFormTemplateJobDescription.templateId, options.templateId),
                eq(
                  candidateFormTemplateJobDescription.jobDescriptionId,
                  studioInterview.jobDescriptionId,
                ),
              ),
            ),
        );
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
  const notSubmitted = notExists(
    database
      .select({ one: sql`1` })
      .from(candidateFormSubmission)
      .where(
        and(
          eq(candidateFormSubmission.interviewRecordId, studioInterview.id),
          eq(candidateFormSubmission.templateId, options.templateId),
        ),
      ),
  );
  const rows = await database
    .selectDistinct({ id: studioInterview.id })
    .from(studioInterview)
    .innerJoin(
      interviewContextSnapshot,
      and(
        eq(interviewContextSnapshot.interviewRecordId, studioInterview.id),
        eq(interviewContextSnapshot.status, "active"),
      ),
    )
    .where(
      and(
        eq(studioInterview.organizationId, options.organizationId),
        sql`${studioInterview.pipelineStage} <> 'closed'`,
        neverStarted,
        notSubmitted,
        scopeFilter,
      ),
    );

  let refreshedCount = 0;
  for (const row of rows) {
    const refreshed = await database.transaction(async (transaction) => {
      const [active] = await transaction
        .select()
        .from(interviewContextSnapshot)
        .where(
          and(
            eq(interviewContextSnapshot.interviewRecordId, row.id),
            eq(interviewContextSnapshot.status, "active"),
          ),
        )
        .orderBy(desc(interviewContextSnapshot.version))
        .limit(1)
        .for("update");
      if (!active) {
        return false;
      }
      const version = await resolveVersion(transaction, options.templateId);
      const forms = active.payload.forms.filter((form) => form.templateId !== options.templateId);
      forms.push({
        snapshot: version.snapshot,
        templateId: options.templateId,
        version: version.version,
        versionId: version.id,
      });
      const payload = { ...active.payload, createdAt: new Date().toISOString(), forms };
      const now = new Date();
      await transaction
        .update(interviewContextSnapshot)
        .set({ status: "superseded", supersededAt: now })
        .where(eq(interviewContextSnapshot.id, active.id));
      const [latest] = await transaction
        .select({ version: max(interviewContextSnapshot.version) })
        .from(interviewContextSnapshot)
        .where(eq(interviewContextSnapshot.interviewRecordId, row.id));
      const snapshotId = crypto.randomUUID();
      const snapshotVersion = (latest?.version ?? active.version) + 1;
      await transaction.insert(interviewContextSnapshot).values({
        contentHash: hash(payload),
        createdAt: now,
        createdBy: options.operatorId,
        id: snapshotId,
        interviewRecordId: row.id,
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
          reason: "form_template_bulk_refresh",
          snapshotId,
          snapshotVersion,
          templateId: options.templateId,
        },
        id: crypto.randomUUID(),
        interviewRecordId: row.id,
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
  return { refreshedCount, scannedCount: rows.length };
}
