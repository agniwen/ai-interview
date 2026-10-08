import type {
  HumanInterviewEvaluationDraft,
  HumanInterviewRoundOutcome,
} from "@app/db-schema/studio-interviews";

export function aggregateHumanInterviewOutcomes(
  outcomes: (HumanInterviewRoundOutcome | null)[],
): HumanInterviewRoundOutcome {
  return outcomes.find((outcome) => outcome === "pass" || outcome === "fail") ?? "inconclusive";
}

// Keep every person's words attributable. Never ask a model to resolve disagreement.
export function combineHumanInterviewEvaluations(
  rows: {
    evaluation: HumanInterviewEvaluationDraft;
    outcome: HumanInterviewRoundOutcome | null;
    reviewerName: string;
  }[],
): HumanInterviewEvaluationDraft {
  const outcome = aggregateHumanInterviewOutcomes(rows.map((row) => row.outcome));
  const primary = rows.find((row) => row.outcome === outcome) ?? rows[0];
  if (!primary) {
    throw new Error("没有已提交的面试评价");
  }
  const { draftOutcome: _draftOutcome, ...primaryEvaluation } = primary.evaluation;
  if (rows.length === 1) {
    return primaryEvaluation;
  }
  const combine = (key: "overallEvaluation" | "detailedAnalysis" | "strengths" | "risks") =>
    rows.map((row) => `【${row.reviewerName}】\n${row.evaluation[key] || "未填写"}`).join("\n\n");
  return {
    ...primaryEvaluation,
    detailedAnalysis: rows
      .map(
        (row) =>
          `【${row.reviewerName}】\n评级：${row.evaluation.rating ?? "未评级"}\n专业技能：${row.evaluation.professionalSkill || "未填写"}\n角色定位：${row.evaluation.rolePosition || "未填写"}\n薪资建议：${row.evaluation.salaryRecommendation || "未填写"}\n${row.evaluation.detailedAnalysis}`,
      )
      .join("\n\n"),
    evidenceTurnIds: [...new Set(rows.flatMap((row) => row.evaluation.evidenceTurnIds))],
    overallEvaluation: combine("overallEvaluation"),
    risks: combine("risks"),
    strengths: combine("strengths"),
  };
}
