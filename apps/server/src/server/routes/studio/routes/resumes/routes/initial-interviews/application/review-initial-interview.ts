import { and, eq } from "drizzle-orm";
import { recruitingInitialInterviewVersion } from "@app/db-schema/schema";
import {
  transitionRecruitingNodeTx,
  updateRecruitingNodeTx,
} from "@app/database/recruiting-pipeline";
import { db } from "../../../../../../../../lib/server/db";
import type { InitialInterviewScope } from "../dao";
import { InitialInterviewError } from "../errors";

export function reviewInitialInterview(
  input: InitialInterviewScope & {
    versionId: string;
    actorId: string;
    expectedVersion: number;
  },
) {
  return db.transaction(async (tx) => {
    const [version] = await tx
      .select({ id: recruitingInitialInterviewVersion.id })
      .from(recruitingInitialInterviewVersion)
      .where(
        and(
          eq(recruitingInitialInterviewVersion.id, input.versionId),
          eq(recruitingInitialInterviewVersion.organizationId, input.organizationId),
          eq(recruitingInitialInterviewVersion.recruitingRecordId, input.recruitingRecordId),
          eq(recruitingInitialInterviewVersion.status, "ready"),
        ),
      );
    if (!version) {
      throw new InitialInterviewError("请等待人工初面评价表生成成功后再进入真人复面。");
    }
    const command = {
      expectedVersion: input.expectedVersion,
      operatorId: input.actorId,
      organizationId: input.organizationId,
      recordId: input.recruitingRecordId,
    };
    const completed = await updateRecruitingNodeTx(tx, {
      ...command,
      effectiveAiRoundId: null,
      effectiveInitialInterviewVersionId: version.id,
      node: "ai_interview",
      reason: "HR 根据人工初面评价确认通过",
      result: "pass",
      status: "completed",
    });
    return transitionRecruitingNodeTx(tx, {
      ...command,
      expectedVersion: completed.version,
      targetNode: "second_interview",
    });
  });
}
