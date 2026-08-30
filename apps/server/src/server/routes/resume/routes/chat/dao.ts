import { and, eq, inArray } from "drizzle-orm";
import type { RecruitingVisibilityScope } from "@app/server/server/access/recruiting-visibility";
import { db } from "@app/server/lib/server/db";
import { studioInterview } from "@arc/db-schema/schema";

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
      ? inArray(studioInterview.createdBy, input.visibilityScope.userIds)
      : undefined;
  const [row] = await db
    .select({ id: studioInterview.id })
    .from(studioInterview)
    .where(
      and(
        eq(studioInterview.id, input.resumeRecordId),
        eq(studioInterview.organizationId, input.organizationId),
        visibilityCondition,
      ),
    )
    .limit(1);
  return row ?? null;
}
