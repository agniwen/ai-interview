import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import {
  candidateFormSubmission,
  interviewAuditLog,
  interviewContextSnapshot,
  interviewQuestionTemplateBinding,
  studioInterview,
  studioInterviewSchedule,
} from "@arc/db-schema/schema";
import { and, desc, eq, inArray, max, notExists, sql } from "drizzle-orm";
import { z } from "zod";
import { API_DATABASE } from "../../../infrastructure/database/database.tokens.js";
import type { Database } from "../../../infrastructure/database/database.tokens.js";
import type {
  CandidateSetupRefreshCommands,
  CandidateSetupRefreshResult,
} from "./candidate-setup-refresh.commands.js";

const jsonValueSchema = z.json();
const jsonObjectSchema = z.record(z.string(), jsonValueSchema);
type JsonValue = z.infer<typeof jsonValueSchema>;

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

function hashPayload(payload: typeof interviewContextSnapshot.$inferSelect.payload) {
  return createHash("sha256")
    .update(canonicalJson(jsonValueSchema.parse(payload)))
    .digest("hex");
}

@Injectable()
export class CandidateSetupRefreshService implements CandidateSetupRefreshCommands {
  constructor(@Inject(API_DATABASE) private readonly database: Database) {}

  async refreshCandidateForms(
    input: Parameters<CandidateSetupRefreshCommands["refreshCandidateForms"]>[0],
  ): Promise<CandidateSetupRefreshResult> {
    const { snapshot } = input.version;
    const neverStarted = notExists(
      this.database
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
      this.database
        .select({ one: sql`1` })
        .from(candidateFormSubmission)
        .where(
          and(
            eq(candidateFormSubmission.interviewRecordId, studioInterview.id),
            eq(candidateFormSubmission.templateId, snapshot.templateId),
          ),
        ),
    );
    let scopeFilter;
    if (snapshot.scope === "job_description") {
      scopeFilter =
        snapshot.jobDescriptionIds.length > 0
          ? inArray(studioInterview.jobDescriptionId, snapshot.jobDescriptionIds)
          : sql`false`;
    }
    const rows = await this.database
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
          eq(studioInterview.organizationId, input.organizationId),
          sql`${studioInterview.pipelineStage} <> 'closed'`,
          neverStarted,
          notSubmitted,
          scopeFilter,
        ),
      );

    let refreshedCount = 0;
    for (const row of rows) {
      if (await this.refreshCandidateFormRecord(row.id, input)) {
        refreshedCount += 1;
      }
    }
    return { refreshedCount, scannedCount: rows.length };
  }

  async refreshCommunicationQuestions(
    input: Parameters<CandidateSetupRefreshCommands["refreshCommunicationQuestions"]>[0],
  ): Promise<CandidateSetupRefreshResult> {
    const { snapshot } = input.version;
    const neverStarted = notExists(
      this.database
        .select({ one: sql`1` })
        .from(studioInterviewSchedule)
        .where(
          and(
            eq(studioInterviewSchedule.interviewRecordId, studioInterview.id),
            sql`${studioInterviewSchedule.status} <> 'pending'`,
          ),
        ),
    );
    const bound = await this.database
      .selectDistinct({ id: studioInterview.id })
      .from(interviewQuestionTemplateBinding)
      .innerJoin(
        studioInterview,
        eq(interviewQuestionTemplateBinding.interviewRecordId, studioInterview.id),
      )
      .where(
        and(
          eq(interviewQuestionTemplateBinding.templateId, snapshot.templateId),
          eq(studioInterview.organizationId, input.organizationId),
          sql`${studioInterview.pipelineStage} <> 'closed'`,
          neverStarted,
        ),
      );
    const filters = [
      eq(studioInterview.organizationId, input.organizationId),
      sql`${studioInterview.pipelineStage} <> 'closed'`,
      neverStarted,
    ];
    if (snapshot.scope === "job_description") {
      filters.push(
        snapshot.jobDescriptionIds.length > 0
          ? inArray(studioInterview.jobDescriptionId, snapshot.jobDescriptionIds)
          : sql`false`,
      );
    }
    const applicable = await this.database
      .select({ id: studioInterview.id })
      .from(studioInterview)
      .where(and(...filters));
    const ids = [...new Set([...bound, ...applicable].map((row) => row.id))];

    let refreshedCount = 0;
    for (const interviewRecordId of ids) {
      if (await this.refreshCommunicationQuestionRecord(interviewRecordId, input)) {
        refreshedCount += 1;
      }
    }
    return { refreshedCount, scannedCount: ids.length };
  }

  private refreshCandidateFormRecord(
    interviewRecordId: string,
    input: Parameters<CandidateSetupRefreshCommands["refreshCandidateForms"]>[0],
  ) {
    return this.database.transaction(async (transaction) => {
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
        return false;
      }
      const forms = active.payload.forms.filter(
        (form) => form.templateId !== input.version.snapshot.templateId,
      );
      forms.push({
        snapshot: input.version.snapshot,
        templateId: input.version.snapshot.templateId,
        version: input.version.version,
        versionId: input.version.id,
      });
      const payload = { ...active.payload, createdAt: new Date().toISOString(), forms };
      await this.replaceContextSnapshot(transaction, active, payload, input, {
        reason: "form_template_bulk_refresh",
        templateId: input.version.snapshot.templateId,
      });
      return true;
    });
  }

  private refreshCommunicationQuestionRecord(
    interviewRecordId: string,
    input: Parameters<CandidateSetupRefreshCommands["refreshCommunicationQuestions"]>[0],
  ) {
    return this.database.transaction(async (transaction) => {
      const { snapshot } = input.version;
      const [binding] = await transaction
        .select()
        .from(interviewQuestionTemplateBinding)
        .where(
          and(
            eq(interviewQuestionTemplateBinding.interviewRecordId, interviewRecordId),
            eq(interviewQuestionTemplateBinding.templateId, snapshot.templateId),
          ),
        )
        .limit(1)
        .for("update");
      let bindingId = binding?.id;
      let sortOrder = binding?.sortOrder;
      let bindingChanged = false;
      if (binding) {
        if (binding.versionId !== input.version.id) {
          await transaction
            .update(interviewQuestionTemplateBinding)
            .set({ versionId: input.version.id })
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
          organizationId: input.organizationId,
          sortOrder,
          templateId: snapshot.templateId,
          versionId: input.version.id,
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
        (item) => item.templateId !== snapshot.templateId,
      );
      questionTemplates.push({
        bindingId,
        disabledByUser: binding?.disabledByUser ?? false,
        scope: snapshot.scope,
        snapshot,
        sortOrder,
        templateId: snapshot.templateId,
        version: input.version.version,
        versionId: input.version.id,
      });
      questionTemplates.sort((left, right) => left.sortOrder - right.sortOrder);
      const payload = {
        ...active.payload,
        createdAt: new Date().toISOString(),
        questionTemplates,
      };
      await this.replaceContextSnapshot(transaction, active, payload, input, {
        reason: "interview_question_template_bulk_refresh",
        templateId: snapshot.templateId,
      });
      return true;
    });
  }

  private async replaceContextSnapshot(
    transaction: Parameters<Parameters<Database["transaction"]>[0]>[0],
    active: typeof interviewContextSnapshot.$inferSelect,
    payload: typeof interviewContextSnapshot.$inferSelect.payload,
    input: { operatorId: string | null; organizationId: string },
    detail: { reason: string; templateId: string },
  ) {
    const now = new Date();
    await transaction
      .update(interviewContextSnapshot)
      .set({ status: "superseded", supersededAt: now })
      .where(eq(interviewContextSnapshot.id, active.id));
    const [latest] = await transaction
      .select({ version: max(interviewContextSnapshot.version) })
      .from(interviewContextSnapshot)
      .where(eq(interviewContextSnapshot.interviewRecordId, active.interviewRecordId));
    const snapshotId = crypto.randomUUID();
    const snapshotVersion = (latest?.version ?? active.version) + 1;
    await transaction.insert(interviewContextSnapshot).values({
      contentHash: hashPayload(payload),
      createdAt: now,
      createdBy: input.operatorId,
      id: snapshotId,
      interviewRecordId: active.interviewRecordId,
      organizationId: input.organizationId,
      payload,
      reason: "manual_refresh",
      scheduleEntryId: active.scheduleEntryId,
      status: "active",
      version: snapshotVersion,
    });
    await transaction.insert(interviewAuditLog).values({
      action: "context_snapshot_refresh",
      createdAt: now,
      detail: { ...detail, snapshotId, snapshotVersion },
      id: crypto.randomUUID(),
      interviewRecordId: active.interviewRecordId,
      operatorId: input.operatorId,
      organizationId: input.organizationId,
      scheduleEntryId: active.scheduleEntryId,
    });
  }
}
