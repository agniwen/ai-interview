import { and, eq, isNull } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { interviewAuditLog, studioInterview } from "@arc/db-schema/schema";
import type { ResumeEvaluationStatus } from "@arc/shared/studio-resumes";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ResumeEvaluationMutationResult =
  | { status: "updated"; currentStatus: ResumeEvaluationStatus | null }
  | { status: "unchanged"; currentStatus: ResumeEvaluationStatus | null }
  | { status: "already_evaluated"; currentStatus: ResumeEvaluationStatus | null }
  | { status: "not_found" };

async function insertEvaluationAudit(
  tx: Tx,
  input: {
    action: "resume_evaluation_submitted" | "resume_evaluation_updated";
    fromStatus: ResumeEvaluationStatus | null;
    interviewRecordId: string;
    operatorId: string | null;
    organizationId: string;
    toStatus: ResumeEvaluationStatus | null;
  },
) {
  await tx.insert(interviewAuditLog).values({
    action: input.action,
    createdAt: new Date(),
    detail: {
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
    },
    id: crypto.randomUUID(),
    interviewRecordId: input.interviewRecordId,
    operatorId: input.operatorId,
    organizationId: input.organizationId,
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
    if (existing.resumeEvaluationStatus === input.status) {
      return { currentStatus: input.status, status: "unchanged" };
    }

    await tx
      .update(studioInterview)
      .set({
        resumeEvaluationStatus: input.status,
        updatedAt: now,
      })
      .where(
        and(
          eq(studioInterview.id, input.id),
          eq(studioInterview.organizationId, input.organizationId),
        ),
      );

    await insertEvaluationAudit(tx, {
      action: "resume_evaluation_updated",
      fromStatus: existing.resumeEvaluationStatus,
      interviewRecordId: input.id,
      operatorId: input.operatorId,
      organizationId: input.organizationId,
      toStatus: input.status,
    });

    return { currentStatus: input.status, status: "updated" };
  });
}
