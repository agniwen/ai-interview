import { and, eq } from "drizzle-orm";
import { recruitingEvent, recruitingRecord } from "@app/db-schema/schema";
import { humanInterviewQuestionEditSchema } from "@app/shared/human-interview-candidate-materials";
import type { HumanInterviewQuestionEdit } from "@app/shared/human-interview-candidate-materials";
import { db } from "../../../../../lib/server/db/index";
import type { HumanInterviewCandidateMaterialsScope } from "./dao";

export type QuestionTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const questionProgressAction = "human_interview.question_asked_changed";

export async function loadQuestionHistory(
  input: { candidateId: string; scope: HumanInterviewCandidateMaterialsScope },
  executor: Pick<QuestionTransaction, "select"> = db,
): Promise<HumanInterviewQuestionEdit[]> {
  const rows = await executor
    .select()
    .from(recruitingEvent)
    .where(
      and(
        eq(recruitingEvent.recruitingRecordId, input.candidateId),
        eq(recruitingEvent.organizationId, input.scope.organizationId),
        eq(recruitingEvent.action, questionProgressAction),
      ),
    );
  return rows
    .map((row) => ({
      ...humanInterviewQuestionEditSchema.parse(row.detail),
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      operatorId: row.operatorId,
    }))
    .toSorted((a, b) => b.sequence - a.sequence);
}

export async function lockQuestionCandidate(
  tx: QuestionTransaction,
  candidateId: string,
  organizationId: string,
) {
  const [row] = await tx
    .select({ id: recruitingRecord.id })
    .from(recruitingRecord)
    .where(
      and(
        eq(recruitingRecord.id, candidateId),
        eq(recruitingRecord.organizationId, organizationId),
      ),
    )
    .for("update");
  return Boolean(row);
}

export async function appendQuestionEdit(
  tx: QuestionTransaction,
  input: {
    candidateId: string;
    scope: HumanInterviewCandidateMaterialsScope;
    edit: HumanInterviewQuestionEdit;
  },
) {
  const { id, operatorId, createdAt, ...detail } = input.edit;
  await tx.insert(recruitingEvent).values({
    action: questionProgressAction,
    createdAt: new Date(createdAt),
    detail,
    id,
    operatorId,
    organizationId: input.scope.organizationId,
    recruitingRecordId: input.candidateId,
  });
}
