import { deleteRecruitingSnapshotObject } from "@app/object-storage";
import { initialInterviewSnapshotSchema } from "@app/shared/human-initial-interview";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import {
  recruitingEvent,
  recruitingNodeState,
  recruitingRecord,
  recruitingInitialInterview,
  recruitingInitialInterviewVersion,
  recruitingEvaluationDocument,
  humanInterviewRound,
} from "@app/db-schema/schema";
import { db } from "../../../../../../../../lib/server/db";
import { initialInterviewRecordScope, withInitialInterviewLock } from "../dao";
import type { InitialInterviewScope } from "../dao";
import { InitialInterviewError } from "../errors";

export async function canDeleteInitialInterview(
  scope: InitialInterviewScope,
  database: Pick<typeof db, "select"> = db,
) {
  const [events, nodes, rounds, records] = await Promise.all([
    database
      .select({ id: recruitingEvent.id })
      .from(recruitingEvent)
      .where(
        and(
          eq(recruitingEvent.recruitingRecordId, scope.recruitingRecordId),
          eq(recruitingEvent.organizationId, scope.organizationId),
          or(
            inArray(recruitingEvent.fromStage, ["second_interview", "final_interview"]),
            inArray(recruitingEvent.toStage, ["second_interview", "final_interview"]),
          ),
        ),
      )
      .limit(1),
    database
      .select({ node: recruitingNodeState.node })
      .from(recruitingNodeState)
      .where(
        and(
          eq(recruitingNodeState.recruitingRecordId, scope.recruitingRecordId),
          eq(recruitingNodeState.organizationId, scope.organizationId),
          inArray(recruitingNodeState.node, ["second_interview", "final_interview"]),
          isNotNull(recruitingNodeState.enteredAt),
        ),
      )
      .limit(1),
    database
      .select({ id: humanInterviewRound.id })
      .from(humanInterviewRound)
      .where(
        and(
          eq(humanInterviewRound.recruitingRecordId, scope.recruitingRecordId),
          eq(humanInterviewRound.organizationId, scope.organizationId),
        ),
      )
      .limit(1),
    database
      .select({
        closedFromNode: recruitingRecord.closedFromNode,
        stage: recruitingRecord.currentStage,
      })
      .from(recruitingRecord)
      .where(
        and(
          eq(recruitingRecord.id, scope.recruitingRecordId),
          eq(recruitingRecord.organizationId, scope.organizationId),
        ),
      )
      .limit(1),
  ]);
  const [record] = records;
  return Boolean(
    record &&
    ["screening", "ai_interview", "closed"].includes(record.stage) &&
    (!record.closedFromNode || ["screening", "ai_interview"].includes(record.closedFromNode)) &&
    !events.length &&
    !nodes.length &&
    !rounds.length,
  );
}

export async function deleteInitialInterview(
  input: InitialInterviewScope & { initialInterviewId: string; actorId: string },
) {
  const deleted = await withInitialInterviewLock(input, () =>
    db.transaction(async (tx) => {
      const recordScope = and(
        eq(recruitingRecord.id, input.recruitingRecordId),
        eq(recruitingRecord.organizationId, input.organizationId),
      );
      const [record] = await tx.select().from(recruitingRecord).where(recordScope).for("update");
      if (!record) {
        throw new InitialInterviewError("招聘记录不存在。", 404);
      }
      if (!(await canDeleteInitialInterview(input, tx))) {
        throw new InitialInterviewError("曾进入真人复面的招聘记录不能删除人工初面资料。");
      }
      const [source] = await tx
        .select()
        .from(recruitingInitialInterview)
        .where(
          and(
            initialInterviewRecordScope(recruitingInitialInterview, input),
            eq(recruitingInitialInterview.id, input.initialInterviewId),
          ),
        );
      if (!source) {
        throw new InitialInterviewError("人工初面记录不存在。", 404);
      }
      const versions = await tx
        .select()
        .from(recruitingInitialInterviewVersion)
        .where(
          and(
            initialInterviewRecordScope(recruitingInitialInterviewVersion, input),
            eq(recruitingInitialInterviewVersion.initialInterviewId, source.id),
          ),
        );
      if (versions.length) {
        await tx
          .update(recruitingNodeState)
          .set({
            completedAt: null,
            decidedAt: null,
            decidedBy: null,
            effectiveInitialInterviewVersionId: null,
            result: null,
            status: "pending",
          })
          .where(
            and(
              eq(recruitingNodeState.recruitingRecordId, input.recruitingRecordId),
              eq(recruitingNodeState.organizationId, input.organizationId),
              inArray(
                recruitingNodeState.effectiveInitialInterviewVersionId,
                versions.map((version) => version.id),
              ),
            ),
          );
      }
      await tx
        .delete(recruitingInitialInterview)
        .where(eq(recruitingInitialInterview.id, source.id));
      const remaining = await tx
        .select({ id: recruitingInitialInterview.id })
        .from(recruitingInitialInterview)
        .where(initialInterviewRecordScope(recruitingInitialInterview, input))
        .limit(1);
      // Only detach a document created by this recording; shared pre-existing documents remain associated.
      const createdDocumentIds = versions.flatMap((version) =>
        version.documentId && !version.overwriteDocumentId ? [version.documentId] : [],
      );
      if (!remaining.length && createdDocumentIds.length) {
        await tx
          .delete(recruitingEvaluationDocument)
          .where(
            and(
              eq(recruitingEvaluationDocument.recruitingRecordId, input.recruitingRecordId),
              eq(recruitingEvaluationDocument.organizationId, input.organizationId),
              inArray(recruitingEvaluationDocument.documentId, createdDocumentIds),
            ),
          );
      }
      await tx
        .update(recruitingRecord)
        .set({ updatedAt: new Date(), version: sql`${recruitingRecord.version} + 1` })
        .where(recordScope);
      await tx.insert(recruitingEvent).values({
        action: "delete_initial_interview",
        detail: { initialInterviewId: source.id },
        id: crypto.randomUUID(),
        operatorId: input.actorId,
        organizationId: input.organizationId,
        recruitingRecordId: input.recruitingRecordId,
      });
      return { id: source.id, snapshot: initialInterviewSnapshotSchema.parse(source.snapshot) };
    }),
  );
  const cleanup = await Promise.allSettled([
    deleteRecruitingSnapshotObject(deleted.snapshot.recording.storageKey),
    ...(deleted.snapshot.resume
      ? [deleteRecruitingSnapshotObject(deleted.snapshot.resume.storageKey)]
      : []),
  ]);
  if (cleanup.some((result) => result.status === "rejected")) {
    console.error("[initial-interview] snapshot object cleanup failed", {
      initialInterviewId: deleted.id,
    });
  }
  return { id: deleted.id };
}
