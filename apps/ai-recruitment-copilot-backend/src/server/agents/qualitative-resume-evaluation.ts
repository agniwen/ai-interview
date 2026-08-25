import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { qualitativeResumeEvaluationV1Schema } from "@arc/db-schema/qualitative-resume-evaluation";
import type { QualitativeResumeEvaluationV1 } from "@arc/db-schema/qualitative-resume-evaluation";
import {
  generateStructuredWithMastraAgent,
  resumeReviewQualitativeAgent,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators";

export const QUALITATIVE_RESUME_PROMPT_VERSION = "qualitative-resume-v1";

export interface QualitativeResumeEvaluationInput {
  evaluationAsOf: string;
  jobDescriptionName: string;
  jobDescriptionPrompt: string;
  resumeProfile: ResumeProfile;
  resumeText: string | null;
}

type QualitativeGenerator = typeof generateStructuredWithMastraAgent;

export function buildQualitativeResumeEvaluationPrompt(
  input: QualitativeResumeEvaluationInput,
): string {
  return `你正在执行候选人简历的六维定性评价。只可使用下面给出的岗位 JD 快照和候选人简历事实，不得引用旧评分配置、硬性规则、权重或任何外部资料。

评价日期：${input.evaluationAsOf}
岗位名称：${input.jobDescriptionName}

岗位 JD 快照：
${input.jobDescriptionPrompt}

候选人结构化简历：
${JSON.stringify(input.resumeProfile)}

候选人简历原文（可能为空）：
${input.resumeText ?? "未提供"}

输出要求：
1. 综合评价等级依次为不推荐、待定、推荐、非常推荐；recommendationLevel 只能映射为：not_recommended=不推荐、undecided=待定、recommended=推荐、highly_recommended=非常推荐。
2. “不推荐”必须有岗位 JD 核心要求与简历明确事实之间的直接冲突。证据缺失、模糊或矛盾时使用“待定”，不得把猜测写成事实。
3. 六个维度均输出高信息密度文本，每项 2–4 句。优先引用简历中的公司、角色、项目、职责、成果、技能和时间等具体事实，并明确这些事实如何符合或不符合岗位要求。
4. 每个维度标注 basis：job 表示只依据岗位要求；general 表示岗位 JD 未提出要求，只能使用审慎的普适职业标准；both 表示两者兼有。普适职业标准不能单独导致“不推荐”，不得对学历、空档期、流动性或个人背景作未经岗位要求支持的偏见判断。
5. conciseOverall 为 1–2 句、约 50–100 个中文字符的综合评价。detailedOverall 必须分别给出判断、匹配证据和风险/待确认点。
6. 六个维度是 skillMatch（技能匹配）、experienceRelevance（经验相关性）、projectMatch（项目匹配）、educationBackground（教育/背景）、potential（潜力）、stability（稳定性）。不要输出任何分数、权重、雷达图数据或条件命中列表。
7. 只有简历事实足以支持时才给 seniorityRecommendation 和 teamPositioning，否则返回 null。`;
}

export function generateQualitativeResumeEvaluation(
  input: QualitativeResumeEvaluationInput,
  generate: QualitativeGenerator = generateStructuredWithMastraAgent,
): Promise<QualitativeResumeEvaluationV1> {
  return generate({
    agent: resumeReviewQualitativeAgent,
    fallbackToTextGeneration: true,
    maxOutputTokens: 4096,
    observabilityLabel: QUALITATIVE_RESUME_PROMPT_VERSION,
    prompt: buildQualitativeResumeEvaluationPrompt(input),
    retryOnInvalid: true,
    retryOnTransient: true,
    schema: qualitativeResumeEvaluationV1Schema,
    temperature: 0,
    timeoutMs: 120_000,
  });
}
