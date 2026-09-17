import { sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import type { RecruitingSearchSource, ResumeSemanticSourceType } from "@app/db-schema/schema";

/** 新数据库使用招聘记录名称；队列、Qdrant 点 ID 和既有外部 DTO 保留原身份，避免重建向量。 */
export function toRecruitingSearchSource(
  source: ResumeSemanticSourceType | RecruitingSearchSource,
): RecruitingSearchSource {
  return source === "studio_interview" ? "recruiting_record" : source;
}
export function toVectorSearchSource(
  source: ResumeSemanticSourceType | RecruitingSearchSource,
): ResumeSemanticSourceType {
  return source === "recruiting_record" ? "studio_interview" : source;
}
/** 将数据库查询结果适配为向量/外部 DTO 约定，避免把新表名称泄漏为另一套点身份。 */
export function vectorSourceColumn(column: SQLWrapper) {
  return sql<ResumeSemanticSourceType>`CASE WHEN ${column} = 'recruiting_record' THEN 'studio_interview' ELSE ${column} END`;
}
