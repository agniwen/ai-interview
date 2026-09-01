import { and, eq, exists, isNull, notExists, sql } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import {
  candidateFormSubmission,
  candidateFormTemplate,
  candidateFormTemplateJobDescription,
  interviewAuditLog,
  interviewContextSnapshot,
  studioInterview,
  studioInterviewSchedule,
} from "@arc/db-schema/schema";
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
      .from(studioInterviewSchedule)
      .where(
        and(
          eq(studioInterviewSchedule.interviewRecordId, studioInterview.id),
          sql`${studioInterviewSchedule.status} <> 'pending'`,
        ),
      ),
  );
}

function noSubmissionForTemplate(templateId: string) {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(candidateFormSubmission)
      .where(
        and(
          eq(candidateFormSubmission.interviewRecordId, studioInterview.id),
          eq(candidateFormSubmission.templateId, templateId),
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
                  studioInterview.jobDescriptionId,
                ),
              ),
            ),
        );

  const rows = await db
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
        eq(studioInterview.organizationId, organizationId),
        sql`${studioInterview.pipelineStage} <> 'closed'`,
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
      await tx.insert(interviewAuditLog).values({
        action: "context_snapshot_refresh",
        createdAt: now,
        detail: {
          reason: "form_template_bulk_refresh",
          snapshotId: refreshed.id,
          snapshotVersion: refreshed.version,
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
    if (didRefresh) {
      refreshedCount += 1;
    }
  }

  return { refreshedCount, scannedCount: interviewRecordIds.length };
}
