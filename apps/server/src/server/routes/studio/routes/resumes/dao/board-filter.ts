import { recruitingRecordReadModel as record } from "@app/database/recruiting-read-model";
import { recruitingEvent } from "@app/db-schema/schema";
import { resolveRecruitingBoardFilterView } from "@app/shared/recruiting-board";
import type { RecruitingBoardStageView, RecruitingBoardView } from "@app/shared/recruiting-board";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

// 已结束记录仍归属结束前的环节，子标签和总数共用同一个 SQL 条件。
const originNode = sql<string>`CASE WHEN ${record.pipelineStage} = 'closed' THEN ${record.closedFromNode} ELSE ${record.pipelineStage} END`;
const salaryFailure = eq(record.closeReason, "salary_disagreement");
// 结束是结果，不是发 Offer 的进度；旧记录从关闭事件中的原节点快照恢复归属。
const offerProgress = sql<string>`CASE WHEN ${record.pipelineStage} = 'closed' THEN COALESCE(
  ${record.closeDetails} ->> 'previousNodeStatus',
  (SELECT previous_node ->> 'status'
   FROM ${recruitingEvent}, jsonb_array_elements(COALESCE(${recruitingEvent.detail} -> 'previousNodes', '[]'::jsonb)) previous_node
   WHERE ${recruitingEvent.recruitingRecordId} = ${record.id}
     AND ${recruitingEvent.organizationId} = ${record.organizationId}
     AND ${recruitingEvent.action} = 'recruiting_closed'
     AND previous_node ->> 'node' = 'offer'
   ORDER BY ${recruitingEvent.pipelineVersion} DESC NULLS LAST, ${recruitingEvent.createdAt} DESC
   LIMIT 1),
  'pending'
) ELSE ${record.status} END`;

const views = {
  "closed:all": eq(record.pipelineStage, "closed"),
  "closed:archived": and(eq(record.pipelineStage, "closed"), eq(record.outcome, "archived")),
  "closed:hired": and(eq(record.pipelineStage, "closed"), eq(record.outcome, "hired")),
  "closed:rejected": and(eq(record.pipelineStage, "closed"), eq(record.outcome, "rejected")),
  "closed:withdrawn": and(eq(record.pipelineStage, "closed"), eq(record.outcome, "withdrawn")),
  "interview:ai": eq(originNode, "ai_interview"),
  "interview:all": inArray(originNode, ["ai_interview", "second_interview", "final_interview"]),
  "interview:final": eq(originNode, "final_interview"),
  "interview:second": eq(originNode, "second_interview"),
  "offer:all": inArray(originNode, ["income_proof", "offer", "background_check"]),
  "offer:background": eq(originNode, "background_check"),
  "offer:income": eq(originNode, "income_proof"),
  "offer:negotiating": and(
    eq(originNode, "offer"),
    or(
      salaryFailure,
      inArray(offerProgress, ["pending", "in_progress", "negotiating", "awaiting_review"]),
    ),
  ),
  "offer:send": and(
    eq(originNode, "offer"),
    sql`${record.closeReason} IS DISTINCT FROM 'salary_disagreement'`,
    inArray(offerProgress, ["awaiting_send", "awaiting_response", "completed"]),
  ),
  "onboarding:all": eq(originNode, "onboarding"),
  "onboarding:hired": and(
    eq(record.pipelineStage, "closed"),
    eq(originNode, "onboarding"),
    eq(record.outcome, "hired"),
  ),
  "onboarding:pending": eq(record.pipelineStage, "onboarding"),
  "onboarding:withdrawn": and(
    eq(record.pipelineStage, "closed"),
    eq(originNode, "onboarding"),
    eq(record.outcome, "withdrawn"),
  ),
  "screening:all": eq(originNode, "screening"),
  "screening:fail": and(
    eq(originNode, "screening"),
    or(eq(record.result, "fail"), eq(record.outcome, "rejected")),
  ),
  "screening:pass": and(eq(originNode, "screening"), eq(record.result, "pass")),
  "screening:pending": and(eq(record.pipelineStage, "screening"), isNull(record.result)),
} satisfies Record<RecruitingBoardStageView, SQL | undefined>;

export function buildRecruitingBoardFilter(view?: RecruitingBoardView): SQL | null {
  const stageView = view ? resolveRecruitingBoardFilterView(view) : undefined;
  return stageView ? (views[stageView] ?? null) : null;
}
