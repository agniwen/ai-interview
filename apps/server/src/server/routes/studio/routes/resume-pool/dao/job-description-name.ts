import { and, eq } from "drizzle-orm";
import { db } from "@app/server/lib/server/db";
import { jobDescription } from "@arc/db-schema/schema";

/**
 * 取简历绑定岗位的名称，按组织隔离：只有当岗位属于该组织时才返回名字，
 * 否则返回 null（未绑定或岗位不在本组织），与列表查询的 org-scoped join 保持一致。
 */
export async function loadBoundJobDescriptionName(
  jobDescriptionId: string | null,
  organizationId: string,
): Promise<string | null> {
  if (!jobDescriptionId) {
    return null;
  }
  const [row] = await db
    .select({ name: jobDescription.name })
    .from(jobDescription)
    .where(
      and(
        eq(jobDescription.id, jobDescriptionId),
        eq(jobDescription.organizationId, organizationId),
        eq(jobDescription.lifecycleStatus, "published"),
      ),
    )
    .limit(1);
  return row?.name ?? null;
}
