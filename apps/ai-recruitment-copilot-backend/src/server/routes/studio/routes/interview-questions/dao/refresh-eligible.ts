import { and, desc, eq, exists, isNull, notExists, sql } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  interviewAuditLog,
  interviewQuestionTemplate,
  interviewQuestionTemplateBinding,
  interviewQuestionTemplateJobDescription,
  studioInterview,
  studioInterviewSchedule,
} from "@arc/db-schema/schema";
import {
  loadActiveInterviewContextSnapshot,
  refreshInterviewContextSnapshot,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/context-snapshots";
import { resolveOrCreateInterviewQuestionTemplateVersion } from "./versions";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Candidates whose AI interview rounds are all still pending (never started).
 * Used so we never rewrite frozen question snapshots mid-session.
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

async function listEligibleInterviewRecordIds(
  organizationId: string,
  templateId: string,
  scope: "global" | "job_description",
): Promise<string[]> {
  // Prefer candidates that already carry a binding for this template — they are
  // the ones frozen to an older version when the template was later edited.
  const bound = await db
    .selectDistinct({ interviewRecordId: interviewQuestionTemplateBinding.interviewRecordId })
    .from(interviewQuestionTemplateBinding)
    .innerJoin(
      studioInterview,
      eq(interviewQuestionTemplateBinding.interviewRecordId, studioInterview.id),
    )
    .where(
      and(
        eq(interviewQuestionTemplateBinding.templateId, templateId),
        eq(studioInterview.organizationId, organizationId),
        sql`${studioInterview.pipelineStage} <> 'closed'`,
        neverStartedInterviewCondition(),
      ),
    );

  const ids = new Set(bound.map((row) => row.interviewRecordId));

  // Also pick up never-started candidates that are in scope but not yet bound.
  const applicableFilters = [
    eq(studioInterview.organizationId, organizationId),
    sql`${studioInterview.pipelineStage} <> 'closed'`,
    neverStartedInterviewCondition(),
  ];
  if (scope === "job_description") {
    applicableFilters.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(interviewQuestionTemplateJobDescription)
          .where(
            and(
              eq(interviewQuestionTemplateJobDescription.templateId, templateId),
              eq(
                interviewQuestionTemplateJobDescription.jobDescriptionId,
                studioInterview.jobDescriptionId,
              ),
            ),
          ),
      ),
    );
  }

  const applicable = await db
    .select({ id: studioInterview.id })
    .from(studioInterview)
    .where(and(...applicableFilters));

  for (const row of applicable) {
    ids.add(row.id);
  }

  return [...ids];
}

async function refreshOneCandidate(
  tx: Tx,
  options: {
    interviewRecordId: string;
    organizationId: string;
    templateId: string;
    operatorId: string | null;
    now: Date;
  },
): Promise<"refreshed" | "noop"> {
  const latest = await resolveOrCreateInterviewQuestionTemplateVersion(tx, options.templateId);

  const [binding] = await tx
    .select({
      id: interviewQuestionTemplateBinding.id,
      versionId: interviewQuestionTemplateBinding.versionId,
    })
    .from(interviewQuestionTemplateBinding)
    .where(
      and(
        eq(interviewQuestionTemplateBinding.interviewRecordId, options.interviewRecordId),
        eq(interviewQuestionTemplateBinding.templateId, options.templateId),
      ),
    )
    .limit(1);

  let bindingChanged = false;
  if (binding) {
    if (binding.versionId !== latest.id) {
      await tx
        .update(interviewQuestionTemplateBinding)
        .set({ versionId: latest.id })
        .where(eq(interviewQuestionTemplateBinding.id, binding.id));
      bindingChanged = true;
    }
  } else {
    const [maxRow] = await tx
      .select({ maxOrder: interviewQuestionTemplateBinding.sortOrder })
      .from(interviewQuestionTemplateBinding)
      .where(eq(interviewQuestionTemplateBinding.interviewRecordId, options.interviewRecordId))
      .orderBy(desc(interviewQuestionTemplateBinding.sortOrder))
      .limit(1);
    await tx.insert(interviewQuestionTemplateBinding).values({
      createdAt: options.now,
      disabledByUser: false,
      id: crypto.randomUUID(),
      interviewRecordId: options.interviewRecordId,
      organizationId: options.organizationId,
      sortOrder: (maxRow?.maxOrder ?? -1) + 1,
      templateId: options.templateId,
      versionId: latest.id,
    });
    bindingChanged = true;
  }

  const active = await loadActiveInterviewContextSnapshot(options.interviewRecordId);
  if (!active) {
    return bindingChanged ? "refreshed" : "noop";
  }

  // Rebuild the frozen runtime snapshot so LiveKit dispatch reads the new version.
  // manual_refresh also re-resolves every binding/form to latest content.
  const refreshed = await refreshInterviewContextSnapshot(tx, {
    createdAt: options.now,
    createdBy: options.operatorId,
    interviewRecordId: options.interviewRecordId,
    reason: "manual_refresh",
    scheduleEntryId: active.scheduleEntryId,
  });

  await tx.insert(interviewAuditLog).values({
    action: "context_snapshot_refresh",
    createdAt: options.now,
    detail: {
      reason: "interview_question_template_bulk_refresh",
      snapshotId: refreshed.id,
      snapshotVersion: refreshed.version,
      templateId: options.templateId,
    },
    id: crypto.randomUUID(),
    interviewRecordId: options.interviewRecordId,
    operatorId: options.operatorId,
    organizationId: options.organizationId,
    scheduleEntryId: active.scheduleEntryId,
  });

  return "refreshed";
}

/**
 * Push the latest version of one communication-question template onto every
 * never-started candidate that is already bound to it or still in scope.
 */
export async function refreshEligibleCandidatesForInterviewQuestionTemplate(options: {
  organizationId: string;
  operatorId: string | null;
  templateId: string;
}): Promise<{ refreshedCount: number; scannedCount: number }> {
  const [template] = await db
    .select({
      id: interviewQuestionTemplate.id,
      scope: interviewQuestionTemplate.scope,
    })
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

  const interviewRecordIds = await listEligibleInterviewRecordIds(
    options.organizationId,
    options.templateId,
    template.scope,
  );

  let refreshedCount = 0;
  const now = new Date();
  for (const interviewRecordId of interviewRecordIds) {
    const result = await db.transaction(
      async (tx) =>
        await refreshOneCandidate(tx, {
          interviewRecordId,
          now,
          operatorId: options.operatorId,
          organizationId: options.organizationId,
          templateId: options.templateId,
        }),
    );
    if (result === "refreshed") {
      refreshedCount += 1;
    }
  }

  return { refreshedCount, scannedCount: interviewRecordIds.length };
}
