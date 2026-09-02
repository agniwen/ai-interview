import type {
  HumanInterviewEvaluation,
  HumanInterviewRoundOutcome,
} from "@app/db-schema/studio-interviews";
import type { FeishuDocumentBlock } from "./interview-evaluation-doc";

export interface HumanInterviewDocumentContent {
  evaluation: HumanInterviewEvaluation;
  outcome: HumanInterviewRoundOutcome;
  roundLabel: string;
  submittedAt: string;
  submittedBy: string;
}

// Keep submitted wording intact; split long fields into bounded plain-text blocks.
export function buildHumanInterviewEvaluationBlock(
  input: HumanInterviewDocumentContent,
): FeishuDocumentBlock {
  const outcomeLabels = { fail: "未通过", inconclusive: "待定", pass: "通过" };
  const fields = [
    `${input.roundLabel} · 面试官评价`,
    `提交人：${input.submittedBy}　提交时间：${input.submittedAt}`,
    `本轮结论：${outcomeLabels[input.outcome]}`,
    `评级：${input.evaluation.rating}`,
    `整体评价：${input.evaluation.overallEvaluation}`,
    `详细分析：${input.evaluation.detailedAnalysis}`,
    `职级定位：${input.evaluation.seniorityPosition}`,
    `角色定位：${input.evaluation.rolePosition}`,
    `专业技能：${input.evaluation.professionalSkill}`,
    `优势特点：${input.evaluation.strengths}`,
    `劣势风险：${input.evaluation.risks}`,
    `薪资建议：${input.evaluation.salaryRecommendation || "未提供"}`,
  ];
  return {
    block_type: 19,
    callout: { background_color: 4, border_color: 4 },
    children: fields.flatMap((field) => {
      const points = [...field];
      const blocks: FeishuDocumentBlock[] = [];
      for (let offset = 0; offset < points.length; offset += 1000) {
        blocks.push({
          block_type: 2,
          text: {
            elements: [{ text_run: { content: points.slice(offset, offset + 1000).join("") } }],
          },
        });
      }
      return blocks;
    }),
  };
}
