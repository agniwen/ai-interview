// 中文：列出 HR 可见的 JD（首版策略：全量，按最新创建排序，最多 10 条）
// English: list JDs visible to HR. v1 policy: all, newest first, capped at 10.
// Future: filter by createdBy === userId OR department in HR's departments.
import type { JobDescriptionListRecord } from "@/lib/job-descriptions";
import { listAllJobDescriptions } from "@/server/queries/job-descriptions";

export const JD_PICKER_LIMIT = 10;

export async function listJobDescriptionsForHr(
  _userId: string,
): Promise<{ records: JobDescriptionListRecord[]; truncated: boolean }> {
  const all = await listAllJobDescriptions();
  // 中文：按 createdAt 倒序；后端默认按 name 升序，HR 选择器需要最新优先
  // English: sort newest-first; the underlying helper sorts by name asc which
  // is wrong for an HR picker (newest JDs are most likely targets)
  const sorted = [...all].toSorted((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
  return {
    records: sorted.slice(0, JD_PICKER_LIMIT),
    truncated: sorted.length > JD_PICKER_LIMIT,
  };
}
