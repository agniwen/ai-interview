import { recruitingRecordReadModel as record } from "@app/database/recruiting-read-model";
import { resolveRecruitingBoardFilterView } from "@app/shared/recruiting-board";
import type { RecruitingBoardStageView, RecruitingBoardView } from "@app/shared/recruiting-board";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

// 已结束记录仍归属结束前的环节，子标签和总数共用同一个 SQL 条件。
const originNode = sql<string>`CASE WHEN ${record.pipelineStage} = 'closed' THEN ${record.closedFromNode} ELSE ${record.pipelineStage} END`;
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
  "offer:all": inArray(originNode, [
    "income_proof",
    "salary_negotiation",
    "offer",
    "background_check",
  ]),
  "offer:background": eq(originNode, "background_check"),
  "offer:income": eq(originNode, "income_proof"),
  "offer:negotiating": eq(originNode, "salary_negotiation"),
  "offer:send": eq(originNode, "offer"),
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
