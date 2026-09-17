import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, eq, inArray } from "drizzle-orm";
import type { RecruitingVisibilityScope } from "../../../../access/recruiting-visibility";
import { db } from "../../../../../lib/server/db/index";

export async function loadResumeRecordFocus(input: {
  organizationId: string;
  resumeRecordId: string;
  visibilityScope: RecruitingVisibilityScope;
}): Promise<{ id: string } | null> {
  if (input.visibilityScope.kind === "none") {
    return null;
  }
  const visibilityCondition =
    input.visibilityScope.kind === "restricted"
      ? inArray(recruitingRecordReadModel.createdBy, input.visibilityScope.userIds)
      : undefined;
  const [row] = await db
    .select({ id: recruitingRecordReadModel.id })
    .from(recruitingRecordReadModel)
    .where(
      and(
        eq(recruitingRecordReadModel.id, input.resumeRecordId),
        eq(recruitingRecordReadModel.organizationId, input.organizationId),
        visibilityCondition,
      ),
    )
    .limit(1);
  return row ?? null;
}
