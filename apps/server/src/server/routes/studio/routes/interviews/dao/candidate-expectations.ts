import { and, eq } from "drizzle-orm";
import { lockRecruitingRecord, updateRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import type { candidateExpectationsMetaSchema } from "@app/db-schema/studio-interviews";
import type { z } from "zod";
import { db } from "../../../../../../lib/server/db/index";

/** 锁定当前招聘记录后检查阶段，并串行合并不同字段的并发修改。 */
export function updateCandidateExpectations(
  recordId: string,
  organizationId: string,
  input: Partial<z.infer<typeof candidateExpectationsMetaSchema>>,
) {
  const now = new Date();
  return db.transaction(async (tx) => {
    const record = await lockRecruitingRecord(tx, recordId, organizationId);
    if (!record) {
      return null;
    }
    const onboardingDateOnly =
      record.currentStage === "onboarding" &&
      Object.keys(input).length === 1 &&
      Object.hasOwn(input, "earliestJoiningDate");
    if (record.currentStage !== "salary_negotiation" && !onboardingDateOnly) {
      return { kind: "wrong_stage" as const };
    }
    const [existing] = await tx
      .select({
        candidateExpectationsMeta: recruitingRecordReadModel.candidateExpectationsMeta,
      })
      .from(recruitingRecordReadModel)
      .where(
        and(
          eq(recruitingRecordReadModel.id, recordId),
          eq(recruitingRecordReadModel.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!existing) {
      return null;
    }
    const next = { ...existing.candidateExpectationsMeta, ...input };
    await updateRecruitingRecords(tx, eq(recruitingRecordReadModel.id, recordId), {
      candidateExpectationsMeta: next,
      updatedAt: now,
    });
    return { data: next, kind: "saved" as const };
  });
}
