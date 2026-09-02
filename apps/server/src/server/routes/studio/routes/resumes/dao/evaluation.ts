import { and, eq, isNull } from "drizzle-orm";
import { db } from "@server/lib/server/db/index";
import { interviewAuditLog, studioInterview } from "@app/db-schema/schema";
import type { ResumeEvaluationStatus } from "@app/shared/studio-resumes";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ResumeEvaluationMutationResult =
  | { status: "updated"; currentStatus: ResumeEvaluationStatus | null }
  | { status: "unchanged"; currentStatus: ResumeEvaluationStatus | null }
  | { status: "already_evaluated"; currentStatus: ResumeEvaluationStatus | null }
  | { status: "not_found" };

async function insertEvaluationAudit(
  tx: Tx,
  input: {
    action:
      | "resume_evaluation_reset_for_job_change"
      | "resume_evaluation_submitted"
      | "resume_evaluation_updated";
    fromStatus: ResumeEvaluationStatus | null;
    interviewRecordId: string;
    nextJobDescriptionId?: string | null;
    operatorId: string | null;
    organizationId: string;
    previousJobDescriptionId?: string | null;
    reason?: string;
    toStatus: ResumeEvaluationStatus | null;
  },
) {
  await tx.insert(interviewAuditLog).values({
    action: input.action,
    createdAt: new Date(),
    detail: {
      fromStatus: input.fromStatus,
      nextJobDescriptionId: input.nextJobDescriptionId,
      previousJobDescriptionId: input.previousJobDescriptionId,
      reason: input.reason,
      toStatus: input.toStatus,
    },
    id: crypto.randomUUID(),
    interviewRecordId: input.interviewRecordId,
    operatorId: input.operatorId,
    organizationId: input.organizationId,
  });
}

export async function setResumeEvaluationStatusWithAuditTx(
  tx: Tx,
  input: {
    auditLogId?: string;
    auditUnchanged?: boolean;
    currentStatus: ResumeEvaluationStatus | null;
    id: string;
    now: Date;
    operatorId: string | null;
    organizationId: string;
    status: ResumeEvaluationStatus | null;
  },
): Promise<ResumeEvaluationMutationResult> {
  if (input.currentStatus === input.status && !input.auditUnchanged) {
    return { currentStatus: input.status, status: "unchanged" };
  }

  await tx
    .update(studioInterview)
    .set({
      resumeEvaluationStatus: input.status,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(studioInterview.id, input.id),
        eq(studioInterview.organizationId, input.organizationId),
      ),
    );

  await tx.insert(interviewAuditLog).values({
    action:
      input.currentStatus === null ? "resume_evaluation_submitted" : "resume_evaluation_updated",
    createdAt: input.now,
    detail: {
      fromStatus: input.currentStatus,
      toStatus: input.status,
    },
    id: input.auditLogId ?? crypto.randomUUID(),
    interviewRecordId: input.id,
    operatorId: input.operatorId,
    organizationId: input.organizationId,
  });

  return { currentStatus: input.status, status: "updated" };
}

export async function resetResumeEvaluationForJobChange(input: {
  id: string;
  nextJobDescriptionId: string | null;
  operatorId: string | null;
  organizationId: string;
  previousJobDescriptionId: string | null;
  previousStatus: ResumeEvaluationStatus;
}): Promise<ResumeEvaluationMutationResult> {
  const now = new Date();
  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ resumeEvaluationStatus: studioInterview.resumeEvaluationStatus })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, input.id),
          eq(studioInterview.organizationId, input.organizationId),
        ),
      )
      .for("update")
      .limit(1);

    if (!existing) {
      return { status: "not_found" };
    }
    if (!existing.resumeEvaluationStatus) {
      return { currentStatus: null, status: "unchanged" };
    }

    await tx
      .update(studioInterview)
      .set({
        resumeEvaluationStatus: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(studioInterview.id, input.id),
          eq(studioInterview.organizationId, input.organizationId),
        ),
      );

    await insertEvaluationAudit(tx, {
      action: "resume_evaluation_reset_for_job_change",
      fromStatus: existing.resumeEvaluationStatus,
      interviewRecordId: input.id,
      nextJobDescriptionId: input.nextJobDescriptionId,
      operatorId: input.operatorId,
      organizationId: input.organizationId,
      previousJobDescriptionId: input.previousJobDescriptionId,
      reason: "岗位变更后需重新评估",
      toStatus: null,
    });

    return { currentStatus: null, status: "updated" };
  });
}

export async function submitResumeEvaluationOnce(input: {
  id: string;
  operatorId: string | null;
  organizationId: string;
  status: ResumeEvaluationStatus;
}): Promise<ResumeEvaluationMutationResult> {
  const now = new Date();
  return await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(studioInterview)
      .set({
        resumeEvaluationStatus: input.status,
        updatedAt: now,
      })
      .where(
        and(
          eq(studioInterview.id, input.id),
          eq(studioInterview.organizationId, input.organizationId),
          isNull(studioInterview.resumeEvaluationStatus),
        ),
      )
      .returning({ id: studioInterview.id });

    if (!updated) {
      const [existing] = await tx
        .select({ resumeEvaluationStatus: studioInterview.resumeEvaluationStatus })
        .from(studioInterview)
        .where(
          and(
            eq(studioInterview.id, input.id),
            eq(studioInterview.organizationId, input.organizationId),
          ),
        )
        .limit(1);
      if (!existing) {
        return { status: "not_found" };
      }
      return {
        currentStatus: existing.resumeEvaluationStatus,
        status: "already_evaluated",
      };
    }

    await insertEvaluationAudit(tx, {
      action: "resume_evaluation_submitted",
      fromStatus: null,
      interviewRecordId: input.id,
      operatorId: input.operatorId,
      organizationId: input.organizationId,
      toStatus: input.status,
    });

    return { currentStatus: input.status, status: "updated" };
  });
}

export async function updateResumeEvaluationStatus(input: {
  id: string;
  operatorId: string | null;
  organizationId: string;
  status: ResumeEvaluationStatus | null;
}): Promise<ResumeEvaluationMutationResult> {
  const now = new Date();
  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ resumeEvaluationStatus: studioInterview.resumeEvaluationStatus })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, input.id),
          eq(studioInterview.organizationId, input.organizationId),
        ),
      )
      .limit(1);

    if (!existing) {
      return { status: "not_found" };
    }
    return setResumeEvaluationStatusWithAuditTx(tx, {
      currentStatus: existing.resumeEvaluationStatus,
      id: input.id,
      now,
      operatorId: input.operatorId,
      organizationId: input.organizationId,
      status: input.status,
    });
  });
}
