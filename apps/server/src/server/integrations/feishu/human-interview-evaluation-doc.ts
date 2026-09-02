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

// Sync interviewer and template fields; keep full evaluation and submission time in the app.
export function buildHumanInterviewEvaluationBlock(
  input: HumanInterviewDocumentContent,
): FeishuDocumentBlock {
  const suffix = { fail: "（不通过）", inconclusive: "", pass: "（通过）" }[input.outcome];
  const fields = [
    `${input.roundLabel}评价`,
    `面试官：${input.submittedBy}`,
    `评级（A,B,C,D）：${input.evaluation.rating}${suffix}`,
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
