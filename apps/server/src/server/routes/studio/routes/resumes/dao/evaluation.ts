import { updateRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import { recruitingEvent } from "@app/db-schema/schema";
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
  await tx.insert(recruitingEvent).values({
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
    operatorId: input.operatorId,
    organizationId: input.organizationId,
    recruitingRecordId: input.interviewRecordId,
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

  await updateRecruitingRecords(
    tx,
    and(
      eq(recruitingRecordReadModel.id, input.id),
      eq(recruitingRecordReadModel.organizationId, input.organizationId),
    ),
    {
      resumeEvaluationStatus: input.status,
      updatedAt: input.now,
    },
  );

  await tx.insert(recruitingEvent).values({
    action:
      input.currentStatus === null ? "resume_evaluation_submitted" : "resume_evaluation_updated",
    createdAt: input.now,
    detail: {
      fromStatus: input.currentStatus,
      toStatus: input.status,
    },
    id: input.auditLogId ?? crypto.randomUUID(),
    operatorId: input.operatorId,
    organizationId: input.organizationId,
    recruitingRecordId: input.id,
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
      .select({ resumeEvaluationStatus: recruitingRecordReadModel.resumeEvaluationStatus })
      .from(recruitingRecordReadModel)
      .where(
        and(
          eq(recruitingRecordReadModel.id, input.id),
          eq(recruitingRecordReadModel.organizationId, input.organizationId),
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

    await updateRecruitingRecords(
      tx,
      and(
        eq(recruitingRecordReadModel.id, input.id),
        eq(recruitingRecordReadModel.organizationId, input.organizationId),
      ),
      {
        resumeEvaluationStatus: null,
        updatedAt: now,
      },
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
    const [updated] = await updateRecruitingRecords(
      tx,
      and(
        eq(recruitingRecordReadModel.id, input.id),
        eq(recruitingRecordReadModel.organizationId, input.organizationId),
        isNull(recruitingRecordReadModel.resumeEvaluationStatus),
      ),
      {
        resumeEvaluationStatus: input.status,
        updatedAt: now,
      },
    );

    if (!updated) {
      const [existing] = await tx
        .select({ resumeEvaluationStatus: recruitingRecordReadModel.resumeEvaluationStatus })
        .from(recruitingRecordReadModel)
        .where(
          and(
            eq(recruitingRecordReadModel.id, input.id),
            eq(recruitingRecordReadModel.organizationId, input.organizationId),
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
      .select({ resumeEvaluationStatus: recruitingRecordReadModel.resumeEvaluationStatus })
      .from(recruitingRecordReadModel)
      .where(
        and(
          eq(recruitingRecordReadModel.id, input.id),
          eq(recruitingRecordReadModel.organizationId, input.organizationId),
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
