import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, eq, exists, isNull, notExists, sql } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import {
  recruitingFormSubmission,
  candidateFormTemplate,
  candidateFormTemplateJobDescription,
  recruitingEvent,
  recruitingContextSnapshot,
  aiInterviewRound,
} from "@app/db-schema/schema";
import {
  loadActiveInterviewContextSnapshot,
  refreshInterviewContextSnapshot,
} from "../../interviews/dao/context-snapshots";

/**
 * Candidates whose AI interview rounds are all still pending (never started).
 */
function neverStartedInterviewCondition() {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(aiInterviewRound)
      .where(
        and(
          eq(aiInterviewRound.recruitingRecordId, recruitingRecordReadModel.id),
          sql`${aiInterviewRound.status} <> 'pending'`,
        ),
      ),
  );
}

function noSubmissionForTemplate(templateId: string) {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(recruitingFormSubmission)
      .where(
        and(
          eq(recruitingFormSubmission.recruitingRecordId, recruitingRecordReadModel.id),
          eq(recruitingFormSubmission.templateId, templateId),
        ),
      ),
  );
}

/**
 * Eligible = has an active context snapshot (form content is frozen there),
 * has not submitted this form, has never started an AI interview round, and
 * the form is still in scope for the candidate.
 *
 * Candidates without a snapshot are not frozen yet (launch builds one from the
 * live template), so only active-snapshot rows need bulk refresh.
 */
async function listEligibleInterviewRecordIds(
  organizationId: string,
  templateId: string,
  scope: "global" | "job_description",
): Promise<string[]> {
  const scopeFilter =
    scope === "global"
      ? sql`true`
      : exists(
          db
            .select({ one: sql`1` })
            .from(candidateFormTemplateJobDescription)
            .where(
              and(
                eq(candidateFormTemplateJobDescription.templateId, templateId),
                eq(
                  candidateFormTemplateJobDescription.jobDescriptionId,
                  recruitingRecordReadModel.jobDescriptionId,
                ),
              ),
            ),
        );

  const rows = await db
    .selectDistinct({ id: recruitingRecordReadModel.id })
    .from(recruitingRecordReadModel)
    .innerJoin(
      recruitingContextSnapshot,
      and(
        eq(recruitingContextSnapshot.recruitingRecordId, recruitingRecordReadModel.id),
        eq(recruitingContextSnapshot.status, "active"),
      ),
    )
    .where(
      and(
        eq(recruitingRecordReadModel.organizationId, organizationId),
        sql`${recruitingRecordReadModel.pipelineStage} <> 'closed'`,
        neverStartedInterviewCondition(),
        noSubmissionForTemplate(templateId),
        scopeFilter,
      ),
    );

  return rows.map((row) => row.id);
}

/**
 * Rebuild context snapshots for never-started candidates who still need to fill
 * this form, so the next open uses the latest form version.
 */
export async function refreshEligibleCandidatesForFormTemplate(options: {
  organizationId: string;
  operatorId: string | null;
  templateId: string;
}): Promise<{ refreshedCount: number; scannedCount: number }> {
  const [template] = await db
    .select({
      id: candidateFormTemplate.id,
      scope: candidateFormTemplate.scope,
    })
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

  const interviewRecordIds = await listEligibleInterviewRecordIds(
    options.organizationId,
    options.templateId,
    template.scope,
  );

  let refreshedCount = 0;
  const now = new Date();
  for (const interviewRecordId of interviewRecordIds) {
    const didRefresh = await db.transaction(async (tx) => {
      const active = await loadActiveInterviewContextSnapshot(interviewRecordId);
      if (!active) {
        return false;
      }
      const refreshed = await refreshInterviewContextSnapshot(tx, {
        createdAt: now,
        createdBy: options.operatorId,
        interviewRecordId,
        reason: "manual_refresh",
        scheduleEntryId: active.scheduleEntryId,
      });
      await tx.insert(recruitingEvent).values({
        action: "context_snapshot_refresh",
        aiRoundId: active.scheduleEntryId,
        createdAt: now,
        detail: {
          reason: "form_template_bulk_refresh",
          snapshotId: refreshed.id,
          snapshotVersion: refreshed.version,
          templateId: options.templateId,
        },
        id: crypto.randomUUID(),
        operatorId: options.operatorId,
        organizationId: options.organizationId,
        recruitingRecordId: interviewRecordId,
      });
      return true;
    });
    if (didRefresh) {
      refreshedCount += 1;
    }
  }

  return { refreshedCount, scannedCount: interviewRecordIds.length };
}
